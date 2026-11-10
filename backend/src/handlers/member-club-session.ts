import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { extractMemberAuthorizerContext } from '../club-access/member-authorizer-context';

const authenticatedResponse = (): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ authenticated: true })
});

const invalidContextResponse = (): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 500,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    error: 'SERVER_ERROR',
    message: 'No pudimos validar la sesión. Intenta de nuevo en unos minutos.'
  })
});

export const createMemberClubSessionHandler = () =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      extractMemberAuthorizerContext(event);
      return authenticatedResponse();
    } catch {
      return invalidContextResponse();
    }
  };

export const handler = createMemberClubSessionHandler();
