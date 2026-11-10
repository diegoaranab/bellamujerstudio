import { describe, expect, it } from 'vitest';
import { createClubClientId } from '../src/club/club-id';

describe('Club client ID', () => {
  it('creates a lowercase UUID', () => {
    expect(createClubClientId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
