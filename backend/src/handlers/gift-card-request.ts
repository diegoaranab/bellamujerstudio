import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { createGiftCardFolio, createGiftCardId } from '../shared/id';
import { GiftCard, GiftCardTableItem, toGiftCardTableItem } from '../shared/gift-card-model';
import { jsonResponse, serverErrorResponse, validationErrorResponse } from '../shared/response';
import { Clock, currentDate, currentISO } from '../shared/time';
import { validatePublicGiftCardRequest } from '../shared/validation';

export interface GiftCardPersistence {
  save(giftCard: GiftCardTableItem): Promise<void>;
}

export interface GiftCardRequestHandlerDependencies {
  persistence: GiftCardPersistence;
  clock?: Clock;
  createId?: () => string;
  createFolio?: (createdAt: Date) => string;
}

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
}

export const createGiftCardRequestHandler = ({
  persistence,
  clock = currentDate,
  createId = createGiftCardId,
  createFolio = createGiftCardFolio
}: GiftCardRequestHandlerDependencies) => {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;

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
      id: createId(),
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
