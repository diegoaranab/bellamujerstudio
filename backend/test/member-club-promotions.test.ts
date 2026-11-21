import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { ClubPromotion, validateClubPromotion } from '../src/club/club-model';
import { clubPromotionFromDynamoItem, clubPromotionToDynamoItem, DynamoClubPersistence } from '../src/club/club-persistence';
import { createMemberClubPromotionsHandler } from '../src/handlers/member-club-promotions';

const promotion = (n = 1): ClubPromotion => ({
  studioId: 'bella-mujer', promotionId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  title: 'Oferta', description: 'Texto\nsegunda línea', status: 'active',
  startsAtISO: '2026-01-01T00:00:00.000Z', endsAtISO: '2027-01-01T00:00:00.000Z',
  createdAtISO: '2026-01-01T00:00:00.000Z', updatedAtISO: '2026-01-01T00:00:00.000Z'
});
const event = { rawQueryString: '', requestContext: { requestId: 'request', authorizer: { lambda: { studioId: 'bella-mujer', clientId: 'client' } } } } as unknown as APIGatewayProxyEventV2;
const instant = () => new Date('2026-06-01T00:00:00.000Z');

describe('promotions domain and catalog', () => {
  it('round trips canonical records and keys', () => {
    const item = clubPromotionToDynamoItem(promotion());
    expect(item.pk.S).toBe('STUDIO#bella-mujer#PROMOTIONS');
    expect(item.sk.S).toBe(`PROMOTION#${promotion().promotionId}`);
    expect(clubPromotionFromDynamoItem(item)).toEqual(promotion());
    expect(() => clubPromotionFromDynamoItem({ ...item, extra: { S: 'x' } })).toThrow();
    expect(() => clubPromotionFromDynamoItem({ ...item, sk: { S: 'PROMOTION#bad' } })).toThrow();
  });
  it.each([
    { promotionId: '00000000-0000-1000-8000-000000000001' }, { promotionId: 'AAAAAAAA-0000-4000-8000-000000000001' },
    { title: '' }, { title: 'x'.repeat(101) }, { title: ' x' }, { title: 'x\ny' },
    { description: 'x'.repeat(501) }, { description: 'a\rb' }, { status: 'unknown' },
    { startsAtISO: '2026-01-01T00:00:00Z' }, { startsAtISO: '2027-01-01T00:00:00.000Z' },
    { updatedAtISO: '2025-01-01T00:00:00.000Z' }
  ])('rejects invalid domain fields %o', (change) => expect(() => validateClubPromotion({ ...promotion(), ...change } as ClubPromotion)).toThrow());
  it('accepts Unicode boundaries and LF', () => {
    expect(validateClubPromotion({ ...promotion(), title: '🌹'.repeat(100), description: 'x'.repeat(499) + 'y' })).toBeDefined();
    expect(validateClubPromotion(promotion())).toBeDefined();
  });
  it('uses a bounded consistent query and follows early pages', async () => {
    const first = clubPromotionToDynamoItem(promotion(1));
    const second = clubPromotionToDynamoItem(promotion(2));
    const send = vi.fn().mockResolvedValueOnce({ Items: [first], LastEvaluatedKey: { pk: first.pk, sk: first.sk } }).mockResolvedValueOnce({ Items: [second] });
    const db = new DynamoClubPersistence({ send } as unknown as DynamoDBClient, 'table');
    expect(await db.listPromotions('bella-mujer')).toHaveLength(2);
    expect(send.mock.calls[0][0]).toBeInstanceOf(QueryCommand);
    expect(send.mock.calls[0][0].input).toMatchObject({ ConsistentRead: true, Limit: 101 });
    expect(send.mock.calls[0][0].input.FilterExpression).toBeUndefined();
    expect(send.mock.calls[1][0].input.Limit).toBe(100);
  });
  it('accepts 100 and rejects 101 without partial results', async () => {
    const send = vi.fn(); const db = new DynamoClubPersistence({ send } as unknown as DynamoDBClient, 'table');
    send.mockResolvedValueOnce({ Items: Array.from({ length: 100 }, (_, i) => clubPromotionToDynamoItem(promotion(i + 1))) });
    expect(await db.listPromotions('bella-mujer')).toHaveLength(100);
    send.mockResolvedValueOnce({ Items: Array.from({ length: 101 }, (_, i) => clubPromotionToDynamoItem(promotion(i + 1))) });
    await expect(db.listPromotions('bella-mujer')).rejects.toThrow();
  });
  it('fails closed after 101 advancing empty pages', async () => {
    let count = 0;
    const send = vi.fn().mockImplementation(async () => {
      const row = clubPromotionToDynamoItem(promotion(++count));
      return { Items: [], LastEvaluatedKey: { pk: row.pk, sk: row.sk } };
    });
    const db = new DynamoClubPersistence({ send } as unknown as DynamoDBClient, 'table');
    await expect(db.listPromotions('bella-mujer')).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(101);
  });
  it('rejects stalled, malformed cursors and malformed later records', async () => {
    const row = clubPromotionToDynamoItem(promotion()); const key = { pk: row.pk, sk: row.sk };
    const send = vi.fn().mockResolvedValueOnce({ Items: [row], LastEvaluatedKey: key }).mockResolvedValueOnce({ Items: [], LastEvaluatedKey: key });
    const db = new DynamoClubPersistence({ send } as unknown as DynamoDBClient, 'table');
    await expect(db.listPromotions('bella-mujer')).rejects.toThrow();
    send.mockResolvedValueOnce({ LastEvaluatedKey: { pk: row.pk, sk: { S: 'bad' } } });
    await expect(db.listPromotions('bella-mujer')).rejects.toThrow();
    send.mockResolvedValueOnce({ Items: [row], LastEvaluatedKey: key }).mockResolvedValueOnce({ Items: [{ ...row, title: { N: '1' } }] });
    await expect(db.listPromotions('bella-mujer')).rejects.toThrow();
  });
});

