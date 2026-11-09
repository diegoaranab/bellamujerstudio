import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import {
  createAdminGiftCardUpdateHandler,
  DynamoGiftCardUpdatePersistence,
  GiftCardUpdatePersistence,
  MAX_ADMIN_UPDATE_BODY_BYTES
} from '../src/handlers/admin-gift-card-update';
import { GiftCard, GiftCardStatus } from '../src/shared/gift-card-model';

const id = '11111111-1111-4111-8111-111111111111';
const nowISO = '2026-11-09T18:00:00.000Z';
const giftCard: GiftCard = {
  id,
  folio: 'BM-REGALO-20261109-ABCD',
  createdAtISO: '2026-11-08T18:00:00.000Z',
  updatedAtISO: nowISO,
  paymentMethod: 'transferencia',
  status: 'pagada',
  confirmedAtISO: nowISO,
  notes: 'Transferencia confirmada por Ale',
  buyerName: 'Diego',
  buyerPhone: '5551234567',
  buyerEmail: 'private-person@example.com',
  recipientName: 'Alejandra',
  recipientPhone: '5559876543',
  amountMXN: 500,
  message: 'Feliz cumple'
};

const asDynamoItem = (card: GiftCard) => ({
  pk: { S: `GIFT_CARD#${card.id}` },
  sk: { S: 'METADATA' },
  id: { S: card.id },
  folio: { S: card.folio },
  createdAtISO: { S: card.createdAtISO },
  updatedAtISO: { S: card.updatedAtISO },
  paymentMethod: { S: card.paymentMethod },
  status: { S: card.status },
  buyerName: { S: card.buyerName },
  buyerPhone: { S: card.buyerPhone },
  ...(card.buyerEmail ? { buyerEmail: { S: card.buyerEmail } } : {}),
  recipientName: { S: card.recipientName },
  ...(card.recipientPhone ? { recipientPhone: { S: card.recipientPhone } } : {}),
  amountMXN: { N: String(card.amountMXN) },
  ...(card.message ? { message: { S: card.message } } : {}),
  ...(card.confirmedAtISO ? { confirmedAtISO: { S: card.confirmedAtISO } } : {}),
  ...(card.deliveredAtISO ? { deliveredAtISO: { S: card.deliveredAtISO } } : {}),
  ...(card.usedAtISO ? { usedAtISO: { S: card.usedAtISO } } : {}),
  ...(card.notes ? { notes: { S: card.notes } } : {})
});

const eventFor = (
  body: unknown,
  pathId: string = id,
  isBase64Encoded = false
): APIGatewayProxyEventV2 => ({
  headers: { origin: 'http://localhost:4200' },
  pathParameters: { id: pathId },
  body: body === undefined
    ? undefined
    : isBase64Encoded
      ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64')
      : typeof body === 'string' ? body : JSON.stringify(body),
  isBase64Encoded,
  requestContext: { requestId: 'api-request-id' }
}) as unknown as APIGatewayProxyEventV2;

const mockPersistence = (result: GiftCard = giftCard) => {
  const update = vi.fn<GiftCardUpdatePersistence['update']>().mockResolvedValue(result);
  return { persistence: { update }, update };
};

