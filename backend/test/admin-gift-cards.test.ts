import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import {
  createAdminGiftCardsHandler,
  DEFAULT_LIMIT,
  DynamoGiftCardListPersistence,
  GiftCardListPersistence
} from '../src/handlers/admin-gift-cards';
import { GiftCard } from '../src/shared/gift-card-model';

const giftCard: GiftCard = {
  id: '11111111-1111-4111-8111-111111111111',
  folio: 'BM-REGALO-20260425-ABCD',
  createdAtISO: '2026-04-25T12:00:00.000Z',
  updatedAtISO: '2026-04-25T12:00:00.000Z',
  paymentMethod: 'transferencia',
  status: 'pendiente',
  buyerName: 'Diego',
  buyerPhone: '5551234567',
  buyerEmail: 'private-person@example.com',
  recipientName: 'Alejandra',
  recipientPhone: '5559876543',
  amountMXN: 500,
  message: 'Feliz cumple'
};

const continuationKey = {
  pk: { S: `GIFT_CARD#${giftCard.id}` },
  sk: { S: 'METADATA' }
};

const nonGiftContinuationKey = {
  pk: { S: 'CLIENT#123' },
  sk: { S: 'METADATA' }
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
  ...(card.message ? { message: { S: card.message } } : {})
});

const eventForQuery = (queryStringParameters?: Record<string, string>): APIGatewayProxyEventV2 =>
  ({
    headers: { origin: 'http://localhost:4200' },
    queryStringParameters,
    requestContext: { requestId: 'api-request-id' }
  }) as unknown as APIGatewayProxyEventV2;

const mockPersistence = (items: GiftCard[] = [giftCard]) => {
  const list = vi.fn<GiftCardListPersistence['list']>().mockResolvedValue({ items });
  return { persistence: { list }, list };
};

