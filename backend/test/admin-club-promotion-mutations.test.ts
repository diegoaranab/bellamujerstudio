import { describe, expect, it, vi } from 'vitest';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHash } from 'node:crypto';
import { createAdminClubPromotionMutationsHandler } from '../src/handlers/admin-club-promotion-mutations';

const id = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-11-21T00:00:00.000Z';
const promotion = { studioId: 'studio', promotionId: id, title: 'Oferta', description: 'Descripción', status: 'active' as const, startsAtISO: '2026-11-22T01:05:00.000Z', endsAtISO: '2026-11-22T02:05:00.000Z', createdAtISO: timestamp, updatedAtISO: timestamp };
const createBody = { title: 'Oferta', description: 'Descripción', status: 'active', startsAtLocal: '2026-11-21T19:05', endsAtLocal: '2026-11-21T20:05' };
const cancel = (...codes: string[]) => ({ name: 'TransactionCanceledException', CancellationReasons: codes.map((Code) => ({ Code })) });
const setup = () => {
  const persistence = { getPromotion: vi.fn().mockResolvedValue(promotion), getPromotionCapacity: vi.fn(), getPromotionCreateIdempotency: vi.fn().mockResolvedValue(undefined), createPromotionOutcome: vi.fn(), updatePromotionOutcome: vi.fn(), deletePromotionOutcome: vi.fn() };
  const uuid = vi.fn().mockReturnValueOnce(id).mockReturnValue(eventId);
  const handler = createAdminClubPromotionMutationsHandler({ persistence, studioId: 'studio', clock: () => new Date(timestamp), uuid, allowedOrigins: [] });
  return { persistence, uuid, handler };
};
const event = (method: 'POST' | 'PATCH' | 'DELETE', body: unknown = createBody): APIGatewayProxyEventV2 => ({ routeKey: `${method} /admin/club/promotions${method === 'POST' ? '' : '/{promotionId}'}`, rawQueryString: '', headers: { 'Idempotency-Key': 'opaque key' }, pathParameters: { promotionId: id.toUpperCase() }, body: JSON.stringify(body), isBase64Encoded: false, requestContext: { requestId: 'request-id', authorizer: { jwt: { claims: { sub: 'admin-sub' } } } } } as unknown as APIGatewayProxyEventV2);
const parsed = (response: { body?: string }) => JSON.parse(response.body ?? '{}');
const token = { expectedUpdatedAtISO: timestamp };

