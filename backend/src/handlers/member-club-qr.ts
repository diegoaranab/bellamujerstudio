import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { extractMemberAuthorizerContext } from '../club-access/member-authorizer-context';

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const jsonResponse = (statusCode: number, body: object): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body)
});

const failureResponse = (): APIGatewayProxyStructuredResultV2 => jsonResponse(500, {
  error: 'SERVER_ERROR',
  message: 'No pudimos cargar tu identificación de Bella Mujer Club. Intenta de nuevo en unos minutos.'
});

const logFailure = (event: APIGatewayProxyEventV2, error?: unknown): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? error.$metadata as { requestId?: unknown; httpStatusCode?: unknown }
    : undefined;
  console.error('Club member QR identification operation failed', {
    operation: 'member-qr-identification',
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode } : {})
  });
};

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const { clientId } = extractMemberAuthorizerContext(event);
    if (!CANONICAL_UUID_PATTERN.test(clientId)) {
      logFailure(event);
      return failureResponse();
    }
    return jsonResponse(200, { qr: { identifier: clientId } });
  } catch (error) {
    logFailure(event, error);
    return failureResponse();
  }
};
