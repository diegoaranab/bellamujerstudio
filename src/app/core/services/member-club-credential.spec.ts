import { isCanonicalMemberClubCredential } from './member-club-credential';

describe('isCanonicalMemberClubCredential', () => {
  const valid = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  it('accepts canonical unpadded base64url representing exactly 32 bytes', () => {
    expect(isCanonicalMemberClubCredential(valid)).toBe(true);
  });

  it.each([
    ['wrong decoded length', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['padding', `${valid}=`],
    ['invalid alphabet', `${valid.slice(0, -1)}+`],
    ['non-canonical whitespace', ` ${valid}`]
  ])('rejects %s', (_label, value) => {
    expect(isCanonicalMemberClubCredential(value)).toBe(false);
  });
});
