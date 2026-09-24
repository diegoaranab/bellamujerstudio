import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { handler as healthHandler } from '../src/handlers/health';
import { createGiftCardRequestHandler, DynamoGiftCardPersistence, GiftCardPersistence } from '../src/handlers/gift-card-request';
import { GiftCardTableItem } from '../src/shared/gift-card-model';

const keyOne = '11111111-1111-4111-8111-111111111111';
const keyTwo = '22222222-2222-4222-8222-222222222222';
const eventForBody = (body: unknown, key?: string): APIGatewayProxyEventV2 =>
  ({
    headers: {
      origin: 'http://localhost:4200',
      ...(key ? { 'idempotency-key': key } : {})
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false
  }) as unknown as APIGatewayProxyEventV2;

const validBody = {
  buyerName: 'Diego',
  buyerPhone: '5551234567',
  recipientName: 'Alejandra',
  amountMXN: 500,
  message: 'Feliz cumple'
};

describe('gift-card request handler', () => {
  it('returns 201 for valid request using mocked persistence', async () => {
    const save = vi.fn<GiftCardPersistence['save']>().mockResolvedValue(undefined);
    const get = vi.fn<GiftCardPersistence['get']>();
    const handler = createGiftCardRequestHandler({
      persistence: { save, get },
      clock: () => new Date('2026-04-25T12:00:00.000Z'),
      createFolio: () => 'BM-REGALO-20260425-ABCD'
    });

    const response = await handler(eventForBody(validBody, keyOne));
    const body = JSON.parse(response.body ?? '{}');
    const savedItem = save.mock.calls[0]?.[0] as GiftCardTableItem | undefined;

    expect(response.statusCode).toBe(201);
    expect(body).toMatchObject({
      id: keyOne,
      folio: 'BM-REGALO-20260425-ABCD',
      createdAtISO: '2026-04-25T12:00:00.000Z',
      updatedAtISO: '2026-04-25T12:00:00.000Z',
      paymentMethod: 'transferencia',
      status: 'pendiente',
      ...validBody
    });
    expect(savedItem).toMatchObject({
      pk: `GIFT_CARD#${keyOne}`,
      sk: 'METADATA',
      status: 'pendiente'
    });
  });

  it('returns the original card on replay and creates separate cards for separate keys', async () => {
    const stored = new Map<string, GiftCardTableItem>();
    const save = vi.fn<GiftCardPersistence['save']>(async (item) => {
      if (stored.has(item.id)) {
        const error = new Error('Duplicate');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
      stored.set(item.id, item);
    });
    const get = vi.fn<GiftCardPersistence['get']>(async (id) => {
      const item = stored.get(id);
      if (!item) return undefined;
      const { pk: _pk, sk: _sk, ...giftCard } = item;
      return giftCard;
    });
    let tick = 0;
    const handler = createGiftCardRequestHandler({
      persistence: { save, get },
      clock: () => new Date(`2026-04-25T12:00:0${tick++}.000Z`),
      createFolio: (date) => `BM-${date.getTime()}`
    });

    const first = await handler(eventForBody(validBody, keyOne));
    const replay = await handler(eventForBody(validBody, keyOne));
    const another = await handler(eventForBody(validBody, keyTwo));

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(JSON.parse(replay.body ?? '{}')).toEqual(JSON.parse(first.body ?? '{}'));
    expect(another.statusCode).toBe(201);
    expect(JSON.parse(another.body ?? '{}').id).toBe(keyTwo);
    expect(stored.size).toBe(2);
    expect(get).toHaveBeenCalledWith(keyOne);
  });

  it('rejects a reused key with different data', async () => {
    const stored = new Map<string, GiftCardTableItem>();
    const handler = createGiftCardRequestHandler({ persistence: {
      save: async (item) => {
        if (stored.has(item.id)) {
          const error = new Error('Duplicate');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        }
        stored.set(item.id, item);
      },
      get: async (id) => stored.get(id)
    }});
    await handler(eventForBody(validBody, keyOne));
    const conflict = await handler(eventForBody({ ...validBody, amountMXN: 700 }, keyOne));
    expect(conflict.statusCode).toBe(409);
    expect(stored.size).toBe(1);
  });

  it.each([undefined, 'bad-key'])('rejects a missing or malformed idempotency key: %s', async (key) => {
    const save = vi.fn<GiftCardPersistence['save']>();
    const handler = createGiftCardRequestHandler({ persistence: { save, get: vi.fn() } });
    const response = await handler(eventForBody(validBody, key));
    expect(response.statusCode).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const save = vi.fn<GiftCardPersistence['save']>().mockResolvedValue(undefined);
    const handler = createGiftCardRequestHandler({
      persistence: { save, get: vi.fn() }
    });

    const response = await handler(eventForBody('{bad json', keyOne));
    const body = JSON.parse(response.body ?? '{}');

    expect(response.statusCode).toBe(400);
    expect(body).toMatchObject({
      error: 'VALIDATION_ERROR',
      message: 'Revisa los datos de la solicitud.'
    });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Dynamo gift-card persistence', () => {
  it('conditionally writes and consistently reads the original card', async () => {
    const send = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({ Item: {
      id: { S: keyOne }, folio: { S: 'BM-ORIGINAL' }, status: { S: 'pendiente' },
      paymentMethod: { S: 'transferencia' }, createdAtISO: { S: '2026-04-25T12:00:00.000Z' },
      updatedAtISO: { S: '2026-04-25T12:00:00.000Z' }, buyerName: { S: 'Diego' },
      buyerPhone: { S: '5551234567' }, recipientName: { S: 'Alejandra' },
      amountMXN: { N: '500' }, message: { S: 'Feliz cumple' }
    } });
    const persistence = new DynamoGiftCardPersistence({ send } as unknown as DynamoDBClient, 'gift-cards');
    const item: GiftCardTableItem = {
      pk: `GIFT_CARD#${keyOne}`, sk: 'METADATA', id: keyOne, folio: 'BM-ORIGINAL',
      status: 'pendiente', paymentMethod: 'transferencia',
      createdAtISO: '2026-04-25T12:00:00.000Z', updatedAtISO: '2026-04-25T12:00:00.000Z',
      ...validBody
    };
    await persistence.save(item);
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutItemCommand);
    expect(send.mock.calls[0][0].input.ConditionExpression).toBe('attribute_not_exists(pk)');
    expect(await persistence.get(keyOne)).toEqual({
      id: keyOne, folio: 'BM-ORIGINAL', status: 'pendiente', paymentMethod: 'transferencia',
      createdAtISO: '2026-04-25T12:00:00.000Z', updatedAtISO: '2026-04-25T12:00:00.000Z',
      ...validBody
    });
    expect(send.mock.calls[1][0]).toBeInstanceOf(GetItemCommand);
    expect(send.mock.calls[1][0].input).toMatchObject({
      Key: { pk: { S: `GIFT_CARD#${keyOne}` }, sk: { S: 'METADATA' } },
      ConsistentRead: true
    });
  });
});

describe('health handler', () => {
  it('returns ok true', async () => {
    const response = await healthHandler(eventForBody({}));
    const body = JSON.parse(response.body ?? '{}');

    expect(response.statusCode).toBe(200);
    expect(body).toEqual({
      ok: true,
      service: 'bella-mujer-api'
    });
  });
});
