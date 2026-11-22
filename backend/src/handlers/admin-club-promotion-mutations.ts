import { createHash, randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { validateKeySegment } from '../club/club-keys';
import { ClubPromotion, PromotionAuditEntry, PromotionCapacity, PromotionCreateIdempotency, validateClubPromotion } from '../club/club-model';
import { CreatePromotionOutcomeInput, DeletePromotionOutcomeInput, DynamoClubPersistence, UpdatePromotionOutcomeInput } from '../club/club-persistence';
import { promotionLocalIntervalToCanonicalISO } from '../club/promotion-admin-time';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import { jsonResponse, payloadTooLargeResponse, serverErrorResponse, validationErrorResponse } from '../shared/response';
import { Clock, currentDate, currentISO } from '../shared/time';

export interface PromotionMutationPersistence {
  getPromotion(studioId: string, promotionId: string): Promise<ClubPromotion | undefined>;
  getPromotionCapacity(studioId: string): Promise<PromotionCapacity | undefined>;
  getPromotionCreateIdempotency(studioId: string, keyHash: string): Promise<PromotionCreateIdempotency | undefined>;
  createPromotionOutcome(input: CreatePromotionOutcomeInput): Promise<void>;
  updatePromotionOutcome(input: UpdatePromotionOutcomeInput): Promise<void>;
  deletePromotionOutcome(input: DeletePromotionOutcomeInput): Promise<void>;
}
export interface AdminClubPromotionMutationsDependencies {
  persistence: PromotionMutationPersistence;
  studioId: string;
  clock?: Clock;
  uuid?: () => string;
  allowedOrigins?: readonly string[];
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const editable = ['title', 'description', 'status', 'startsAtLocal', 'endsAtLocal'];
const opaque = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.trim() === v && Array.from(v).length <= 256 && !CONTROL.test(v);
const canonical = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const hash = (v: string): string => createHash('sha256').update(v).digest('hex');
const dto = (p: ClubPromotion) => ({ promotionId: p.promotionId, title: p.title, description: p.description, status: p.status, startsAtISO: p.startsAtISO, endsAtISO: p.endsAtISO, createdAtISO: p.createdAtISO, updatedAtISO: p.updatedAtISO });
const codes = (error: unknown, length: number): string[] | undefined => {
  if (!error || typeof error !== 'object' || !('name' in error) || error.name !== 'TransactionCanceledException' || !('CancellationReasons' in error) || !Array.isArray(error.CancellationReasons) || error.CancellationReasons.length !== length) return undefined;
  const values: unknown[] = error.CancellationReasons.map((r: unknown) => r && typeof r === 'object' && 'Code' in r ? r.Code : undefined);
  return values.every((v) => typeof v === 'string') ? values as string[] : undefined;
};
const conditional = (c: string[] | undefined, index: number): boolean => !!c && c.every((v, i) => v === (i === index ? 'ConditionalCheckFailed' : 'None'));
const concurrent = (c: string[] | undefined): boolean => !!c && c.includes('TransactionConflict') && c.every((v) => v === 'None' || v === 'TransactionConflict');

export const createAdminClubPromotionMutationsHandler = ({ persistence, studioId, clock = currentDate, uuid = randomUUID, allowedOrigins = originsFromEnvironment() }: AdminClubPromotionMutationsDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers?.origin;
    const route = event.routeKey;
    const create = route === 'POST /admin/club/promotions';
    const update = route === 'PATCH /admin/club/promotions/{promotionId}';
    const remove = route === 'DELETE /admin/club/promotions/{promotionId}';
    const respond = (status: number, body: unknown) => jsonResponse(status, body, origin, allowedOrigins);
    const invalid = () => validationErrorResponse(origin, allowedOrigins);
    if (!create && !update && !remove) return respond(404, { error: 'NOT_FOUND', message: 'No encontramos la solicitud.' });
    if (event.rawQueryString || Object.keys(event.queryStringParameters ?? {}).length) return invalid();
    if (event.body && Buffer.byteLength(event.body, event.isBase64Encoded ? 'base64' : 'utf8') > 32 * 1024) return payloadTooLargeResponse(origin, allowedOrigins);
    const rawId = event.pathParameters?.promotionId;
    if (!create && (typeof rawId !== 'string' || !UUID.test(rawId.toLowerCase()))) return invalid();
    const promotionId = rawId?.toLowerCase();
    const claims = (event.requestContext as unknown as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } })?.authorizer?.jwt?.claims;
    if (!opaque(claims?.sub)) return invalid();
    const adminSub = claims.sub;
    let body: Record<string, unknown>;
    let keyHash = '';
    let interval: { startsAtISO: string; endsAtISO: string } | undefined;
    try {
      const parsed: unknown = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body ?? '');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid();
      body = parsed as Record<string, unknown>;
      const keys = Object.keys(body);
      if (create) {
        if (keys.length !== editable.length || keys.some((k) => !editable.includes(k))) return invalid();
        const headers = Object.entries(event.headers ?? {}).filter(([k]) => k.toLowerCase() === 'idempotency-key');
        if (headers.length !== 1 || !opaque(headers[0][1])) return invalid();
        keyHash = hash(headers[0][1]);
      } else {
        if (!canonical(body.expectedUpdatedAtISO) || keys.some((k) => k !== 'expectedUpdatedAtISO' && (!update || !editable.includes(k)))) return invalid();
        if (update && !keys.some((k) => editable.includes(k))) return invalid();
      }
      if (create || update) {
        const start = Object.hasOwn(body, 'startsAtLocal');
        const end = Object.hasOwn(body, 'endsAtLocal');
        if (start !== end) return invalid();
        if (start) interval = promotionLocalIntervalToCanonicalISO(body.startsAtLocal as string, body.endsAtLocal as string);
        // Validate supplied fields through the domain validator, including partial updates.
        validateClubPromotion({ studioId, promotionId: '00000000-0000-4000-8000-000000000001', title: (Object.hasOwn(body, 'title') ? body.title : 'x') as string, description: (Object.hasOwn(body, 'description') ? body.description : 'x') as string, status: (Object.hasOwn(body, 'status') ? body.status : 'inactive') as ClubPromotion['status'], startsAtISO: interval?.startsAtISO ?? '2026-01-01T00:00:00.000Z', endsAtISO: interval?.endsAtISO ?? '2027-01-01T00:00:00.000Z', createdAtISO: '2026-01-01T00:00:00.000Z', updatedAtISO: '2026-01-01T00:00:00.000Z' });
      }
    } catch { return invalid(); }
    const operation = create ? 'create-promotion' : update ? 'update-promotion' : 'delete-promotion';
    const fail = (error: unknown) => {
      const metadata = error && typeof error === 'object' && '$metadata' in error ? error.$metadata as { requestId?: unknown; httpStatusCode?: unknown } : undefined;
      console.error('Administrative Club promotion mutation failed', { operation, apiRequestId: event.requestContext?.requestId, ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}), ...(typeof metadata?.httpStatusCode === 'number' ? { awsHttpStatusCode: metadata.httpStatusCode } : {}) });
      return serverErrorResponse(origin, allowedOrigins);
    };
    const conflict = () => respond(409, { error: 'PROMOTION_CONFLICT', message: 'La promoción cambió mientras se procesaba la solicitud. Recarga e intenta de nuevo.' });
    const requestId = event.requestContext?.requestId;
    try { validateKeySegment('requestId', requestId); } catch (error) { return fail(error); }
    const newId = () => { const id = uuid(); if (typeof id !== 'string' || !UUID.test(id)) throw new Error('Invalid generated ID'); return id; };
    const now = () => { const value = currentISO(clock); if (!canonical(value)) throw new Error('Invalid clock'); return value; };
    try {
      if (create) {
        const fingerprint = hash(JSON.stringify({ studioId, title: body.title, description: body.description, status: body.status, startsAtISO: interval!.startsAtISO, endsAtISO: interval!.endsAtISO }));
        const replay = (record: PromotionCreateIdempotency) => record.requestFingerprint === fingerprint
          ? respond(200, { promotion: dto(record.creationResult), replayed: true })
          : respond(409, { error: 'IDEMPOTENCY_CONFLICT', message: 'La clave de idempotencia ya fue utilizada para otra creación de promoción.' });
        const prior = await persistence.getPromotionCreateIdempotency(studioId, keyHash);
        if (prior) return replay(prior);
        const timestamp = now();
        const promotion: ClubPromotion = { studioId, promotionId: newId(), title: body.title as string, description: body.description as string, status: body.status as ClubPromotion['status'], ...interval!, createdAtISO: timestamp, updatedAtISO: timestamp };
        validateClubPromotion(promotion);
        const idempotency: PromotionCreateIdempotency = { studioId, keyHash, requestFingerprint: fingerprint, promotionId: promotion.promotionId, createdAtISO: timestamp, creationResult: promotion };
        const audit: PromotionAuditEntry = { studioId, eventId: newId(), promotionId: promotion.promotionId, operation: 'CREATE', occurredAtISO: timestamp, adminSub, requestId, afterPromotion: promotion };
        try { await persistence.createPromotionOutcome({ promotion, capacityMutation: { studioId }, idempotency, audit }); }
        catch (error) {
          const durable = await persistence.getPromotionCreateIdempotency(studioId, keyHash);
          if (durable) return replay(durable);
          if (conditional(codes(error, 4), 1)) {
            const capacity = await persistence.getPromotionCapacity(studioId);
            if (capacity?.state === 'READY' && capacity.count === 100) return respond(409, { error: 'PROMOTION_CATALOG_FULL', message: 'El catálogo de promociones alcanzó el límite permitido.' });
          }
          return fail(error);
        }
        return respond(201, { promotion: dto(promotion), replayed: false });
      }
      const existing = await persistence.getPromotion(studioId, promotionId!);
      if (!existing) return respond(404, { error: 'PROMOTION_NOT_FOUND', message: 'No encontramos la promoción solicitada.' });
      const expectedUpdatedAtISO = body.expectedUpdatedAtISO as string;
      if (existing.updatedAtISO !== expectedUpdatedAtISO) return conflict();
      if (update) {
        const next: ClubPromotion = { ...existing, ...(Object.hasOwn(body, 'title') ? { title: body.title as string } : {}), ...(Object.hasOwn(body, 'description') ? { description: body.description as string } : {}), ...(Object.hasOwn(body, 'status') ? { status: body.status as ClubPromotion['status'] } : {}), ...interval };
        validateClubPromotion(next);
        if (['title', 'description', 'status', 'startsAtISO', 'endsAtISO'].every((k) => next[k as keyof ClubPromotion] === existing[k as keyof ClubPromotion])) return respond(200, { promotion: dto(existing) });
        const candidate = now();
        next.updatedAtISO = candidate > expectedUpdatedAtISO ? candidate : new Date(Date.parse(expectedUpdatedAtISO) + 1).toISOString();
        if (!canonical(next.updatedAtISO)) throw new Error('Invalid updated timestamp');
        const audit: PromotionAuditEntry = { studioId, eventId: newId(), promotionId: existing.promotionId, operation: 'UPDATE', occurredAtISO: next.updatedAtISO, adminSub, requestId, beforePromotion: existing, afterPromotion: next };
        try { await persistence.updatePromotionOutcome({ beforePromotion: existing, afterPromotion: next, expectedUpdatedAtISO, audit }); }
        catch (error) { const c = codes(error, 2); if (conditional(c, 0) || concurrent(c)) return conflict(); return fail(error); }
        return respond(200, { promotion: dto(next) });
      }
      const audit: PromotionAuditEntry = { studioId, eventId: newId(), promotionId: existing.promotionId, operation: 'DELETE', occurredAtISO: now(), adminSub, requestId, beforePromotion: existing };
      try { await persistence.deletePromotionOutcome({ beforePromotion: existing, expectedUpdatedAtISO, capacityMutation: { studioId }, audit }); }
      catch (error) { const c = codes(error, 3); if (conditional(c, 0) || concurrent(c)) return conflict(); return fail(error); }
      return respond(200, { deleted: true, promotionId });
    } catch (error) { return fail(error); }
  };

const tableName = process.env.CLUB_TABLE_NAME;
const runtimeStudioId = process.env.CLUB_STUDIO_ID;
const unavailable = async (): Promise<never> => { throw new Error('Club table is not configured'); };
const runtimePersistence: PromotionMutationPersistence = tableName && runtimeStudioId ? new DynamoClubPersistence(new DynamoDBClient({}), tableName) : { getPromotion: unavailable, getPromotionCapacity: unavailable, getPromotionCreateIdempotency: unavailable, createPromotionOutcome: unavailable, updatePromotionOutcome: unavailable, deletePromotionOutcome: unavailable };
export const handler = createAdminClubPromotionMutationsHandler({ persistence: runtimePersistence, studioId: runtimeStudioId ?? '' });
