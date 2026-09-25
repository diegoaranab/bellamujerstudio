export const FRONTEND_PRODUCTION_URLS_CONTEXT_KEY = 'frontendProductionUrls';

export const DEFAULT_FRONTEND_URLS = [
  'http://localhost:4200/',
  'https://diegoaranab.github.io/bellamujerstudio/'
] as const;

export interface FrontendConfiguration {
  urls: string[];
  origins: string[];
}

const configuredUrls = (value: unknown): string[] => {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value.map((entry) => entry.trim()).filter(Boolean);
  }

  throw new Error(
    `${FRONTEND_PRODUCTION_URLS_CONTEXT_KEY} must be a URL or comma-separated list of URLs.`
  );
};

const normalizeFrontendUrl = (value: string, requireHttps: boolean): string => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid frontend URL: ${value}`);
  }

  if (
    (requireHttps && url.protocol !== 'https:') ||
    (!requireHttps && !['http:', 'https:'].includes(url.protocol))
  ) {
    throw new Error(`Frontend URL must use ${requireHttps ? 'HTTPS' : 'HTTP or HTTPS'}: ${value}`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`Frontend URL cannot include credentials, a query, or a fragment: ${value}`);
  }

  url.pathname = url.pathname.replace(/\/*$/, '/');

  return url.toString();
};

export const resolveFrontendConfiguration = (productionUrls?: unknown): FrontendConfiguration => {
  const defaults = DEFAULT_FRONTEND_URLS.map((url) => normalizeFrontendUrl(url, false));
  const production = configuredUrls(productionUrls).map((url) => normalizeFrontendUrl(url, true));
  const urls = [...new Set([...defaults, ...production])];
  const origins = [...new Set(urls.map((url) => new URL(url).origin))];

  return { urls, origins };
};

export const originsFromEnvironment = (value = process.env.ALLOWED_FRONTEND_ORIGINS): string[] =>
  value
    ? value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
    : [];
