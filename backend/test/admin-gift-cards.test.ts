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
      Items: [{
        pk: continuationKey.pk,
        sk: continuationKey.sk,
        id: { S: giftCard.id },
        folio: { S: giftCard.folio },
        createdAtISO: { S: giftCard.createdAtISO },
        updatedAtISO: { S: giftCard.updatedAtISO },
        paymentMethod: { S: giftCard.paymentMethod },
        status: { S: giftCard.status },
        buyerName: { S: giftCard.buyerName },
        buyerPhone: { S: giftCard.buyerPhone },
        buyerEmail: { S: giftCard.buyerEmail },
        recipientName: { S: giftCard.recipientName },
        recipientPhone: { S: giftCard.recipientPhone },
        amountMXN: { N: String(giftCard.amountMXN) },
        message: { S: giftCard.message }
      }],
      LastEvaluatedKey: continuationKey
    });
    const persistence = new DynamoGiftCardListPersistence(
      { send } as unknown as DynamoDBClient,
      'gift-cards-table'
    );

    const page = await persistence.list(25, continuationKey);
    const command = send.mock.calls[0][0];

    expect(command).toBeInstanceOf(ScanCommand);
    expect(command.input).toEqual({
      TableName: 'gift-cards-table',
      Limit: 25,
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
});
