export type GiftCardStatus = 'pendiente';
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
