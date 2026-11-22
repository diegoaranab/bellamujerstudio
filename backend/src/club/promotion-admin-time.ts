import { Temporal } from 'temporal-polyfill/implementation';

export const PROMOTION_STUDIO_TIME_ZONE = 'America/Mexico_City';

const LOCAL_MINUTE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const CANONICAL_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const promotionLocalDateTimeToCanonicalISO = (value: string): string => {
  if (typeof value !== 'string') throw new Error('Invalid promotion local datetime');
  const match = LOCAL_MINUTE_PATTERN.exec(value);
  if (!match) throw new Error('Invalid promotion local datetime');

  const [, year, month, day, hour, minute] = match;
  const localDateTime = Temporal.PlainDateTime.from({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute)
  }, { overflow: 'reject' });

  const zonedDateTime = localDateTime.toZonedDateTime(PROMOTION_STUDIO_TIME_ZONE, {
    disambiguation: 'reject'
  });
  const canonicalISO = zonedDateTime.toInstant().toString({ fractionalSecondDigits: 3 });
  if (!CANONICAL_UTC_PATTERN.test(canonicalISO)) throw new Error('Invalid canonical promotion timestamp');
  return canonicalISO;
};

export const promotionLocalIntervalToCanonicalISO = (
  startsAtLocal: string,
  endsAtLocal: string
): { startsAtISO: string; endsAtISO: string } => {
  const startsAtISO = promotionLocalDateTimeToCanonicalISO(startsAtLocal);
  const endsAtISO = promotionLocalDateTimeToCanonicalISO(endsAtLocal);
  if (startsAtISO >= endsAtISO) throw new Error('Invalid promotion interval');
  return { startsAtISO, endsAtISO };
};
