import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { jsonResponse } from '../shared/response';

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> =>
  jsonResponse(
    200,
    {
      ok: true,
      service: 'bella-mujer-api'
    },
    event.headers.origin
  );
