import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { ClubPromotion } from '../src/club/club-model';
import {
  ClubPromotionsReadPersistence,
  createAdminClubPromotionsHandler
} from '../src/handlers/admin-club-promotions';

const id = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-11-09T18:00:00.000Z';
const promotion = (overrides: Partial<ClubPromotion> = {}): ClubPromotion => ({
  studioId: 'bella-mujer', promotionId: id, title: 'Oferta privada', description: 'Descripción privada',
  status: 'active', startsAtISO: timestamp, endsAtISO: '2027-01-01T00:00:00.000Z',
  createdAtISO: timestamp, updatedAtISO: timestamp, ...overrides
});

const listEvent = (extra: Record<string, unknown> = {}): APIGatewayProxyEventV2 => ({
  routeKey: 'GET /admin/club/promotions', rawQueryString: '', headers: {},
  requestContext: { requestId: 'api-request-id' }, ...extra
}) as unknown as APIGatewayProxyEventV2;

const detailEvent = (promotionId: string | undefined = id, extra: Record<string, unknown> = {}): APIGatewayProxyEventV2 => ({
  routeKey: 'GET /admin/club/promotions/{promotionId}', rawQueryString: '', headers: {},
  ...(promotionId === undefined ? {} : { pathParameters: { promotionId } }),
  requestContext: { requestId: 'api-request-id' }, ...extra
}) as unknown as APIGatewayProxyEventV2;

const dtoKeys = [
  'promotionId', 'title', 'description', 'status', 'startsAtISO', 'endsAtISO', 'createdAtISO', 'updatedAtISO'
].sort();

const setup = (items: ClubPromotion[] = [promotion()]) => {
  const listPromotions = vi.fn<ClubPromotionsReadPersistence['listPromotions']>().mockResolvedValue(items);
  const getPromotion = vi.fn<ClubPromotionsReadPersistence['getPromotion']>().mockResolvedValue(items[0]);
  const handler = createAdminClubPromotionsHandler({
    persistence: { listPromotions, getPromotion }, studioId: 'bella-mujer', allowedOrigins: []
  });
  return { handler, listPromotions, getPromotion };
};

