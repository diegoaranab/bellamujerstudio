import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ClubPromotion } from '../club/club-model';
import { DynamoClubPersistence } from '../club/club-persistence';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import { jsonResponse, validationErrorResponse } from '../shared/response';

export interface ClubPromotionsReadPersistence {
  listPromotions(studioId: string): Promise<ClubPromotion[]>;
  getPromotion(studioId: string, promotionId: string): Promise<ClubPromotion | undefined>;
}

export interface AdminClubPromotionsHandlerDependencies {
  persistence: ClubPromotionsReadPersistence;
  studioId: string;
  allowedOrigins?: readonly string[];
}

export interface AdminPromotionDto {
  promotionId: string;
  title: string;
  description: string;
  status: 'active' | 'inactive';
  startsAtISO: string;
  endsAtISO: string;
  createdAtISO: string;
  updatedAtISO: string;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toAdminPromotionDto = (promotion: ClubPromotion): AdminPromotionDto => ({
  promotionId: promotion.promotionId,
  title: promotion.title,
  description: promotion.description,
  status: promotion.status,
  startsAtISO: promotion.startsAtISO,
  endsAtISO: promotion.endsAtISO,
  createdAtISO: promotion.createdAtISO,
  updatedAtISO: promotion.updatedAtISO
});

const hasQueryParameters = (event: APIGatewayProxyEventV2): boolean =>
  !!event.rawQueryString || Object.keys(event.queryStringParameters ?? {}).length > 0;

const logReadFailure = (
  operation: 'list-promotions' | 'get-promotion-detail',
  event: APIGatewayProxyEventV2,
  error: unknown
): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? (error.$metadata as { requestId?: unknown; httpStatusCode?: unknown })
    : undefined;
  console.error('Administrative Club promotion read failed', {
    operation,
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode }
      : {})
  });
};

export const createAdminClubPromotionsHandler = ({
  persistence,
  studioId,
  allowedOrigins = originsFromEnvironment()
}: AdminClubPromotionsHandlerDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers?.origin;
    const routeKey = event.routeKey;

    if (routeKey !== 'GET /admin/club/promotions' &&
        routeKey !== 'GET /admin/club/promotions/{promotionId}') {
      return jsonResponse(404, {
        error: 'NOT_FOUND',
        message: 'No encontramos la solicitud.'
      }, origin, allowedOrigins);
    }

    if (hasQueryParameters(event)) return validationErrorResponse(origin, allowedOrigins);

    if (routeKey === 'GET /admin/club/promotions/{promotionId}') {
      const rawPromotionId = event.pathParameters?.promotionId;
      if (!rawPromotionId || !UUID_V4.test(rawPromotionId)) {
        return validationErrorResponse(origin, allowedOrigins);
      }
      const promotionId = rawPromotionId.toLowerCase();
      try {
        const promotion = await persistence.getPromotion(studioId, promotionId);
        if (!promotion) {
          return jsonResponse(404, {
            error: 'PROMOTION_NOT_FOUND',
            message: 'No encontramos la promoción solicitada.'
          }, origin, allowedOrigins);
        }
        return jsonResponse(200, { promotion: toAdminPromotionDto(promotion) }, origin, allowedOrigins);
      } catch (error) {
        logReadFailure('get-promotion-detail', event, error);
        return jsonResponse(500, {
          error: 'SERVER_ERROR',
          message: 'No pudimos cargar la promoción. Intenta de nuevo en unos minutos.'
        }, origin, allowedOrigins);
      }
    }

    try {
      const promotions = await persistence.listPromotions(studioId);
      return jsonResponse(200, { items: promotions.map(toAdminPromotionDto) }, origin, allowedOrigins);
    } catch (error) {
      logReadFailure('list-promotions', event, error);
      return jsonResponse(500, {
        error: 'SERVER_ERROR',
        message: 'No pudimos cargar las promociones. Intenta de nuevo en unos minutos.'
      }, origin, allowedOrigins);
    }
  };

const tableName = process.env.CLUB_TABLE_NAME;
const studioId = process.env.CLUB_STUDIO_ID;
if (!tableName) console.warn('CLUB_TABLE_NAME is not configured.');
if (!studioId) console.warn('CLUB_STUDIO_ID is not configured.');

const unavailable = async (): Promise<never> => { throw new Error('Club table is not configured'); };
const runtimePersistence: ClubPromotionsReadPersistence = tableName && studioId
  ? new DynamoClubPersistence(new DynamoDBClient({}), tableName)
  : { listPromotions: unavailable, getPromotion: unavailable };

export const handler = createAdminClubPromotionsHandler({
  persistence: runtimePersistence,
  studioId: studioId ?? ''
});
