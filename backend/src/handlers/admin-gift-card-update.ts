import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  GiftCard,
  GiftCardStatus,
  giftCardFromDynamoItem,
  isGiftCardStatus
} from '../shared/gift-card-model';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import { jsonResponse, payloadTooLargeResponse, validationErrorResponse } from '../shared/response';
import { Clock, currentDate, currentISO } from '../shared/time';

export const MAX_ADMIN_UPDATE_BODY_BYTES = 4 * 1024;
export const MAX_NOTES_LENGTH = 2000;

export interface GiftCardUpdate {
  status?: GiftCardStatus;
  notes?: string;
}

export interface GiftCardUpdatePersistence {
  update(id: string, update: GiftCardUpdate, updatedAtISO: string): Promise<GiftCard>;
}

export interface AdminGiftCardUpdateHandlerDependencies {
  persistence: GiftCardUpdatePersistence;
  clock?: Clock;
  allowedOrigins?: readonly string[];
}

const validId = (id: string | undefined): id is string =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const bodySize = (body: string | undefined, isBase64Encoded?: boolean): number =>
  body ? Buffer.byteLength(body, isBase64Encoded ? 'base64' : 'utf8') : 0;

const parseUpdate = (body: string | undefined, isBase64Encoded?: boolean): GiftCardUpdate => {
  if (!body) throw new SyntaxError('Missing JSON body');
  const json = isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
  const parsed: unknown = JSON.parse(json);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Body must be an object');
  }

  const input = parsed as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => key !== 'status' && key !== 'notes')) {
    throw new TypeError('Body contains invalid keys');
  }

  const update: GiftCardUpdate = {};
  if ('status' in input) {
    if (!isGiftCardStatus(input.status)) throw new TypeError('Invalid status');
    update.status = input.status;
  }
  if ('notes' in input) {
    if (typeof input.notes !== 'string') {
      throw new TypeError('Invalid notes');
    }
    const notes = input.notes.trim();
    if (Array.from(notes).length > MAX_NOTES_LENGTH) throw new TypeError('Invalid notes');
    update.notes = notes;
  }

  return update;
};

const isConditionalFailure = (error: unknown): boolean =>
  error instanceof Error && error.name === 'ConditionalCheckFailedException';

const logPersistenceFailure = (event: APIGatewayProxyEventV2, error: unknown): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? (error.$metadata as { requestId?: unknown; httpStatusCode?: unknown })
    : undefined;

  console.error('Administrative gift-card update failed', {
    operation: 'update',
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode }
      : {})
  });
};

const milestoneForStatus = (status: GiftCardStatus | undefined): string | undefined => {
  if (status === 'pagada') return 'confirmedAtISO';
  if (status === 'entregada') return 'deliveredAtISO';
  if (status === 'usada') return 'usedAtISO';
  return undefined;
};

export class DynamoGiftCardUpdatePersistence implements GiftCardUpdatePersistence {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {}

  async update(id: string, update: GiftCardUpdate, updatedAtISO: string): Promise<GiftCard> {
    const names: Record<string, string> = {
      '#pk': 'pk',
      '#sk': 'sk',
      '#updatedAtISO': 'updatedAtISO'
    };
    const values: Record<string, { S: string }> = {
      ':updatedAtISO': { S: updatedAtISO }
    };
    const setExpressions = ['#updatedAtISO = :updatedAtISO'];
    const removeExpressions: string[] = [];

    if (update.status !== undefined) {
      names['#status'] = 'status';
      values[':status'] = { S: update.status };
      setExpressions.push('#status = :status');

      const milestone = milestoneForStatus(update.status);
      if (milestone) {
        names['#milestone'] = milestone;
        values[':milestone'] = { S: updatedAtISO };
        setExpressions.push('#milestone = if_not_exists(#milestone, :milestone)');
      }
    }

    if (update.notes !== undefined) {
      names['#notes'] = 'notes';
      if (update.notes.length > 0) {
        values[':notes'] = { S: update.notes };
        setExpressions.push('#notes = :notes');
      } else {
        removeExpressions.push('#notes');
      }
    }

    const result = await this.client.send(new UpdateItemCommand({
      TableName: this.tableName,
      Key: {
        pk: { S: `GIFT_CARD#${id}` },
        sk: { S: 'METADATA' }
      },
      ConditionExpression: 'attribute_exists(#pk) AND attribute_exists(#sk)',
      UpdateExpression: [
        `SET ${setExpressions.join(', ')}`,
        ...(removeExpressions.length > 0 ? [`REMOVE ${removeExpressions.join(', ')}`] : [])
      ].join(' '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW'
    }));

    if (!result.Attributes) throw new Error('DynamoDB update returned no attributes');
    return giftCardFromDynamoItem(result.Attributes);
  }
}

export const createAdminGiftCardUpdateHandler = ({
  persistence,
  clock = currentDate,
  allowedOrigins = originsFromEnvironment()
}: AdminGiftCardUpdateHandlerDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;
    if (!validId(event.pathParameters?.id)) {
      return validationErrorResponse(origin, allowedOrigins);
    }
    if (bodySize(event.body, event.isBase64Encoded) > MAX_ADMIN_UPDATE_BODY_BYTES) {
      return payloadTooLargeResponse(origin, allowedOrigins);
    }

    let update: GiftCardUpdate;
    try {
      update = parseUpdate(event.body, event.isBase64Encoded);
    } catch {
      return validationErrorResponse(origin, allowedOrigins);
    }

    try {
      const giftCard = await persistence.update(
        event.pathParameters.id.toLowerCase(),
        update,
        currentISO(clock)
      );
      return jsonResponse(200, giftCard, origin, allowedOrigins);
    } catch (error) {
      if (isConditionalFailure(error)) {
        return jsonResponse(404, {
          error: 'GIFT_CARD_NOT_FOUND',
          message: 'No encontramos la tarjeta de regalo solicitada.'
        }, origin, allowedOrigins);
      }
      logPersistenceFailure(event, error);
      return jsonResponse(500, {
        error: 'SERVER_ERROR',
        message: 'No pudimos actualizar la tarjeta de regalo. Intenta de nuevo en unos minutos.'
      }, origin, allowedOrigins);
    }
  };

const tableName = process.env.GIFT_CARDS_TABLE_NAME;

if (!tableName) {
  console.warn('GIFT_CARDS_TABLE_NAME is not configured.');
}

export const handler = createAdminGiftCardUpdateHandler({
  persistence: new DynamoGiftCardUpdatePersistence(new DynamoDBClient({}), tableName ?? '')
});
