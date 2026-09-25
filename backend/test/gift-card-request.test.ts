import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { handler as healthHandler } from '../src/handlers/health';
import {
  createGiftCardRequestHandler,
  DynamoGiftCardPersistence,
  GiftCardPersistence,
  MAX_REQUEST_BODY_BYTES
} from '../src/handlers/gift-card-request';
import { GiftCardTableItem } from '../src/shared/gift-card-model';

const keyOne = '11111111-1111-4111-8111-111111111111';
const keyTwo = '22222222-2222-4222-8222-222222222222';
const eventForBody = (
  body: unknown,
  key?: string,
  isBase64Encoded = false
): APIGatewayProxyEventV2 =>
  ({
    headers: {
      origin: 'http://localhost:4200',
      ...(key ? { 'idempotency-key': key } : {})
    },
    body: isBase64Encoded
      ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64')
      : typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded
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
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
    const body = JSON.parse(conflict.body ?? '{}');

    expect(conflict.statusCode).toBe(409);
    expect(body).toEqual({
      error: 'IDEMPOTENCY_CONFLICT',
      message: 'Esta clave ya se usó para otra solicitud.'
    });
    expect(JSON.stringify(body)).not.toContain(validBody.buyerPhone);
    expect(JSON.stringify(body)).not.toContain(validBody.message);
    expect(log).not.toHaveBeenCalled();
    expect(stored.size).toBe(1);
    log.mockRestore();
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

  it('accepts a normal base64-encoded request body', async () => {
    const save = vi.fn<GiftCardPersistence['save']>().mockResolvedValue(undefined);
    const handler = createGiftCardRequestHandler({ persistence: { save, get: vi.fn() } });

    const response = await handler(eventForBody(validBody, keyOne, true));

    expect(response.statusCode).toBe(201);
    expect(save).toHaveBeenCalledOnce();
  });

  it.each([false, true])('rejects an oversized body before parsing (base64: %s)', async (base64) => {
    const save = vi.fn<GiftCardPersistence['save']>();
    const handler = createGiftCardRequestHandler({ persistence: { save, get: vi.fn() } });
    const oversizedBody = JSON.stringify({ padding: 'x'.repeat(MAX_REQUEST_BODY_BYTES) });

    const response = await handler(eventForBody(oversizedBody, keyOne, base64));

    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      error: 'REQUEST_TOO_LARGE',
      message: 'La solicitud excede el tamaño permitido.'
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('logs only operational metadata when persistence fails', async () => {
    const privateValue = 'private-person@example.com 5551234567 mensaje privado';
    const error = Object.assign(new Error(privateValue), {
      $metadata: { requestId: 'aws-request-id', httpStatusCode: 500 }
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = createGiftCardRequestHandler({
      persistence: { save: vi.fn().mockRejectedValue(error), get: vi.fn() }
    });

    const response = await handler(eventForBody(validBody, keyOne));
    const logged = JSON.stringify(log.mock.calls);

    expect(response.statusCode).toBe(500);
    expect(logged).toContain('aws-request-id');
    expect(logged).not.toContain(privateValue);
    expect(logged).not.toContain(validBody.buyerPhone);
    expect(logged).not.toContain(validBody.message);
    log.mockRestore();
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
