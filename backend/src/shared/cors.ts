export const allowedOrigins = [
  'http://localhost:4200',
  'https://diegoaranab.github.io',
  'https://bellamujerestudio.com'
] as const;

export const corsHeaders = (origin?: string): Record<string, string> => {
  const allowedOrigin = origin && allowedOrigins.includes(origin as (typeof allowedOrigins)[number])
    ? origin
    : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'content-type,authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    Vary: 'Origin'
  };
};
