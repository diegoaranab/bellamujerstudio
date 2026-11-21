import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { extractMemberAuthorizerContext } from '../club-access/member-authorizer-context';
import { ClubPromotion } from '../club/club-model';
import { DynamoClubPersistence } from '../club/club-persistence';

export interface MemberPromotionsPersistence {
  listPromotions(studioId: string): Promise<ClubPromotion[]>;
}

const response = (statusCode: number, body: object): APIGatewayProxyStructuredResultV2 => ({
  statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

export const createMemberClubPromotionsHandler = ({ persistence, now = () => new Date() }: {
  persistence: MemberPromotionsPersistence; now?: () => Date;
}) => async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const { studioId } = extractMemberAuthorizerContext(event);
    if (studioId !== 'bella-mujer') throw new Error('Unexpected studio');
    if (event.rawQueryString || Object.keys(event.queryStringParameters ?? {}).length) {
      return response(400, { error: 'VALIDATION_ERROR', message: 'La solicitud no es válida.' });
    }
    const instant = now().toISOString();
    const promotions = await persistence.listPromotions(studioId);
    const selected = promotions.filter((p) => p.status === 'active' && p.startsAtISO <= instant && instant < p.endsAtISO)
      .sort((a, b) => a.startsAtISO === b.startsAtISO
        ? (a.promotionId < b.promotionId ? -1 : a.promotionId > b.promotionId ? 1 : 0)
        : (a.startsAtISO > b.startsAtISO ? -1 : 1))[0];
    return response(200, { promotion: selected ? {
      title: selected.title, description: selected.description,
      startsAtISO: selected.startsAtISO, endsAtISO: selected.endsAtISO
    } : null });
  } catch {
    console.error('Club member promotions operation failed', { apiRequestId: event.requestContext?.requestId });
    return response(500, { error: 'SERVER_ERROR', message: 'No pudimos cargar las promociones de Bella Mujer Club. Intenta de nuevo en unos minutos.' });
  }
};

const tableName = process.env.CLUB_TABLE_NAME;
const persistence: MemberPromotionsPersistence = tableName
  ? new DynamoClubPersistence(new DynamoDBClient({}), tableName)
  : { listPromotions: async () => { throw new Error('Club table is not configured'); } };
export const handler = createMemberClubPromotionsHandler({ persistence });
