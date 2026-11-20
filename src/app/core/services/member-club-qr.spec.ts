import { buildMemberClubAdminQrTarget, generateMemberClubQrDataUrl } from './member-club-qr';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

describe('member Club QR helpers', () => {
  it.each([
    ['https://diegoaranab.github.io/bellamujerstudio/', `https://diegoaranab.github.io/bellamujerstudio/#/admin/club/clientas/${UUID}/resumen`],
    ['http://localhost:4200/', `http://localhost:4200/#/admin/club/clientas/${UUID}/resumen`],
    [`https://example.test/bellamujerstudio/?access=secret&invite=secret#/club?access=secret`, `https://example.test/bellamujerstudio/#/admin/club/clientas/${UUID}/resumen`]
  ])('builds a clean protected target from %s', (base, expected) => {
    expect(buildMemberClubAdminQrTarget(base, UUID)).toBe(expected);
  });

  it('rejects invalid base protocols and identifiers', () => {
    expect(() => buildMemberClubAdminQrTarget('javascript:alert(1)', UUID)).toThrow();
    expect(() => buildMemberClubAdminQrTarget('https://example.test/', UUID.toUpperCase())).toThrow();
  });

  it('generates an opaque GIF data URL', () => {
    expect(generateMemberClubQrDataUrl(`https://example.test/#/admin/${UUID}`)).toMatch(/^data:image\/gif;base64,/);
  });
});
