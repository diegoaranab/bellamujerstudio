export const MAX_ACCESS_KEY_SEGMENT_LENGTH = 128;
export const SHA256_DIGEST_PATTERN = /^[a-f0-9]{64}$/;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

export interface ClubAccessPhysicalKey {
  pk: string;
  sk: string;
}

export const validateAccessIdentifier = (name: string, value: string): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Array.from(value).length > MAX_ACCESS_KEY_SEGMENT_LENGTH ||
    value.trim() !== value ||
    value.includes('#') ||
    CONTROL_CHARACTER.test(value)
  ) {
    throw new Error(`Invalid Club access identifier: ${name}`);
  }

  return value;
};

export const validateSecretDigest = (name: string, value: string): string => {
  if (typeof value !== 'string' || !SHA256_DIGEST_PATTERN.test(value)) {
    throw new Error(`Invalid Club access digest: ${name}`);
  }
  return value;
};

export const memberAccessKey = (clientId: string): ClubAccessPhysicalKey => ({
  pk: `CLIENT#${validateAccessIdentifier('clientId', clientId)}`,
  sk: 'MEMBER_ACCESS'
});

export const handleLookupKey = (handleDigest: string): ClubAccessPhysicalKey => ({
  pk: `HANDLE#${validateSecretDigest('handleDigest', handleDigest)}`,
  sk: 'HANDLE'
});

export const invitationKey = (invitationDigest: string): ClubAccessPhysicalKey => ({
  pk: `INVITE#${validateSecretDigest('invitationDigest', invitationDigest)}`,
  sk: 'INVITE'
});

export const sessionKey = (sessionDigest: string): ClubAccessPhysicalKey => ({
  pk: `SESSION#${validateSecretDigest('sessionDigest', sessionDigest)}`,
  sk: 'SESSION'
});
