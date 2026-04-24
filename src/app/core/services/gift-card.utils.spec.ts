import {
  buildGiftCardWhatsAppMessage,
  buildGiftCardWhatsAppUrl,
  calculateGiftCardSummary,
  generateGiftCardFolio,
  giftCardStatusLabel
} from './gift-card.utils';
import { GiftCard } from '../models';

const baseGiftCard: GiftCard = {
  id: 'gc-1',
  folio: 'BM-REGALO-20260424-ABCD',
  createdAtISO: '2026-04-24T12:00:00.000Z',
  buyerName: 'Diego Arana',
  buyerPhone: '2381110000',
  buyerEmail: 'diego@example.com',
  recipientName: 'Mamá Lupita',
  recipientPhone: '2381111111',
  amountMXN: 500,
  message: 'Te queremos mucho.',
  paymentMethod: 'transferencia',
  status: 'pendiente'
};

describe('gift-card utils', () => {
  it('generates a folio using the documented format', () => {
    const folio = generateGiftCardFolio(new Date('2026-04-24T12:00:00.000Z'));

    expect(folio).toMatch(/^BM-REGALO-20260424-[A-Z0-9]{4}$/);
  });

  it('builds a Spanish WhatsApp message and URL for Bella Mujer', () => {
    const message = buildGiftCardWhatsAppMessage(baseGiftCard);
    const url = buildGiftCardWhatsAppUrl(baseGiftCard);

    expect(message).toContain('Hola Bella Mujer Studio');
    expect(message).toContain(baseGiftCard.folio);
    expect(message).toContain('Diego Arana');
    expect(message).toContain('Mamá Lupita');
    expect(message).toContain('$500');
    expect(message).toContain('Método de pago: transferencia');
    expect(message).toContain('Adjunto mi comprobante de transferencia para validación.');
    expect(url).toContain('https://wa.me/522381117950?text=');
    expect(decodeURIComponent(url)).toContain('comprobante');
  });

  it('maps status labels in Spanish', () => {
    expect(giftCardStatusLabel('pendiente')).toBe('Pendiente');
    expect(giftCardStatusLabel('pagada')).toBe('Pagada');
    expect(giftCardStatusLabel('entregada')).toBe('Entregada');
    expect(giftCardStatusLabel('usada')).toBe('Usada');
    expect(giftCardStatusLabel('cancelada')).toBe('Cancelada');
  });

  it('calculates summary totals correctly', () => {
    const summary = calculateGiftCardSummary([
      { ...baseGiftCard, id: '1', status: 'pendiente', amountMXN: 300 },
      { ...baseGiftCard, id: '2', status: 'pagada', amountMXN: 500 },
      { ...baseGiftCard, id: '3', status: 'entregada', amountMXN: 700 },
      { ...baseGiftCard, id: '4', status: 'usada', amountMXN: 1000 },
      { ...baseGiftCard, id: '5', status: 'cancelada', amountMXN: 500 }
    ]);

    expect(summary).toEqual({
      totalCards: 5,
      pendingCount: 1,
      paidCount: 1,
      usedCount: 1,
      totalPaidAmountMXN: 1200,
      availableBalanceMXN: 1200
    });
  });
});