describe('administrative gift-card update handler', () => {
  it('accepts a status-only update and uses server time', async () => {
    const { persistence, update } = mockPersistence();
    const handler = createAdminGiftCardUpdateHandler({
      persistence,
      clock: () => new Date(nowISO)
    });

    const response = await handler(eventFor({ status: 'pagada' }));

    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(id, { status: 'pagada' }, nowISO);
  });

  it('accepts and trims a notes-only update', async () => {
    const { persistence, update } = mockPersistence();
    const handler = createAdminGiftCardUpdateHandler({ persistence });

    const response = await handler(eventFor({ notes: '  Transferencia confirmada  ' }));

    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      id,
      { notes: 'Transferencia confirmada' },
      expect.any(String)
    );
  });

  it('accepts status and notes together', async () => {
    const { persistence, update } = mockPersistence();
    const handler = createAdminGiftCardUpdateHandler({ persistence });

    const response = await handler(eventFor({ status: 'entregada', notes: '  Entregada  ' }));

    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      id,
      { status: 'entregada', notes: 'Entregada' },
      expect.any(String)
    );
  });

  it.each<GiftCardStatus>(['pendiente', 'pagada', 'entregada', 'usada', 'cancelada'])(
    'accepts valid status %s',
    async (status) => {
      const { persistence, update } = mockPersistence({ ...giftCard, status });
      const handler = createAdminGiftCardUpdateHandler({ persistence });

      expect((await handler(eventFor({ status }))).statusCode).toBe(200);
      expect(update).toHaveBeenCalledWith(id, { status }, expect.any(String));
    }
  );

  it.each([
    [{ status: 'desconocida' }],
    [{}],
    [{ status: 'pagada', extra: true }],
    [[]],
    [undefined],
    [{ notes: null }],
    [{ notes: 123 }],
    [{ notes: [] }],
    [{ notes: {} }]
  ])('rejects malformed update body %j', async (body) => {
    const { persistence, update } = mockPersistence();
    const handler = createAdminGiftCardUpdateHandler({ persistence });

    const response = await handler(eventFor(body));

    expect(response.statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const { persistence, update } = mockPersistence();
    const handler = createAdminGiftCardUpdateHandler({ persistence });

    expect((await handler(eventFor('{bad json'))).statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a malformed gift-card ID', async () => {
    const { persistence, update } = mockPersistence();
    const handler = createAdminGiftCardUpdateHandler({ persistence });

    expect((await handler(eventFor({ status: 'pagada' }, 'not-an-id'))).statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects notes longer than 2000 Unicode characters', async () => {
    const { persistence, update } = mockPersistence();
    const handler = createAdminGiftCardUpdateHandler({ persistence });

    expect((await handler(eventFor({ notes: 'é'.repeat(2001) }))).statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('passes whitespace-only notes as an empty value for attribute removal', async () => {
    const { persistence, update } = mockPersistence();
    const handler = createAdminGiftCardUpdateHandler({ persistence });

    expect((await handler(eventFor({ notes: '   \n ' }))).statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(id, { notes: '' }, expect.any(String));
  });

  it.each([false, true])('rejects an oversized body before parsing (base64: %s)', async (base64) => {
    const { persistence, update } = mockPersistence();
    const handler = createAdminGiftCardUpdateHandler({ persistence });
    const oversized = JSON.stringify({ notes: 'x'.repeat(MAX_ADMIN_UPDATE_BODY_BYTES) });

    const response = await handler(eventFor(oversized, id, base64));

    expect(response.statusCode).toBe(413);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns a safe 404 for a missing target', async () => {
    const error = new Error('private missing record details');
    error.name = 'ConditionalCheckFailedException';
    const handler = createAdminGiftCardUpdateHandler({
      persistence: { update: vi.fn().mockRejectedValue(error) }
    });

    const response = await handler(eventFor({ status: 'cancelada' }));

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      error: 'GIFT_CARD_NOT_FOUND',
      message: 'No encontramos la tarjeta de regalo solicitada.'
    });
  });

  it('returns 500 and logs only operational metadata', async () => {
    const privateText = `${giftCard.notes} ${giftCard.buyerEmail} ${giftCard.buyerPhone}`;
    const error = Object.assign(new Error(privateText), {
      $metadata: { requestId: 'aws-request-id', httpStatusCode: 500 }
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = createAdminGiftCardUpdateHandler({
      persistence: { update: vi.fn().mockRejectedValue(error) }
    });

    const response = await handler(eventFor({ notes: giftCard.notes }));
    const logged = JSON.stringify(log.mock.calls);

    expect(response.statusCode).toBe(500);
    expect(logged).toContain('update');
    expect(logged).toContain('api-request-id');
    expect(logged).toContain('aws-request-id');
    expect(logged).not.toContain(giftCard.notes);
    expect(logged).not.toContain(giftCard.buyerEmail);
    expect(logged).not.toContain(giftCard.buyerPhone);
    log.mockRestore();
  });

  it('returns the full domain card without DynamoDB keys', async () => {
    const { persistence } = mockPersistence();
    const handler = createAdminGiftCardUpdateHandler({ persistence });

    const response = await handler(eventFor({ status: 'pagada' }));
    const body = JSON.parse(response.body ?? '{}');

    expect(body).toEqual(giftCard);
    expect(body.pk).toBeUndefined();
    expect(body.sk).toBeUndefined();
  });
});

describe('Dynamo administrative gift-card update persistence', () => {
  const commandFor = async (update: { status?: GiftCardStatus; notes?: string }) => {
    const resultCard: GiftCard = {
      ...giftCard,
      ...(update.status ? { status: update.status } : {}),
      ...(update.notes === '' ? { notes: undefined } : update.notes ? { notes: update.notes } : {})
    };
    const send = vi.fn().mockResolvedValue({ Attributes: asDynamoItem(resultCard) });
    const persistence = new DynamoGiftCardUpdatePersistence(
      { send } as unknown as DynamoDBClient,
      'gift-cards-table'
    );

    const result = await persistence.update(id, update, nowISO);
    return { command: send.mock.calls[0][0] as UpdateItemCommand, result };
  };

  it('uses one conditional UpdateItem with the correct table, key, and ALL_NEW', async () => {
    const { command, result } = await commandFor({ status: 'pagada', notes: 'Confirmada' });

    expect(command).toBeInstanceOf(UpdateItemCommand);
    expect(command.input).toMatchObject({
      TableName: 'gift-cards-table',
      Key: { pk: { S: `GIFT_CARD#${id}` }, sk: { S: 'METADATA' } },
      ConditionExpression: 'attribute_exists(#pk) AND attribute_exists(#sk)',
      ReturnValues: 'ALL_NEW'
    });
    expect(result.id).toBe(id);
    expect(JSON.stringify(result)).not.toContain('"pk"');
    expect(JSON.stringify(result)).not.toContain('"sk"');
  });

  it.each([
    ['pagada', 'confirmedAtISO'],
    ['entregada', 'deliveredAtISO'],
    ['usada', 'usedAtISO']
  ] as const)('sets %s milestone only if absent', async (status, milestone) => {
    const { command } = await commandFor({ status });

    expect(command.input.ExpressionAttributeNames?.['#milestone']).toBe(milestone);
    expect(command.input.ExpressionAttributeValues?.[':milestone']).toEqual({ S: nowISO });
    expect(command.input.UpdateExpression).toContain(
      '#milestone = if_not_exists(#milestone, :milestone)'
    );
  });

  it.each<GiftCardStatus>(['pendiente', 'cancelada'])(
    'moving to %s preserves all milestone attributes',
    async (status) => {
      const { command } = await commandFor({ status });

      expect(command.input.UpdateExpression).not.toContain('milestone');
      expect(command.input.UpdateExpression).not.toContain('confirmedAtISO');
      expect(command.input.UpdateExpression).not.toContain('deliveredAtISO');
      expect(command.input.UpdateExpression).not.toContain('usedAtISO');
      expect(command.input.UpdateExpression).not.toContain('REMOVE');
    }
  );

  it('always sets the server-generated updatedAtISO', async () => {
    const { command } = await commandFor({ notes: 'Nota' });

    expect(command.input.ExpressionAttributeValues?.[':updatedAtISO']).toEqual({ S: nowISO });
    expect(command.input.UpdateExpression).toContain('#updatedAtISO = :updatedAtISO');
  });

  it('sets nonblank notes', async () => {
    const { command } = await commandFor({ notes: 'Nota interna' });

    expect(command.input.ExpressionAttributeValues?.[':notes']).toEqual({ S: 'Nota interna' });
    expect(command.input.UpdateExpression).toContain('#notes = :notes');
  });

  it('removes blank notes', async () => {
    const { command } = await commandFor({ notes: '' });

    expect(command.input.ExpressionAttributeValues?.[':notes']).toBeUndefined();
    expect(command.input.UpdateExpression).toContain('REMOVE #notes');
  });
});