describe('member promotions handler', () => {
  it('selects the latest active start and smallest ID and returns minimal data', async () => {
    const listPromotions = vi.fn().mockResolvedValue([promotion(4), { ...promotion(3), startsAtISO: '2026-05-01T00:00:00.000Z' }, { ...promotion(2), startsAtISO: '2026-05-01T00:00:00.000Z' }, { ...promotion(1), status: 'inactive' }]);
    const now = vi.fn(instant); const result = await createMemberClubPromotionsHandler({ persistence: { listPromotions }, now })(event);
    expect(now).toHaveBeenCalledOnce(); expect(listPromotions).toHaveBeenCalledWith('bella-mujer');
    expect(result.headers?.['Cache-Control']).toBe('no-store');
    expect(JSON.parse(result.body!)).toEqual({ promotion: { title: 'Oferta', description: 'Texto\nsegunda línea', startsAtISO: '2026-05-01T00:00:00.000Z', endsAtISO: '2027-01-01T00:00:00.000Z' } });
  });
  it.each([
    [[], null], [[{ ...promotion(), status: 'inactive' }], null],
    [[{ ...promotion(), startsAtISO: '2026-06-02T00:00:00.000Z' }], null],
    [[{ ...promotion(), endsAtISO: '2026-06-01T00:00:00.000Z' }], null],
    [[{ ...promotion(), startsAtISO: '2026-06-01T00:00:00.000Z' }], 'Oferta']
  ])('handles time and status boundaries', async (items, title) => {
    const result = await createMemberClubPromotionsHandler({ persistence: { listPromotions: async () => items as ClubPromotion[] }, now: instant })(event);
    expect(JSON.parse(result.body!).promotion?.title ?? null).toBe(title);
  });
  it('rejects query selectors, invalid context and persistence errors safely', async () => {
    const handler = createMemberClubPromotionsHandler({ persistence: { listPromotions: async () => { throw new Error('secret'); } }, now: instant });
    expect((await handler({ ...event, rawQueryString: 'studioId=x' })).statusCode).toBe(400);
    expect((await handler({ ...event, requestContext: {} as APIGatewayProxyEventV2['requestContext'] })).statusCode).toBe(500);
    const result = await handler(event); expect(result.statusCode).toBe(500); expect(result.body).not.toContain('secret');
  });
});