describe('administrative gift-card list handler', () => {
  it('returns a successful domain-only response with the default limit', async () => {
    const { persistence, list } = mockPersistence();
    const handler = createAdminGiftCardsHandler({ persistence });

    const response = await handler(eventForQuery());
    const body = JSON.parse(response.body ?? '{}');

    expect(response.statusCode).toBe(200);
    expect(body).toEqual({ items: [giftCard] });
    expect(JSON.stringify(body)).not.toContain('"pk"');
    expect(JSON.stringify(body)).not.toContain('"sk"');
    expect(body.nextToken).toBeUndefined();
    expect(list).toHaveBeenCalledWith(DEFAULT_LIMIT, undefined);
  });

  it('uses an explicit valid limit', async () => {
    const { persistence, list } = mockPersistence();
    const handler = createAdminGiftCardsHandler({ persistence });

    const response = await handler(eventForQuery({ limit: '25' }));

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(25, undefined);
  });

  it.each(['0', '101', '1.5', 'abc', '', '-1', ' 5'])('rejects invalid limit %j', async (limit) => {
    const { persistence, list } = mockPersistence();
    const handler = createAdminGiftCardsHandler({ persistence });

    const response = await handler(eventForQuery({ limit }));

    expect(response.statusCode).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it('turns a returned continuation key into an opaque token and accepts it on the next request', async () => {
    const list = vi.fn<GiftCardListPersistence['list']>()
      .mockResolvedValueOnce({ items: [giftCard], lastEvaluatedKey: continuationKey })
      .mockResolvedValueOnce({ items: [] });
    const handler = createAdminGiftCardsHandler({ persistence: { list } });

    const firstResponse = await handler(eventForQuery({ limit: '10' }));
    const firstBody = JSON.parse(firstResponse.body ?? '{}');

    expect(firstBody.nextToken).toEqual(expect.any(String));
    expect(firstBody.nextToken).not.toContain('GIFT_CARD');

    const secondResponse = await handler(eventForQuery({
      limit: '10',
      nextToken: firstBody.nextToken
    }));

    expect(secondResponse.statusCode).toBe(200);
    expect(list).toHaveBeenNthCalledWith(2, 10, continuationKey);
  });

  it.each([
    'not+a+base64url+token',
    Buffer.from('{bad json').toString('base64url'),
    Buffer.from(JSON.stringify({ pk: { S: 'x' } })).toString('base64url'),
    Buffer.from(JSON.stringify({ pk: { S: 'x' }, sk: { S: 'y' }, injected: { S: 'z' } })).toString('base64url')
  ])('rejects malformed pagination token without calling DynamoDB: %s', async (nextToken) => {
    const { persistence, list } = mockPersistence();
    const handler = createAdminGiftCardsHandler({ persistence });

    const response = await handler(eventForQuery({ nextToken }));

    expect(response.statusCode).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it.each([
    { pk: { S: 'CLIENT#123' }, sk: { S: 'METADATA' } },
    { pk: { S: `GIFT_CARD#${giftCard.id}` }, sk: { S: 'OTHER' } },
    { pk: { S: 'GIFT_CARD#' }, sk: { S: 'METADATA' } }
  ])('rejects a continuation key outside the gift-card keyspace: %j', async (key) => {
    const { persistence, list } = mockPersistence();
    const handler = createAdminGiftCardsHandler({ persistence });
    const nextToken = Buffer.from(JSON.stringify(key)).toString('base64url');

    const response = await handler(eventForQuery({ nextToken }));

    expect(response.statusCode).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it('returns 500 and logs only operational metadata when persistence fails', async () => {
    const privateError = `${giftCard.buyerEmail} ${giftCard.buyerPhone} ${giftCard.message}`;
    const error = Object.assign(new Error(privateError), {
      $metadata: { requestId: 'aws-request-id', httpStatusCode: 500 }
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = createAdminGiftCardsHandler({
      persistence: { list: vi.fn().mockRejectedValue(error) }
    });

    const response = await handler(eventForQuery());
    const logged = JSON.stringify(log.mock.calls);

    expect(response.statusCode).toBe(500);
    expect(logged).toContain('api-request-id');
    expect(logged).toContain('aws-request-id');
    expect(logged).not.toContain(privateError);
    expect(logged).not.toContain(giftCard.buyerEmail);
    expect(logged).not.toContain(giftCard.buyerPhone);
    expect(logged).not.toContain(giftCard.message);
    log.mockRestore();
  });
});

describe('Dynamo administrative gift-card list persistence', () => {
  it('uses a bounded filtered Scan against the configured table and maps domain fields only', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [asDynamoItem(giftCard)],
      LastEvaluatedKey: continuationKey
    });
    const persistence = new DynamoGiftCardListPersistence(
      { send } as unknown as DynamoDBClient,
      'gift-cards-table'
    );

    const page = await persistence.list(1, continuationKey);
    const command = send.mock.calls[0][0];

    expect(command).toBeInstanceOf(ScanCommand);
    expect(command.input).toEqual({
      TableName: 'gift-cards-table',
      Limit: 1,
      ExclusiveStartKey: continuationKey,
      FilterExpression: 'begins_with(#pk, :giftCardPrefix) AND #sk = :metadata',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: {
        ':giftCardPrefix': { S: 'GIFT_CARD#' },
        ':metadata': { S: 'METADATA' }
      }
    });
    expect(page).toEqual({ items: [giftCard], lastEvaluatedKey: continuationKey });
    expect(JSON.stringify(page.items)).not.toContain('"pk"');
    expect(JSON.stringify(page.items)).not.toContain('"sk"');
  });

  it('keeps a non-gift continuation key internal and returns a later gift card', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: nonGiftContinuationKey })
      .mockResolvedValueOnce({ Items: [asDynamoItem(giftCard)] });
    const persistence = new DynamoGiftCardListPersistence(
      { send } as unknown as DynamoDBClient,
      'gift-cards-table'
    );

    const page = await persistence.list(1);

    expect(page).toEqual({ items: [giftCard] });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual(nonGiftContinuationKey);
    expect(JSON.stringify(page)).not.toContain('CLIENT#123');
  });

  it('accumulates partial matches and bounds each scan by the remaining capacity', async () => {
    const secondGiftCard = {
      ...giftCard,
      id: '22222222-2222-4222-8222-222222222222',
      folio: 'BM-REGALO-20260425-EFGH'
    };
    const thirdGiftCard = {
      ...giftCard,
      id: '33333333-3333-4333-8333-333333333333',
      folio: 'BM-REGALO-20260425-IJKL'
    };
    const send = vi.fn()
      .mockResolvedValueOnce({
        Items: [asDynamoItem(giftCard)],
        LastEvaluatedKey: nonGiftContinuationKey
      })
      .mockResolvedValueOnce({
        Items: [asDynamoItem(secondGiftCard), asDynamoItem(thirdGiftCard)]
      });
    const persistence = new DynamoGiftCardListPersistence(
      { send } as unknown as DynamoDBClient,
      'gift-cards-table'
    );

    const page = await persistence.list(3);

    expect(page.items).toEqual([giftCard, secondGiftCard, thirdGiftCard]);
    expect(new Set(page.items.map(({ id }) => id)).size).toBe(3);
    expect(send.mock.calls[0][0].input.Limit).toBe(3);
    expect(send.mock.calls[1][0].input.Limit).toBe(2);
    expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual(nonGiftContinuationKey);
  });

  it('issues a safe token that the next handler request uses as its first scan cursor', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({
        Items: [asDynamoItem(giftCard)],
        LastEvaluatedKey: continuationKey
      })
      .mockResolvedValueOnce({ Items: [] });
    const persistence = new DynamoGiftCardListPersistence(
      { send } as unknown as DynamoDBClient,
      'gift-cards-table'
    );
    const handler = createAdminGiftCardsHandler({ persistence });

    const firstResponse = await handler(eventForQuery({ limit: '1' }));
    const firstBody = JSON.parse(firstResponse.body ?? '{}');
    const secondResponse = await handler(eventForQuery({
      limit: '1',
      nextToken: firstBody.nextToken
    }));

    expect(firstResponse.statusCode).toBe(200);
    expect(firstBody.nextToken).toEqual(expect.any(String));
    expect(secondResponse.statusCode).toBe(200);
    expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual(continuationKey);
  });

  it('returns no continuation after filtered-out scans exhaust the table', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: nonGiftContinuationKey })
      .mockResolvedValueOnce({ Items: [] });
    const persistence = new DynamoGiftCardListPersistence(
      { send } as unknown as DynamoDBClient,
      'gift-cards-table'
    );

    const page = await persistence.list(2);

    expect(page).toEqual({ items: [] });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('fails safely rather than exposing a non-gift key after filling a page', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [asDynamoItem(giftCard)],
      LastEvaluatedKey: nonGiftContinuationKey
    });
    const persistence = new DynamoGiftCardListPersistence(
      { send } as unknown as DynamoDBClient,
      'gift-cards-table'
    );

    await expect(persistence.list(1)).rejects.toThrow('unsafe external continuation key');
  });
});
