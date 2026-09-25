export const corsHeaders = (
  origin: string | undefined,
  allowedOrigins: readonly string[]
): Record<string, string> => ({
  ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Idempotency-Key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  Vary: 'Origin'
});
