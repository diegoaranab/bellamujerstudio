import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { corsHeaders } from './cors';

export const jsonResponse = (
  statusCode: number,
  body: unknown,
  origin: string | undefined,
  allowedOrigins: readonly string[]
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(origin, allowedOrigins)
  },
  body: JSON.stringify(body)
});

export const validationErrorResponse = (
  origin: string | undefined,
  allowedOrigins: readonly string[]
): APIGatewayProxyStructuredResultV2 =>
  jsonResponse(
    400,
    {
      error: 'VALIDATION_ERROR',
      message: 'Revisa los datos de la solicitud.'
    },
    origin,
    allowedOrigins
  );

export const payloadTooLargeResponse = (
  origin: string | undefined,
  allowedOrigins: readonly string[]
): APIGatewayProxyStructuredResultV2 =>
  jsonResponse(
    413,
    {
      error: 'REQUEST_TOO_LARGE',
      message: 'La solicitud excede el tamaño permitido.'
    },
    origin,
    allowedOrigins
  );

export const serverErrorResponse = (
  origin: string | undefined,
  allowedOrigins: readonly string[]
): APIGatewayProxyStructuredResultV2 =>
  jsonResponse(
    500,
    {
      error: 'SERVER_ERROR',
      message: 'No pudimos guardar la solicitud. Intenta de nuevo en unos minutos.'
    },
    origin,
    allowedOrigins
  );
