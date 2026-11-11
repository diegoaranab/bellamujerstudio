const OPAQUE_CREDENTIAL_BYTE_LENGTH = 32;
const OPAQUE_CREDENTIAL_ENCODED_LENGTH = 43;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isCanonicalMemberClubCredential(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length !== OPAQUE_CREDENTIAL_ENCODED_LENGTH ||
    !BASE64URL_PATTERN.test(value)
  ) {
    return false;
  }

  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '=';
    const decoded = atob(base64);
    if (decoded.length !== OPAQUE_CREDENTIAL_BYTE_LENGTH) return false;

    const canonical = btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return canonical === value;
  } catch {
    return false;
  }
}
