export const MAX_KEY_SEGMENT_LENGTH = 128;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

export const validateKeySegment = (name: string, value: string): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Array.from(value).length > MAX_KEY_SEGMENT_LENGTH ||
    value.trim() !== value ||
    value.includes('#') ||
    CONTROL_CHARACTER.test(value)
  ) {
    throw new Error(`Invalid Club key segment: ${name}`);
  }

  return value;
};

export interface ClubPhysicalKey {
  pk: string;
  sk: string;
}

export const clientProfileKey = (studioId: string, clientId: string): ClubPhysicalKey => ({
  pk: `STUDIO#${validateKeySegment('studioId', studioId)}`,
  sk: `CLIENT#${validateKeySegment('clientId', clientId)}`
});

export const clientAggregatePartitionKey = (studioId: string, clientId: string): string =>
  `STUDIO#${validateKeySegment('studioId', studioId)}#CLIENT#${validateKeySegment('clientId', clientId)}`;

export const balanceKey = (studioId: string, clientId: string): ClubPhysicalKey => ({
  pk: clientAggregatePartitionKey(studioId, clientId),
  sk: 'BALANCE'
});

export const visitKey = (
  studioId: string,
  clientId: string,
  visitId: string
): ClubPhysicalKey => ({
  pk: clientAggregatePartitionKey(studioId, clientId),
  sk: `VISIT#${validateKeySegment('visitId', visitId)}`
});

export const ledgerKey = (
  studioId: string,
  clientId: string,
  occurredAtISO: string,
  entryId: string
): ClubPhysicalKey => ({
  pk: clientAggregatePartitionKey(studioId, clientId),
  sk: `LEDGER#${validateLedgerTimestamp(occurredAtISO)}#${validateKeySegment('entryId', entryId)}`
});

const validateLedgerTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error('Invalid Club ledger timestamp');
  }
  return value;
};

export const validatePromotionId = (value: string): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('Invalid Club promotion ID');
  }
  return value;
};

export const promotionPartitionKey = (studioId: string): string =>
  `STUDIO#${validateKeySegment('studioId', studioId)}#PROMOTIONS`;

export const promotionKey = (studioId: string, promotionId: string): ClubPhysicalKey => ({
  pk: promotionPartitionKey(studioId), sk: `PROMOTION#${validatePromotionId(promotionId)}`
});
