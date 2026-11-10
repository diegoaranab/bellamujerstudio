import { validateAccessIdentifier } from './club-access-keys';

export interface MemberAuthorizerContext {
  studioId: string;
  clientId: string;
}

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;

export const extractMemberAuthorizerContext = (event: unknown): MemberAuthorizerContext => {
  const root = record(event);
  const requestContext = record(root?.requestContext);
  const authorizer = record(requestContext?.authorizer);
  const lambda = record(authorizer?.lambda);
  const studioId = lambda?.studioId;
  const clientId = lambda?.clientId;
  if (typeof studioId !== 'string' || typeof clientId !== 'string') {
    throw new Error('Missing trusted member authorizer context');
  }
  return {
    studioId: validateAccessIdentifier('studioId', studioId),
    clientId: validateAccessIdentifier('clientId', clientId)
  };
};
