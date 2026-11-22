import { describe, expect, it } from 'vitest';
import { validateClubPromotion } from '../src/club/club-model';
import {
  PROMOTION_STUDIO_TIME_ZONE,
  promotionLocalDateTimeToCanonicalISO,
  promotionLocalIntervalToCanonicalISO
} from '../src/club/promotion-admin-time';

const CANONICAL_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const expectCanonicalRoundTrip = (value: string): void => {
  expect(value).toMatch(CANONICAL_UTC_PATTERN);
  expect(new Date(value).toISOString()).toBe(value);
  expect(validateClubPromotion({
    studioId: 'bella-mujer', promotionId: '11111111-1111-4111-8111-111111111111',
    title: 'Oferta', description: 'Descripción', status: 'inactive',
    startsAtISO: value, endsAtISO: '2027-01-01T00:00:00.000Z',
    createdAtISO: value, updatedAtISO: value
  }).startsAtISO).toBe(value);
};

describe('promotion administration local time contract', () => {
  it('uses the authoritative IANA studio timezone and converts current Mexico City time', () => {
    expect(PROMOTION_STUDIO_TIME_ZONE).toBe('America/Mexico_City');
    const converted = promotionLocalDateTimeToCanonicalISO('2026-11-21T19:05');
    expect(converted).toBe('2026-11-22T01:05:00.000Z');
    expectCanonicalRoundTrip(converted);
  });

  it('accepts a valid leap date', () => {
    const converted = promotionLocalDateTimeToCanonicalISO('2024-02-29T09:30');
    expect(converted).toBe('2024-02-29T15:30:00.000Z');
    expectCanonicalRoundTrip(converted);
  });

  it.each([
    '2026-11-21T19:05:00', '2026-11-21T19:05:00.000', '2026-11-21T19:05Z',
    '2026-11-21T19:05-06:00', '2026-11-21T19:05[America/Mexico_City]',
    ' 2026-11-21T19:05', '2026-11-21T19:05 ', '2026-1-21T19:05',
    '2026-11-1T19:05', '2026-11-21T9:05', '2026-11-21T19:5',
    '2026-11-21', '19:05', '', undefined, null, 42
  ])('rejects malformed DTO value %j', (value) => {
    expect(() => promotionLocalDateTimeToCanonicalISO(value as string)).toThrow();
  });

  it.each([
    '2026-13-01T10:00', '2026-04-31T10:00', '2023-02-29T10:00',
    '2026-11-21T24:00', '2026-11-21T10:60'
  ])('rejects impossible calendar or time value %s', (value) => {
    expect(() => promotionLocalDateTimeToCanonicalISO(value)).toThrow();
  });

  it('rejects a real historical Mexico City DST gap and overlap', () => {
    expect(() => promotionLocalDateTimeToCanonicalISO('2021-04-04T02:30')).toThrow();
    expect(() => promotionLocalDateTimeToCanonicalISO('2021-10-31T01:30')).toThrow();
  });

  it('converts each valid interval endpoint independently', () => {
    const interval = promotionLocalIntervalToCanonicalISO('2026-11-21T19:05', '2026-11-21T20:05');
    expect(interval).toEqual({
      startsAtISO: '2026-11-22T01:05:00.000Z',
      endsAtISO: '2026-11-22T02:05:00.000Z'
    });
    expectCanonicalRoundTrip(interval.startsAtISO);
    expectCanonicalRoundTrip(interval.endsAtISO);
  });

  it.each([
    ['2026-11-21T19:05', '2026-11-21T19:05'],
    ['2026-11-21T20:05', '2026-11-21T19:05']
  ])('rejects equal or reverse endpoints %s → %s', (start, end) => {
    expect(() => promotionLocalIntervalToCanonicalISO(start, end)).toThrow();
  });

  it.each([
    ['2026-02-30T19:05', '2026-11-21T20:05'],
    ['2026-11-21T19:05', '2026-02-30T20:05']
  ])('rejects an invalid interval endpoint %s → %s', (start, end) => {
    expect(() => promotionLocalIntervalToCanonicalISO(start, end)).toThrow();
  });
});