describe('administrative Club promotion read handler', () => {
  it('returns a normal empty catalog and calls persistence once with the configured studio', async () => {
    const { handler, listPromotions } = setup([]);
    const response = await handler(listEvent());
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual({ items: [] });
    expect(listPromotions).toHaveBeenCalledOnce();
    expect(listPromotions).toHaveBeenCalledWith('bella-mujer');
  });

  it('lists every returned promotion in persistence order using exact narrow DTO keys', async () => {
    const rows = [
      promotion({ status: 'inactive', title: 'Inactive' }),
      promotion({ promotionId: '22222222-2222-4222-8222-222222222222', title: 'Future', startsAtISO: '2030-01-01T00:00:00.000Z' }),
      promotion({ promotionId: '33333333-3333-4333-8333-333333333333', title: 'Expired', endsAtISO: '2020-01-01T00:00:00.000Z' })
    ];
    const { handler, listPromotions } = setup(rows);
    const response = await handler(listEvent());
    const body = JSON.parse(response.body ?? '{}');
    expect(response.statusCode).toBe(200);
    expect(body.items.map((item: { title: string }) => item.title)).toEqual(['Inactive', 'Future', 'Expired']);
    expect(listPromotions).toHaveBeenCalledOnce();
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(dtoKeys);
      expect(item).not.toHaveProperty('studioId');
      expect(item).not.toHaveProperty('pk');
      expect(item).not.toHaveProperty('sk');
      expect(item).not.toHaveProperty('entityType');
      expect(item).not.toHaveProperty('capacity');
      expect(item).not.toHaveProperty('audit');
      expect(item).not.toHaveProperty('idempotency');
    }
  });

  it.each([
    ['studioId', 'other'], ['clientId', 'x'], ['limit', '10'], ['nextToken', 'x'], ['unknown', 'x']
  ])('rejects list query parameter %s before persistence', async (key, value) => {
    const { handler, listPromotions } = setup();
    const response = await handler(listEvent({ rawQueryString: `${key}=${value}`, queryStringParameters: { [key]: value } }));
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body ?? '{}').error).toBe('VALIDATION_ERROR');
    expect(response.body).not.toContain(value);
    expect(listPromotions).not.toHaveBeenCalled();
  });

  it('rejects query parameter keys even when raw query text is empty', async () => {
    const { handler, listPromotions } = setup();
    expect((await handler(listEvent({ queryStringParameters: { extra: '' } }))).statusCode).toBe(400);
    expect(listPromotions).not.toHaveBeenCalled();
  });

  it('returns detail using lowercase ID and exact DTO keys', async () => {
    const { handler, getPromotion } = setup();
    const response = await handler(detailEvent(id.toUpperCase()));
    const body = JSON.parse(response.body ?? '{}');
    expect(response.statusCode).toBe(200);
    expect(getPromotion).toHaveBeenCalledOnce();
    expect(getPromotion).toHaveBeenCalledWith('bella-mujer', id);
    expect(Object.keys(body.promotion).sort()).toEqual(dtoKeys);
    for (const field of ['studioId', 'pk', 'sk', 'entityType', 'capacity', 'audit', 'idempotency']) {
      expect(body.promotion).not.toHaveProperty(field);
    }
  });

  it('returns the stable not-found response without listing', async () => {
    const { handler, getPromotion, listPromotions } = setup();
    getPromotion.mockResolvedValue(undefined);
    const response = await handler(detailEvent());
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      error: 'PROMOTION_NOT_FOUND', message: 'No encontramos la promoción solicitada.'
    });
    expect(getPromotion).toHaveBeenCalledOnce();
    expect(listPromotions).not.toHaveBeenCalled();
  });

  it.each([undefined, 'not-an-id', '11111111-1111-1111-8111-111111111111', ` ${id}`, `${id} `,
    'PROMOTION#11111111-1111-4111-8111-111111111111', '', 'selector#value'])
  ('rejects unsafe detail ID %j before persistence', async (pathId) => {
    const { handler, getPromotion } = setup();
    const event = pathId === undefined ? detailEvent(id, { pathParameters: undefined }) : detailEvent(pathId);
    expect((await handler(event)).statusCode).toBe(400);
    expect(getPromotion).not.toHaveBeenCalled();
  });

  it.each([
    ['studioId', 'other'], ['clientId', 'x'], ['limit', '10'], ['nextToken', 'x'], ['unknown', 'x']
  ])('rejects detail query parameter %s before persistence', async (key, value) => {
    const { handler, getPromotion } = setup();
    const response = await handler(detailEvent(id, { rawQueryString: `${key}=${value}`, queryStringParameters: { [key]: value } }));
    expect(response.statusCode).toBe(400);
    expect(getPromotion).not.toHaveBeenCalled();
  });

  it('rejects id as an alternate route selector', async () => {
    const { handler, getPromotion } = setup();
    const event = detailEvent(undefined, { pathParameters: { id } });
    expect((await handler(event)).statusCode).toBe(400);
    expect(getPromotion).not.toHaveBeenCalled();
  });

  it('fails unsupported route shapes safely without persistence', async () => {
    const { handler, listPromotions, getPromotion } = setup();
    const response = await handler(listEvent({ routeKey: 'POST /admin/club/promotions' }));
    expect(response.statusCode).toBe(404);
    expect(listPromotions).not.toHaveBeenCalled();
    expect(getPromotion).not.toHaveBeenCalled();
  });

  it.each(['list', 'detail'])('returns a safe 500 and logs only request and AWS metadata on %s failure', async (kind) => {
    const secret = 'Offer title, sensitive description, raw private error';
    const error = Object.assign(new Error(secret), {
      $metadata: { requestId: 'aws-request-id', httpStatusCode: 503 }
    });
    const { handler, listPromotions, getPromotion } = setup();
    if (kind === 'list') listPromotions.mockRejectedValue(error);
    else getPromotion.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await handler(kind === 'list' ? listEvent() : detailEvent());
    const logged = JSON.stringify(log.mock.calls);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? '{}').error).toBe('SERVER_ERROR');
    expect(logged).toContain('api-request-id');
    expect(logged).toContain('aws-request-id');
    expect(logged).toContain('503');
    expect(logged).not.toContain(secret);
    log.mockRestore();
  });
});