describe('promotion mutation handler', () => {
  it('creates canonical promotion, immutable audit and hashed idempotency evidence', async () => {
    const s = setup(); const response = await s.handler(event('POST'));
    expect(response.statusCode).toBe(201);
    expect(parsed(response)).toEqual({ promotion: (({ studioId: _studio, ...rest }) => rest)(promotion), replayed: false });
    const input = s.persistence.createPromotionOutcome.mock.calls[0][0];
    expect(input.audit).toEqual({ studioId: 'studio', eventId, promotionId: id, operation: 'CREATE', occurredAtISO: timestamp, adminSub: 'admin-sub', requestId: 'request-id', afterPromotion: promotion });
    expect(input.idempotency).toEqual({ studioId: 'studio', keyHash: createHash('sha256').update('opaque key').digest('hex'), requestFingerprint: createHash('sha256').update(JSON.stringify({ studioId: 'studio', title: 'Oferta', description: 'Descripción', status: 'active', startsAtISO: promotion.startsAtISO, endsAtISO: promotion.endsAtISO })).digest('hex'), promotionId: id, createdAtISO: timestamp, creationResult: promotion });
    expect(JSON.stringify(input)).not.toContain('opaque key');
  });
  it('replays the stored creation result, including after an uncertain transaction', async () => {
    const initial = setup(); await initial.handler(event('POST')); const record = initial.persistence.createPromotionOutcome.mock.calls[0][0].idempotency;
    const s = setup(); s.persistence.getPromotionCreateIdempotency.mockResolvedValueOnce(undefined).mockResolvedValueOnce(record); s.persistence.createPromotionOutcome.mockRejectedValue(new Error('uncertain'));
    const response = await s.handler(event('POST')); expect(response.statusCode).toBe(200); expect(parsed(response).replayed).toBe(true); expect(s.persistence.getPromotionCreateIdempotency).toHaveBeenCalledTimes(2);
    const replay = setup(); replay.persistence.getPromotionCreateIdempotency.mockResolvedValue(record); expect((await replay.handler(event('POST'))).statusCode).toBe(200); expect(replay.uuid).not.toHaveBeenCalled();
    replay.persistence.getPromotionCreateIdempotency.mockResolvedValue({ ...record, requestFingerprint: 'different' }); expect(parsed(await replay.handler(event('POST'))).error).toBe('IDEMPOTENCY_CONFLICT');
  });
  it.each([[undefined, 500], [{ state: 'READY', count: 99 }, 500], [{ state: 'READY', count: 100 }, 409]])('classifies capacity failure only with verified capacity %j', async (capacity, status) => {
    const s = setup(); s.persistence.createPromotionOutcome.mockRejectedValue(cancel('None', 'ConditionalCheckFailed', 'None', 'None')); s.persistence.getPromotionCapacity.mockResolvedValue(capacity); const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await s.handler(event('POST'))).statusCode).toBe(status); log.mockRestore();
  });
  it('updates partial content with a strictly later timestamp and exact audit', async () => {
    const s = setup(); const response = await s.handler(event('PATCH', { ...token, title: 'Nueva' })); expect(response.statusCode).toBe(200);
    const input = s.persistence.updatePromotionOutcome.mock.calls[0][0]; expect(input.afterPromotion).toEqual({ ...promotion, title: 'Nueva', updatedAtISO: '2026-11-21T00:00:00.001Z' }); expect(input.audit).toMatchObject({ operation: 'UPDATE', beforePromotion: promotion, afterPromotion: input.afterPromotion, occurredAtISO: input.afterPromotion.updatedAtISO }); expect(s.persistence.getPromotion).toHaveBeenCalledWith('studio', id);
  });
  it('preserves semantic no-ops and rejects partial schedules and stale versions', async () => {
    const s = setup(); expect((await s.handler(event('PATCH', { ...token, title: 'Oferta' }))).statusCode).toBe(200); expect(s.persistence.updatePromotionOutcome).not.toHaveBeenCalled();
    expect((await s.handler(event('PATCH', { ...token, startsAtLocal: createBody.startsAtLocal }))).statusCode).toBe(400);
    expect((await s.handler(event('PATCH', { expectedUpdatedAtISO: '2026-11-20T00:00:00.000Z', status: 'inactive' }))).statusCode).toBe(409);
  });
  it('deletes with before-image and returns only the public identifier', async () => {
    const s = setup(); const response = await s.handler(event('DELETE', token)); expect(parsed(response)).toEqual({ deleted: true, promotionId: id }); expect(s.persistence.deletePromotionOutcome.mock.calls[0][0].audit).toEqual({ studioId: 'studio', eventId: id, promotionId: id, operation: 'DELETE', occurredAtISO: timestamp, adminSub: 'admin-sub', requestId: 'request-id', beforePromotion: promotion });
  });
  it.each([['PATCH', ['ConditionalCheckFailed', 'None'], 409], ['PATCH', ['None', 'TransactionConflict'], 409], ['PATCH', ['None', 'ConditionalCheckFailed'], 500], ['DELETE', ['ConditionalCheckFailed', 'None', 'None'], 409], ['DELETE', ['None', 'ConditionalCheckFailed', 'None'], 500], ['DELETE', ['None', 'None', 'ConditionalCheckFailed'], 500], ['DELETE', ['None'], 500]] as const)('classifies %s cancellation %j', async (method, reasons, status) => {
    const s = setup(); (method === 'PATCH' ? s.persistence.updatePromotionOutcome : s.persistence.deletePromotionOutcome).mockRejectedValue(cancel(...reasons)); const log = vi.spyOn(console, 'error').mockImplementation(() => undefined); expect((await s.handler(event(method, method === 'PATCH' ? { ...token, title: 'Nueva' } : token))).statusCode).toBe(status); log.mockRestore();
  });
  it('rejects malformed boundary requests before persistence', async () => {
    const s = setup(); const unsupported = event('POST'); unsupported.routeKey = 'GET /admin/club/promotions'; expect((await s.handler(unsupported)).statusCode).toBe(404);
    const query = event('POST'); query.rawQueryString = 'x=1'; expect((await s.handler(query)).statusCode).toBe(400);
    const huge = event('POST'); huge.body = 'x'.repeat(32769); expect((await s.handler(huge)).statusCode).toBe(413);
    const badId = event('PATCH', token); badId.pathParameters = { promotionId: 'bad' }; expect((await s.handler(badId)).statusCode).toBe(400);
    const missingAdmin = event('POST'); (missingAdmin.requestContext as any).authorizer.jwt.claims.sub = ''; expect((await s.handler(missingAdmin)).statusCode).toBe(400);
    const invalidRequest = event('POST'); invalidRequest.requestContext.requestId = 'bad#id'; const log = vi.spyOn(console, 'error').mockImplementation(() => undefined); expect((await s.handler(invalidRequest)).statusCode).toBe(500); log.mockRestore(); expect(s.persistence.getPromotionCreateIdempotency).not.toHaveBeenCalled();
  });
  it('accepts base64 and does not log sensitive error content', async () => {
    const s = setup(); const e = event('POST'); e.body = Buffer.from(e.body!).toString('base64'); e.isBase64Encoded = true; s.persistence.createPromotionOutcome.mockRejectedValue(new Error('secret Oferta opaque key admin-sub')); const log = vi.spyOn(console, 'error').mockImplementation(() => undefined); expect((await s.handler(e)).statusCode).toBe(500); expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|Oferta|opaque key|admin-sub/); log.mockRestore();
  });
  it.each([
    ['PATCH', { ...token, status: 'inactive' }],
    ['PATCH', { ...token, startsAtLocal: '2026-12-01T10:00', endsAtLocal: '2026-12-01T11:00' }]
  ] as const)('accepts other editable %s fields', async (method, body) => {
    const s = setup(); expect((await s.handler(event(method, body))).statusCode).toBe(200); expect(s.persistence.updatePromotionOutcome).toHaveBeenCalledOnce();
  });
  it.each([
    ['PATCH', token], ['PATCH', { ...token, title: 'x', unknown: true }],
    ['PATCH', { expectedUpdatedAtISO: '2026-11-21T00:00:00Z', title: 'x' }],
    ['DELETE', { ...token, extra: true }], ['POST', { ...createBody, status: 'wrong' }]
  ] as const)('rejects invalid %s DTO', async (method, body) => {
    const s = setup(); expect((await s.handler(event(method, body))).statusCode).toBe(400); expect(s.persistence.createPromotionOutcome).not.toHaveBeenCalled(); expect(s.persistence.updatePromotionOutcome).not.toHaveBeenCalled(); expect(s.persistence.deletePromotionOutcome).not.toHaveBeenCalled();
  });
  it.each(['PATCH', 'DELETE'] as const)('returns not found or conflict for %s before transaction', async (method) => {
    const s = setup(); const body = method === 'PATCH' ? { ...token, title: 'Nueva' } : token;
    s.persistence.getPromotion.mockResolvedValueOnce(undefined); expect(parsed(await s.handler(event(method, body))).error).toBe('PROMOTION_NOT_FOUND');
    s.persistence.getPromotion.mockResolvedValueOnce({ ...promotion, updatedAtISO: '2026-11-22T00:00:00.000Z' }); expect(parsed(await s.handler(event(method, body))).error).toBe('PROMOTION_CONFLICT');
    expect(s.persistence.updatePromotionOutcome).not.toHaveBeenCalled(); expect(s.persistence.deletePromotionOutcome).not.toHaveBeenCalled();
  });
  it('returns a conflict when uncertain creation leaves a different durable fingerprint', async () => {
    const s = setup(); s.persistence.getPromotionCreateIdempotency.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ requestFingerprint: 'other' }); s.persistence.createPromotionOutcome.mockRejectedValue(new Error('uncertain'));
    expect(parsed(await s.handler(event('POST'))).error).toBe('IDEMPOTENCY_CONFLICT');
  });
  it('rejects invalid generated IDs safely before mutation', async () => {
    const s = setup(); s.uuid.mockReset().mockReturnValue('NOT-A-UUID'); const log = vi.spyOn(console, 'error').mockImplementation(() => undefined); expect((await s.handler(event('POST'))).statusCode).toBe(500); expect(s.persistence.createPromotionOutcome).not.toHaveBeenCalled(); log.mockRestore();
  });

});
