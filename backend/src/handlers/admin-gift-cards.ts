import {
  AttributeValue,
  DynamoDBClient,
  ScanCommand
} from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { GiftCard, giftCardFromDynamoItem } from '../shared/gift-card-model';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import { jsonResponse } from '../shared/response';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

type ContinuationKey = {
  pk: { S: string };
  sk: { S: string };
};

export interface GiftCardListPage {
  items: GiftCard[];
  lastEvaluatedKey?: ContinuationKey;
}

export interface GiftCardListPersistence {
  list(limit: number, exclusiveStartKey?: ContinuationKey): Promise<GiftCardListPage>;
}

export interface AdminGiftCardsHandlerDependencies {
  persistence: GiftCardListPersistence;
  allowedOrigins?: readonly string[];
}

const hasExactKeys = (value: object, keys: readonly string[]): boolean => {
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === keys.length && actualKeys.every((key, index) => key === [...keys].sort()[index]);
};

const validStringAttribute = (value: unknown, maxBytes: number): value is { S: string } =>
  !!value &&
  typeof value === 'object' &&
  hasExactKeys(value, ['S']) &&
  typeof (value as { S?: unknown }).S === 'string' &&
  Buffer.byteLength((value as { S: string }).S, 'utf8') > 0 &&
  Buffer.byteLength((value as { S: string }).S, 'utf8') <= maxBytes;

const validContinuationKey = (value: unknown): value is ContinuationKey =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  hasExactKeys(value, ['pk', 'sk']) &&
  validStringAttribute((value as { pk?: unknown }).pk, 2048) &&
  validStringAttribute((value as { sk?: unknown }).sk, 1024);

const validGiftCardContinuationKey = (key: ContinuationKey): boolean =>
  key.pk.S.startsWith('GIFT_CARD#') &&
  key.pk.S.length > 'GIFT_CARD#'.length &&
  key.sk.S === 'METADATA';

const encodeNextToken = (key: ContinuationKey): string =>
  Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');

const decodeNextToken = (token: string): ContinuationKey => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Malformed pagination token');

  const decoded = Buffer.from(token, 'base64url');
  if (decoded.toString('base64url') !== token) throw new Error('Malformed pagination token');

  const value: unknown = JSON.parse(decoded.toString('utf8'));
  if (!validContinuationKey(value) || !validGiftCardContinuationKey(value)) {
    throw new Error('Invalid continuation key');
  }
  return value;
};

const parseLimit = (value: string | undefined): number => {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!/^[0-9]+$/.test(value)) throw new Error('Malformed limit');

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw new Error('Limit out of range');
  }
  return parsed;
};

const asContinuationKey = (
  key: Record<string, AttributeValue> | undefined
): ContinuationKey | undefined => {
  if (key === undefined) return undefined;
  if (!validContinuationKey(key)) throw new Error('DynamoDB returned an invalid continuation key');
  return key;
};

export class DynamoGiftCardListPersistence implements GiftCardListPersistence {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {}

  async list(limit: number, exclusiveStartKey?: ContinuationKey): Promise<GiftCardListPage> {
    const items: GiftCard[] = [];
    let scanCursor: ContinuationKey | undefined = exclusiveStartKey;

    while (items.length < limit) {
      const remaining = limit - items.length;
      const result = await this.client.send(new ScanCommand({
        TableName: this.tableName,
        Limit: remaining,
        ...(scanCursor ? { ExclusiveStartKey: scanCursor } : {}),
        FilterExpression: 'begins_with(#pk, :giftCardPrefix) AND #sk = :metadata',
        ExpressionAttributeNames: {
          '#pk': 'pk',
          '#sk': 'sk'
        },
        ExpressionAttributeValues: {
          ':giftCardPrefix': { S: 'GIFT_CARD#' },
          ':metadata': { S: 'METADATA' }
        }
      }));

      const pageItems = (result.Items ?? []).map(giftCardFromDynamoItem);
      if (pageItems.length > remaining) {
        throw new Error('DynamoDB returned more gift cards than the requested scan limit');
      }
      items.push(...pageItems);

      const lastEvaluatedKey = asContinuationKey(result.LastEvaluatedKey);
      if (items.length === limit) {
        if (lastEvaluatedKey && !validGiftCardContinuationKey(lastEvaluatedKey)) {
          throw new Error('DynamoDB returned an unsafe external continuation key');
        }
        return {
          items,
          ...(lastEvaluatedKey ? { lastEvaluatedKey } : {})
        };
      }

      if (!lastEvaluatedKey) return { items };
      scanCursor = lastEvaluatedKey;
    }

    return { items };
  }
}

const logPersistenceFailure = (event: APIGatewayProxyEventV2, error: unknown): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? (error.$metadata as { requestId?: unknown; httpStatusCode?: unknown })
    : undefined;

  console.error('Administrative gift-card list failed', {
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode }
      : {})
  });
};

export const createAdminGiftCardsHandler = ({
  persistence,
  allowedOrigins = originsFromEnvironment()
}: AdminGiftCardsHandlerDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;
    let limit: number;
    let exclusiveStartKey: ContinuationKey | undefined;

    try {
      limit = parseLimit(event.queryStringParameters?.limit);
      const token = event.queryStringParameters?.nextToken;
      exclusiveStartKey = token === undefined ? undefined : decodeNextToken(token);
    } catch {
      return jsonResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'Los parámetros de paginación no son válidos.'
      }, origin, allowedOrigins);
    }

    try {
      const page = await persistence.list(limit, exclusiveStartKey);
      return jsonResponse(200, {
        items: page.items,
        ...(page.lastEvaluatedKey
          ? { nextToken: encodeNextToken(page.lastEvaluatedKey) }
          : {})
      }, origin, allowedOrigins);
    } catch (error) {
      logPersistenceFailure(event, error);
      return jsonResponse(500, {
        error: 'SERVER_ERROR',
        message: 'No pudimos cargar las tarjetas de regalo. Intenta de nuevo en unos minutos.'
      }, origin, allowedOrigins);
    }
  };

const tableName = process.env.GIFT_CARDS_TABLE_NAME;

if (!tableName) {
  console.warn('GIFT_CARDS_TABLE_NAME is not configured.');
}

export const handler = createAdminGiftCardsHandler({
  persistence: new DynamoGiftCardListPersistence(new DynamoDBClient({}), tableName ?? '')
});
