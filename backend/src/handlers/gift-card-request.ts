import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { createGiftCardFolio } from '../shared/id';
import { GiftCard, GiftCardTableItem, PublicGiftCardRequest, toGiftCardTableItem } from '../shared/gift-card-model';
import { jsonResponse, serverErrorResponse, validationErrorResponse } from '../shared/response';
import { Clock, currentDate, currentISO } from '../shared/time';
import { validatePublicGiftCardRequest } from '../shared/validation';

export interface GiftCardPersistence {
  save(giftCard: GiftCardTableItem): Promise<void>;
  get(id: string): Promise<GiftCard | undefined>;
}

export interface GiftCardRequestHandlerDependencies {
  persistence: GiftCardPersistence;
  clock?: Clock;
  createFolio?: (createdAt: Date) => string;
}

const validKey = (key: string | undefined): key is string =>
  !!key && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);

const isConditionalFailure = (error: unknown): boolean =>
  error instanceof Error && error.name === 'ConditionalCheckFailedException';

const sameRequest = (existing: GiftCard, request: PublicGiftCardRequest): boolean =>
  existing.buyerName === request.buyerName &&
  existing.buyerPhone === request.buyerPhone &&
  (existing.buyerEmail ?? undefined) === request.buyerEmail &&
  existing.recipientName === request.recipientName &&
  (existing.recipientPhone ?? undefined) === request.recipientPhone &&
  existing.amountMXN === request.amountMXN &&
  (existing.message ?? undefined) === request.message;

const parseBody = (body: string | undefined, isBase64Encoded?: boolean): unknown => {
  if (!body) {
    throw new SyntaxError('Missing JSON body');
  }

  const json = isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;

  return JSON.parse(json);
};

const toDynamoItem = (giftCard: GiftCardTableItem): PutItemCommand['input']['Item'] => ({
  pk: { S: giftCard.pk },
  sk: { S: giftCard.sk },
  id: { S: giftCard.id },
  folio: { S: giftCard.folio },
  status: { S: giftCard.status },
  paymentMethod: { S: giftCard.paymentMethod },
  createdAtISO: { S: giftCard.createdAtISO },
  updatedAtISO: { S: giftCard.updatedAtISO },
  buyerName: { S: giftCard.buyerName },
  buyerPhone: { S: giftCard.buyerPhone },
  ...(giftCard.buyerEmail ? { buyerEmail: { S: giftCard.buyerEmail } } : {}),
  recipientName: { S: giftCard.recipientName },
  ...(giftCard.recipientPhone ? { recipientPhone: { S: giftCard.recipientPhone } } : {}),
  amountMXN: { N: String(giftCard.amountMXN) },
  ...(giftCard.message ? { message: { S: giftCard.message } } : {})
});

export class DynamoGiftCardPersistence implements GiftCardPersistence {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {}

  async save(giftCard: GiftCardTableItem): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: toDynamoItem(giftCard),
        ConditionExpression: 'attribute_not_exists(pk)'
      })
    );
  }

  async get(id: string): Promise<GiftCard | undefined> {
    const result = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: { pk: { S: `GIFT_CARD#${id}` }, sk: { S: 'METADATA' } },
      ConsistentRead: true
    }));
    const item = result.Item;
    if (!item) return undefined;
    return {
      id: item.id.S!, folio: item.folio.S!, status: 'pendiente',
      paymentMethod: 'transferencia', createdAtISO: item.createdAtISO.S!,
      updatedAtISO: item.updatedAtISO.S!, buyerName: item.buyerName.S!,
      buyerPhone: item.buyerPhone.S!,
      ...(item.buyerEmail?.S ? { buyerEmail: item.buyerEmail.S } : {}),
      recipientName: item.recipientName.S!,
      ...(item.recipientPhone?.S ? { recipientPhone: item.recipientPhone.S } : {}),
      amountMXN: Number(item.amountMXN.N),
      ...(item.message?.S ? { message: item.message.S } : {})
    };
  }
}

export const createGiftCardRequestHandler = ({
  persistence,
  clock = currentDate,
  createFolio = createGiftCardFolio
}: GiftCardRequestHandlerDependencies) => {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;
    const key = event.headers['idempotency-key'] ?? event.headers['Idempotency-Key'];
    if (!validKey(key)) return validationErrorResponse(origin);

    let parsedBody: unknown;

    try {
      parsedBody = parseBody(event.body, event.isBase64Encoded);
    } catch {
      return validationErrorResponse(origin);
    }

    const validation = validatePublicGiftCardRequest(parsedBody);

    if (!validation.ok) {
      return validationErrorResponse(origin);
    }

    const now = clock();
    const nowISO = currentISO(() => now);
    const giftCard: GiftCard = {
      id: key.toLowerCase(),
      folio: createFolio(now),
      createdAtISO: nowISO,
      updatedAtISO: nowISO,
      paymentMethod: 'transferencia',
      status: 'pendiente',
      ...validation.value
    };

    try {
      await persistence.save(toGiftCardTableItem(giftCard));
    } catch (error) {
      if (isConditionalFailure(error)) {
        try {
          const existing = await persistence.get(giftCard.id);
          if (existing) {
            return sameRequest(existing, validation.value)
              ? jsonResponse(200, existing, origin)
              : jsonResponse(409, { error: 'IDEMPOTENCY_CONFLICT', message: 'Esta clave ya se usó para otra solicitud.' }, origin);
          }
        } catch (lookupError) {
          console.error('Failed to load gift card replay', lookupError);
        }
      }
      console.error('Failed to save gift card request', error);

      return serverErrorResponse(origin);
    }

    return jsonResponse(201, giftCard, origin);
  };
};

const tableName = process.env.GIFT_CARDS_TABLE_NAME;

if (!tableName) {
  console.warn('GIFT_CARDS_TABLE_NAME is not configured.');
}

export const handler = createGiftCardRequestHandler({
  persistence: new DynamoGiftCardPersistence(new DynamoDBClient({}), tableName ?? '')
});
