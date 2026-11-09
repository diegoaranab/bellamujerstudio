import { AttributeValue } from '@aws-sdk/client-dynamodb';

export const GIFT_CARD_STATUSES = [
  'pendiente',
  'pagada',
  'entregada',
  'usada',
  'cancelada'
] as const;

export type GiftCardStatus = typeof GIFT_CARD_STATUSES[number];
export type GiftCardPaymentMethod = 'transferencia';

export interface PublicGiftCardRequest {
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  recipientName: string;
  recipientPhone?: string;
  amountMXN: number;
  message?: string;
}

export interface GiftCard extends PublicGiftCardRequest {
  id: string;
  folio: string;
  createdAtISO: string;
  updatedAtISO: string;
  paymentMethod: GiftCardPaymentMethod;
  status: GiftCardStatus;
  confirmedAtISO?: string;
  deliveredAtISO?: string;
  usedAtISO?: string;
  notes?: string;
}

export interface GiftCardTableItem extends GiftCard {
  pk: string;
  sk: 'METADATA';
}

export const toGiftCardTableItem = (giftCard: GiftCard): GiftCardTableItem => ({
  ...giftCard,
  pk: `GIFT_CARD#${giftCard.id}`,
  sk: 'METADATA'
});

const requiredString = (item: Record<string, AttributeValue>, field: string): string => {
  const value = item[field]?.S;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid gift-card field: ${field}`);
  }
  return value;
};

const optionalString = (
  item: Record<string, AttributeValue>,
  field: string
): string | undefined => {
  const attribute = item[field];
  if (attribute === undefined) return undefined;
  if (typeof attribute.S !== 'string' || attribute.S.length === 0) {
    throw new Error(`Invalid gift-card field: ${field}`);
  }
  return attribute.S;
};

export const isGiftCardStatus = (value: unknown): value is GiftCardStatus =>
  typeof value === 'string' && (GIFT_CARD_STATUSES as readonly string[]).includes(value);

export const giftCardFromDynamoItem = (
  item: Record<string, AttributeValue>
): GiftCard => {
  const amount = Number(item.amountMXN?.N);
  if (!Number.isFinite(amount)) throw new Error('Invalid gift-card field: amountMXN');

  const status = requiredString(item, 'status');
  if (!isGiftCardStatus(status)) throw new Error('Invalid gift-card field: status');

  const paymentMethod = requiredString(item, 'paymentMethod');
  if (paymentMethod !== 'transferencia') {
    throw new Error('Invalid gift-card field: paymentMethod');
  }

  const buyerEmail = optionalString(item, 'buyerEmail');
  const recipientPhone = optionalString(item, 'recipientPhone');
  const message = optionalString(item, 'message');
  const confirmedAtISO = optionalString(item, 'confirmedAtISO');
  const deliveredAtISO = optionalString(item, 'deliveredAtISO');
  const usedAtISO = optionalString(item, 'usedAtISO');
  const notes = optionalString(item, 'notes');

  return {
    id: requiredString(item, 'id'),
    folio: requiredString(item, 'folio'),
    createdAtISO: requiredString(item, 'createdAtISO'),
    updatedAtISO: requiredString(item, 'updatedAtISO'),
    paymentMethod,
    status,
    buyerName: requiredString(item, 'buyerName'),
    buyerPhone: requiredString(item, 'buyerPhone'),
    ...(buyerEmail ? { buyerEmail } : {}),
    recipientName: requiredString(item, 'recipientName'),
    ...(recipientPhone ? { recipientPhone } : {}),
    amountMXN: amount,
    ...(message ? { message } : {}),
    ...(confirmedAtISO ? { confirmedAtISO } : {}),
    ...(deliveredAtISO ? { deliveredAtISO } : {}),
    ...(usedAtISO ? { usedAtISO } : {}),
    ...(notes ? { notes } : {})
  };
};
