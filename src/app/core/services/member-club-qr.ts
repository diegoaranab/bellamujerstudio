import encodeQR from 'qr';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function buildMemberClubAdminQrTarget(baseUri: string, identifier: string): string {
  if (!UUID_V4.test(identifier)) throw new TypeError('Invalid member identifier');
  const base = new URL(baseUri);
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new TypeError('Invalid application base URI');
  }
  base.search = '';
  base.hash = `/admin/club/clientas/${encodeURIComponent(identifier)}/resumen`;
  return base.toString();
}

export function generateMemberClubQrDataUrl(target: string): string {
  return encodeQR(target, 'data-url', { ecc: 'medium', border: 4, scale: 8 });
}
