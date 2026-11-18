import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { DynamoClubPersistence } from '../club/club-persistence';
import { ClubClient, LoyaltyBalance } from '../club/club-model';
import { extractMemberAuthorizerContext } from '../club-access/member-authorizer-context';

export interface MemberClubSelfSummaryPersistence {
  getClient(studioId: string, clientId: string): Promise<ClubClient | undefined>;
  getBalance(studioId: string, clientId: string): Promise<LoyaltyBalance | undefined>;
}

export interface MemberClubSelfSummaryDependencies {
  persistence: MemberClubSelfSummaryPersistence;
}

const jsonResponse = (statusCode: number, body: object): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body)
});

const failureResponse = (): APIGatewayProxyStructuredResultV2 => jsonResponse(500, {
  error: 'SERVER_ERROR',
  message: 'No pudimos cargar tu información de Bella Mujer Club. Intenta de nuevo en unos minutos.'
});

const logFailure = (operation: string, event: APIGatewayProxyEventV2, error?: unknown): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? error.$metadata as { requestId?: unknown; httpStatusCode?: unknown }
    : undefined;
  console.error('Club member self-summary operation failed', {
    operation,
    apiRequestId: event.requestContext.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode } : {})
  });
};

export const createMemberClubSelfSummaryHandler = ({ persistence }: MemberClubSelfSummaryDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const { studioId, clientId } = extractMemberAuthorizerContext(event);
      const [profile, balance] = await Promise.all([
        persistence.getClient(studioId, clientId),
        persistence.getBalance(studioId, clientId)
      ]);
      if (!profile || !balance) {
        logFailure('invalid-member-club-aggregate', event);
        return failureResponse();
      }
      return jsonResponse(200, {
        profile: { name: profile.name },
        loyalty: { stampCount: balance.stampCount }
      });
    } catch (error) {
      logFailure('get-member-self-summary', event, error);
      return failureResponse();
    }
  };

const tableName = process.env.CLUB_TABLE_NAME;
if (!tableName) console.warn('CLUB_TABLE_NAME is not configured.');
const unavailable = async (): Promise<never> => {
  throw new Error('Club member self-summary is not configured');
};
const persistence = tableName
  ? new DynamoClubPersistence(new DynamoDBClient({}), tableName)
  : { getClient: unavailable, getBalance: unavailable };

export const handler = createMemberClubSelfSummaryHandler({ persistence });
