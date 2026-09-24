import { GiftCard } from './gift-card.model';

export type PublicGiftCardRequest = Pick<
  GiftCard,
  'buyerName' | 'buyerPhone' | 'recipientName' | 'amountMXN'
> & Pick<Partial<GiftCard>, 'buyerEmail' | 'recipientPhone' | 'message'>;

export type PublicGiftCardResponse = PublicGiftCardRequest & Pick<
  GiftCard,
  'id' | 'folio' | 'createdAtISO' | 'updatedAtISO' | 'status' | 'paymentMethod'
>;
