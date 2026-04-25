import {
  GiftCard,
  GiftCardStatus,
  GiftCardSummary
} from '../models/gift-card.model';

export const GIFT_CARD_WHATSAPP_NUMBER = '522381117950';
export const GIFT_CARD_MIN_AMOUNT_MXN = 300;
export const GIFT_CARD_PRESET_AMOUNTS_MXN = [300, 500, 700, 1000] as const;
export type GiftCardStatusFilter = GiftCardStatus | 'todas';

export interface GiftCardFilter {
  status: GiftCardStatusFilter;
  query: string;
}

export const GIFT_CARD_STATUS_OPTIONS: readonly GiftCardStatus[] = [
  'pendiente',
  'pagada',
  'entregada',
  'usada',
  'cancelada'
] as const;

export const GIFT_CARD_STATUS_FILTER_OPTIONS: readonly GiftCardStatusFilter[] = [
  'todas',
  ...GIFT_CARD_STATUS_OPTIONS
] as const;

export function generateGiftCardFolio(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BM-REGALO-${y}${m}${d}-${suffix}`;
}

export function formatMXN(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0
  }).format(amount);
}

export function giftCardStatusLabel(status: GiftCardStatus): string {
  const labels: Record<GiftCardStatus, string> = {
    pendiente: 'Pendiente',
    pagada: 'Pagada',
    entregada: 'Entregada',
    usada: 'Usada',
    cancelada: 'Cancelada'
  };
  return labels[status];
}

export function giftCardStatusFilterLabel(status: GiftCardStatusFilter): string {
  const labels: Record<GiftCardStatusFilter, string> = {
    todas: 'Todas',
    pendiente: 'Pendientes',
    pagada: 'Pagadas',
    entregada: 'Entregadas',
    usada: 'Usadas',
    cancelada: 'Canceladas'
  };
  return labels[status];
}

export function calculateGiftCardSummary(
  giftCards: readonly GiftCard[]
): GiftCardSummary {
  return giftCards.reduce<GiftCardSummary>(
    (summary, giftCard) => {
      summary.totalCards += 1;

      if (giftCard.status === 'pendiente') {
        summary.pendingCount += 1;
      }

      if (giftCard.status === 'pagada') {
        summary.paidCount += 1;
      }

      if (giftCard.status === 'usada') {
        summary.usedCount += 1;
      }

      if (
        giftCard.status === 'pagada' ||
        giftCard.status === 'entregada' ||
        giftCard.status === 'usada'
      ) {
        summary.totalPaidAmountMXN += giftCard.amountMXN;
      }

      if (giftCard.status === 'pagada' || giftCard.status === 'entregada') {
        summary.availableBalanceMXN += giftCard.amountMXN;
      }

      return summary;
    },
    {
      totalCards: 0,
      pendingCount: 0,
      paidCount: 0,
      usedCount: 0,
      totalPaidAmountMXN: 0,
      availableBalanceMXN: 0
    }
  );
}

export function filterGiftCards(
  giftCards: readonly GiftCard[],
  filter: GiftCardFilter
): GiftCard[] {
  const query = normalizeSearchText(filter.query);

  return giftCards.filter((giftCard) => {
    const matchesStatus =
      filter.status === 'todas' || giftCard.status === filter.status;

    if (!matchesStatus) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      giftCard.folio,
      giftCard.buyerName,
      giftCard.recipientName,
      giftCard.buyerPhone,
      giftCard.recipientPhone ?? ''
    ]
      .map(normalizeSearchText)
      .some((value) => value.includes(query));
  });
}

export function buildGiftCardWhatsAppMessage(giftCard: GiftCard): string {
  const lines = [
    'Hola Bella Mujer Studio',
    '',
    'Quiero solicitar una tarjeta regalo.',
    '',
    `Folio: ${giftCard.folio}`,
    `Nombre de quien regala: ${giftCard.buyerName}`,
    `WhatsApp de quien regala: ${giftCard.buyerPhone}`,
    giftCard.buyerEmail ? `Email: ${giftCard.buyerEmail}` : '',
    `Nombre de quien recibe: ${giftCard.recipientName}`,
    giftCard.recipientPhone
      ? `WhatsApp de quien recibe: ${giftCard.recipientPhone}`
      : '',
    `Monto: ${formatMXN(giftCard.amountMXN)}`,
    giftCard.message ? `Mensaje para la tarjeta: ${giftCard.message}` : '',
    'Método de pago: transferencia',
    '',
    'Adjunto mi comprobante de transferencia para validación.'
  ];

  return lines.filter(Boolean).join('\n');
}

export function buildGiftCardWhatsAppUrl(giftCard: GiftCard): string {
  return `https://wa.me/${GIFT_CARD_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    buildGiftCardWhatsAppMessage(giftCard)
  )}`;
}

export function buildGiftCardClientConfirmationMessage(
  giftCard: GiftCard
): string {
  return [
    `Hola, ${giftCard.buyerName}. Tu tarjeta regalo de Bella Mujer Studio ya quedó confirmada 💐`,
    '',
    `Folio: ${giftCard.folio}`,
    `Para: ${giftCard.recipientName}`,
    `Monto: ${formatMXN(giftCard.amountMXN)} MXN`,
    '',
    'La tarjeta puede usarse agendando con Bella Mujer Studio. Recuerda conservar este folio.',
    '',
    'Válida por 3 meses a partir de la confirmación de pago. No canjeable por efectivo.'
  ].join('\n');
}

export function buildGiftCardBuyerWhatsAppUrl(giftCard: GiftCard): string {
  const phone = normalizeWhatsAppPhone(giftCard.buyerPhone);
  return `https://wa.me/${phone}?text=${encodeURIComponent(
    buildGiftCardClientConfirmationMessage(giftCard)
  )}`;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeWhatsAppPhone(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 10) {
    return `52${digits}`;
  }

  return digits;
}
