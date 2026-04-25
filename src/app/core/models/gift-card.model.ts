export type GiftCardStatus =
  | 'pendiente'
  | 'pagada'
  | 'entregada'
  | 'usada'
  | 'cancelada';

export type GiftCardPaymentMethod =
  | 'transferencia'
  | 'efectivo'
  | 'tarjeta'
  | 'otro';

export interface GiftCard {
  id: string;
  folio: string;
  createdAtISO: string;
  updatedAtISO?: string;
  confirmedAtISO?: string;
  deliveredAtISO?: string;
  usedAtISO?: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  recipientName: string;
  recipientPhone?: string;
  amountMXN: number;
  message?: string;
  paymentMethod: GiftCardPaymentMethod;
  status: GiftCardStatus;
  notes?: string;
}

export type GiftCardCreateInput = Omit<
  GiftCard,
  'id' | 'folio' | 'createdAtISO' | 'updatedAtISO'
> & {
  folio?: string;
  createdAtISO?: string;
};

export interface GiftCardSummary {
  totalCards: number;
  pendingCount: number;
  paidCount: number;
  usedCount: number;
  totalPaidAmountMXN: number;
  availableBalanceMXN: number;
}
