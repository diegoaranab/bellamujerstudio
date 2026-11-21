import { ConditionalCheckFailedException, DynamoDBClient, GetItemCommand, PutItemCommand, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { promotionAuditKey, promotionCapacityKey, promotionCreateIdempotencyKey } from '../src/club/club-keys';
import { ClubPromotion, PromotionAuditEntry, PromotionCapacity, PromotionCreateIdempotency } from '../src/club/club-model';
import {
  DynamoClubPersistence, promotionAuditEntryFromDynamoItem, promotionAuditEntryToDynamoItem,
  promotionCapacityFromDynamoItem, promotionCapacityToDynamoItem,
  promotionCreateIdempotencyFromDynamoItem, promotionCreateIdempotencyToDynamoItem,
  clubPromotionToDynamoItem
} from '../src/club/club-persistence';

const timestamp = '2026-11-01T00:00:00.000Z';
const promotion: ClubPromotion = {
  studioId: 'studio-a', promotionId: '00000000-0000-4000-8000-000000000001', title: 'Oferta', description: 'Descripción',
  status: 'active', startsAtISO: timestamp, endsAtISO: '2027-01-01T00:00:00.000Z', createdAtISO: timestamp, updatedAtISO: timestamp
};
const capacity: PromotionCapacity = { studioId: 'studio-a', count: 0, state: 'READY', reconciledAtISO: timestamp };
const idempotency: PromotionCreateIdempotency = {
  studioId: 'studio-a', keyHash: 'a'.repeat(64), requestFingerprint: 'b'.repeat(64), promotionId: promotion.promotionId,
  createdAtISO: timestamp, creationResult: promotion
};
const audit = (operation: PromotionAuditEntry['operation'], overrides: Partial<PromotionAuditEntry> = {}): PromotionAuditEntry => ({
  studioId: 'studio-a', eventId: '00000000-0000-4000-8000-000000000002', promotionId: promotion.promotionId,
  operation, occurredAtISO: timestamp, adminSub: 'cognito-subject', requestId: 'request-id',
  ...(operation !== 'CREATE' ? { beforePromotion: promotion } : {}),
  ...(operation !== 'DELETE' ? { afterPromotion: promotion } : {}), ...overrides
});

describe('promotion metadata keys and serializers', () => {
  it('builds exact metadata keys outside the canonical promotion prefix', () => {
    expect(promotionCapacityKey('studio-a')).toEqual({ pk: 'STUDIO#studio-a#PROMOTIONS', sk: 'CAPACITY' });
    expect(promotionAuditKey('studio-a', timestamp, audit('CREATE').eventId)).toEqual({
      pk: 'STUDIO#studio-a#PROMOTION_AUDIT', sk: `EVENT#${timestamp}#${audit('CREATE').eventId}`
    });
    expect(promotionCreateIdempotencyKey('studio-a', 'a'.repeat(64))).toEqual({
      pk: 'STUDIO#studio-a#PROMOTION_IDEMPOTENCY', sk: `CREATE#${'a'.repeat(64)}`
    });
    expect(() => promotionAuditKey('bad#studio', timestamp, audit('CREATE').eventId)).toThrow();
    expect(() => promotionAuditKey('studio-a', timestamp, 'not-a-uuid')).toThrow();
    expect(() => promotionAuditKey('studio-a', '2026-11-01T00:00:00Z', audit('CREATE').eventId)).toThrow();
    expect(() => promotionCreateIdempotencyKey('studio-a', 'A'.repeat(64))).toThrow();
    expect(() => promotionCreateIdempotencyKey('studio-a', 'x')).toThrow();
  });

  it('strictly round trips capacity and validates range, state, entity and extra fields', () => {
    for (const count of [0, 100]) expect(promotionCapacityFromDynamoItem(promotionCapacityToDynamoItem({ ...capacity, count }))).toEqual({ ...capacity, count });
    for (const count of [-1, 101, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => promotionCapacityToDynamoItem({ ...capacity, count })).toThrow();
    expect(() => promotionCapacityToDynamoItem({ ...capacity, state: 'BROKEN' as 'READY' })).toThrow();
    const item = promotionCapacityToDynamoItem(capacity);
    expect(() => promotionCapacityFromDynamoItem({ ...item, extra: { S: 'x' } })).toThrow();
    expect(() => promotionCapacityFromDynamoItem({ ...item, entityType: { S: 'PROMOTION' } })).toThrow();
  });

  it.each([
    ['CREATE', { afterPromotion: promotion }], ['UPDATE', { beforePromotion: promotion, afterPromotion: promotion }],
    ['DELETE', { beforePromotion: promotion }]
  ] as const)('round trips %s audit snapshots strictly', (operation, snapshots) => {
    const value = audit(operation, snapshots as Partial<PromotionAuditEntry>);
    expect(promotionAuditEntryFromDynamoItem(promotionAuditEntryToDynamoItem(value))).toEqual(value);
  });

  it('rejects invalid audit snapshot combinations and cross-record identities', () => {
    expect(() => promotionAuditEntryToDynamoItem(audit('CREATE', { beforePromotion: promotion }))).toThrow();
    expect(() => promotionAuditEntryToDynamoItem(audit('UPDATE', { afterPromotion: undefined }))).toThrow();
    expect(() => promotionAuditEntryToDynamoItem(audit('DELETE', { afterPromotion: promotion }))).toThrow();
    expect(() => promotionAuditEntryToDynamoItem(audit('CREATE', { afterPromotion: { ...promotion, studioId: 'other' } }))).toThrow();
    expect(() => promotionAuditEntryToDynamoItem(audit('CREATE', { afterPromotion: { ...promotion, promotionId: '00000000-0000-4000-8000-000000000003' } }))).toThrow();
    expect(() => promotionAuditEntryToDynamoItem(audit('CREATE', { afterPromotion: { ...promotion, status: 'invalid' as 'active' } }))).toThrow();
    const item = promotionAuditEntryToDynamoItem(audit('CREATE'));
    expect(() => promotionAuditEntryFromDynamoItem({ ...item, extra: { S: 'x' } })).toThrow();
  });

  it('strictly round trips create idempotency and rejects malformed hashes, mismatches, and extras', () => {
    expect(promotionCreateIdempotencyFromDynamoItem(promotionCreateIdempotencyToDynamoItem(idempotency))).toEqual(idempotency);
    expect(() => promotionCreateIdempotencyToDynamoItem({ ...idempotency, keyHash: 'A'.repeat(64) })).toThrow();
    expect(() => promotionCreateIdempotencyToDynamoItem({ ...idempotency, requestFingerprint: 'x' })).toThrow();
    expect(() => promotionCreateIdempotencyToDynamoItem({ ...idempotency, creationResult: { ...promotion, promotionId: '00000000-0000-4000-8000-000000000003' } })).toThrow();
    expect(() => promotionCreateIdempotencyFromDynamoItem({ ...promotionCreateIdempotencyToDynamoItem(idempotency), extra: { S: 'x' } })).toThrow();
  });
});

describe('promotion persistence transactions and consistent reads', () => {
  const send = vi.fn();
  const db = new DynamoClubPersistence({ send } as unknown as DynamoDBClient, 'club-table');
  it('uses strong exact-key reads and returns undefined when absent', async () => {
    send.mockResolvedValue({});
    expect(await db.getPromotion('studio-a', promotion.promotionId)).toBeUndefined();
    expect(await db.getPromotionCapacity('studio-a')).toBeUndefined();
    expect(await db.getPromotionCreateIdempotency('studio-a', idempotency.keyHash)).toBeUndefined();
    expect(send.mock.calls.map(([command]) => command)).toEqual(expect.arrayContaining([expect.any(GetItemCommand)]));
    for (const [command] of send.mock.calls) expect(command.input).toMatchObject({ TableName: 'club-table', ConsistentRead: true });
    expect(send.mock.calls.map(([command]) => command.input.Key)).toEqual([
      { pk: { S: 'STUDIO#studio-a#PROMOTIONS' }, sk: { S: `PROMOTION#${promotion.promotionId}` } },
      { pk: { S: 'STUDIO#studio-a#PROMOTIONS' }, sk: { S: 'CAPACITY' } },
      { pk: { S: 'STUDIO#studio-a#PROMOTION_IDEMPOTENCY' }, sk: { S: `CREATE#${idempotency.keyHash}` } }
    ]);
    send.mockReset().mockResolvedValue({ Item: { ...promotionCapacityToDynamoItem(capacity), count: { N: '-1' } } });
    await expect(db.getPromotionCapacity('studio-a')).rejects.toThrow();
  });

  it('keeps metadata outside the member promotion prefix query', async () => {
    send.mockReset().mockResolvedValue({ Items: [clubPromotionToDynamoItem(promotion)] });
    await db.listPromotions('studio-a');
    const input = send.mock.calls[0][0].input;
    expect(input.KeyConditionExpression).toContain('begins_with(#sk, :prefix)');
    expect(input.ExpressionAttributeValues[':prefix']).toEqual({ S: 'PROMOTION#' });
  });

  it('conditionally initializes capacity once and distinguishes only the concrete conditional failure', async () => {
    const send = vi.fn().mockResolvedValue({});
    const db = new DynamoClubPersistence({ send } as unknown as DynamoDBClient, 'ClubTable');
    expect(await db.initializePromotionCapacityIfAbsent(capacity)).toBe('CREATED');
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutItemCommand);
    expect(command.input).toEqual({
      TableName: 'ClubTable',
      Item: promotionCapacityToDynamoItem(capacity),
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
    });

    send.mockReset().mockRejectedValue(new ConditionalCheckFailedException({ message: 'exists', $metadata: {} }));
    expect(await db.initializePromotionCapacityIfAbsent(capacity)).toBe('ALREADY_EXISTS');
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutItemCommand);

    const failure = new Error('ordinary SDK failure');
    send.mockReset().mockRejectedValue(failure);
    await expect(db.initializePromotionCapacityIfAbsent(capacity)).rejects.toBe(failure);

    send.mockReset();
    await expect(db.initializePromotionCapacityIfAbsent({ ...capacity, count: 101 })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('builds create as exactly four conditioned ClubTable operations', async () => {
    send.mockReset().mockResolvedValue({});
    await db.createPromotionOutcome({ promotion, capacityMutation: { studioId: promotion.studioId }, idempotency, audit: audit('CREATE') });
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(TransactWriteItemsCommand);
    const items = command.input.TransactItems!;
    expect(items).toHaveLength(4);
    expect(items.map((item: { Put?: { TableName?: string }; Update?: { TableName?: string } }) => item.Put?.TableName ?? item.Update?.TableName)).toEqual(Array(4).fill('club-table'));
    expect(items[0].Put).toMatchObject({ ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)', Item: clubPromotionToDynamoItem(promotion) });
    expect(items[1].Update).toMatchObject({ Key: { pk: { S: 'STUDIO#studio-a#PROMOTIONS' }, sk: { S: 'CAPACITY' } }, UpdateExpression: 'SET #count = #count + :one' });
    expect(items[1].Update?.ConditionExpression).toContain(':maximum');
    expect(items[1].Update?.ExpressionAttributeValues).toMatchObject({ ':minimum': { N: '0' }, ':maximum': { N: '99' }, ':one': { N: '1' }, ':ready': { S: 'READY' } });
    expect(items[2].Put?.ConditionExpression).toBe('attribute_not_exists(pk) AND attribute_not_exists(sk)');
    expect(items[3].Put?.ConditionExpression).toBe('attribute_not_exists(pk) AND attribute_not_exists(sk)');
    expect(JSON.stringify(command.input)).not.toMatch(/GiftCards|ClubAccessTable|LEDGER#/);
    send.mockReset();
    await expect(db.createPromotionOutcome({ promotion, capacityMutation: { studioId: 'other' }, idempotency, audit: audit('CREATE') })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('builds optimistic update and immutable audit without changing capacity', async () => {
    send.mockReset().mockResolvedValue({});
    const next = { ...promotion, title: 'Actualizada', updatedAtISO: '2026-11-01T00:00:00.001Z' };
    await db.updatePromotionOutcome({ beforePromotion: promotion, afterPromotion: next, expectedUpdatedAtISO: timestamp, audit: audit('UPDATE', { afterPromotion: next }) });
    const items = send.mock.calls[0][0].input.TransactItems!;
    expect(items).toHaveLength(2);
    expect(items[0].Update?.ConditionExpression).toContain('#updatedAt = :expectedUpdatedAt');
    expect(items[0].Update?.ConditionExpression).toContain('attribute_exists(pk)');
    expect(items[0].Update?.ExpressionAttributeValues).toMatchObject({ ':expectedUpdatedAt': { S: timestamp }, ':updatedAt': { S: next.updatedAtISO } });
    expect(items[1].Put?.ConditionExpression).toBe('attribute_not_exists(pk) AND attribute_not_exists(sk)');
    expect(JSON.stringify(items)).not.toContain('CAPACITY');
    send.mockReset();
    await expect(db.updatePromotionOutcome({ beforePromotion: promotion, afterPromotion: next, expectedUpdatedAtISO: timestamp, audit: audit('UPDATE', { afterPromotion: promotion }) })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('builds conditional delete plus one bounded capacity decrement and immutable delete audit', async () => {
    send.mockReset().mockResolvedValue({});
    await db.deletePromotionOutcome({ beforePromotion: promotion, expectedUpdatedAtISO: timestamp, capacityMutation: { studioId: 'studio-a' }, audit: audit('DELETE') });
    const items = send.mock.calls[0][0].input.TransactItems!;
    expect(items).toHaveLength(3);
    expect(items[0].Delete?.ConditionExpression).toContain('#updatedAt = :expectedUpdatedAt');
    expect(items[0].Delete?.ConditionExpression).toContain('attribute_exists(pk)');
    expect(items[1].Update?.UpdateExpression).toBe('SET #count = #count - :one');
    expect(items[1].Update?.ExpressionAttributeValues).toMatchObject({ ':minimum': { N: '1' }, ':maximum': { N: '100' }, ':one': { N: '1' } });
    expect(items[2].Put?.ConditionExpression).toBe('attribute_not_exists(pk) AND attribute_not_exists(sk)');
    expect(JSON.stringify(items[2].Put?.Item)).not.toContain('afterPromotion');
  });
});
