import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { handler as healthHandler } from '../src/handlers/health';
import { createGiftCardRequestHandler, GiftCardPersistence } from '../src/handlers/gift-card-request';
import { GiftCardTableItem } from '../src/shared/gift-card-model';

const eventForBody = (body: unknown): APIGatewayProxyEventV2 =>
  ({
    headers: {
      origin: 'http://localhost:4200'
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
    const handler = createGiftCardRequestHandler({
      persistence: { save },
      clock: () => new Date('2026-04-25T12:00:00.000Z'),
      createId: () => 'gift-card-id',
      createFolio: () => 'BM-REGALO-20260425-ABCD'
    });

    const response = await handler(eventForBody(validBody));
    const body = JSON.parse(response.body ?? '{}');
    const savedItem = save.mock.calls[0]?.[0] as GiftCardTableItem | undefined;

    expect(response.statusCode).toBe(201);
    expect(body).toMatchObject({
      id: 'gift-card-id',
      folio: 'BM-REGALO-20260425-ABCD',
      createdAtISO: '2026-04-25T12:00:00.000Z',
      updatedAtISO: '2026-04-25T12:00:00.000Z',
      paymentMethod: 'transferencia',
      status: 'pendiente',
      ...validBody
    });
    expect(savedItem).toMatchObject({
      pk: 'GIFT_CARD#gift-card-id',
      sk: 'METADATA',
      status: 'pendiente'
    });
  });

  it('returns 400 for invalid JSON body', async () => {
    const save = vi.fn<GiftCardPersistence['save']>().mockResolvedValue(undefined);
    const handler = createGiftCardRequestHandler({
      persistence: { save }
    });

    const response = await handler(eventForBody('{bad json'));
    const body = JSON.parse(response.body ?? '{}');

    expect(response.statusCode).toBe(400);
    expect(body).toMatchObject({
      error: 'VALIDATION_ERROR',
      message: 'Revisa los datos de la solicitud.'
    });
    expect(save).not.toHaveBeenCalled();
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
