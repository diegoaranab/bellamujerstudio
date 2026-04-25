import { TestBed } from '@angular/core/testing';

import { LocalStateData } from '../models';
import { LocalStateService } from './local-state.service';
import { GiftCardService } from './gift-card.service';

function createState(): LocalStateData {
  return {
    version: 1,
    updatedAtISO: '2026-04-24T12:00:00.000Z',
    serviceOverrides: [],
    inventoryAdjustments: [],
    clientsOverrides: [],
    transactions: [],
    assistantChatHistory: [],
    giftCards: []
  };
}

describe('GiftCardService', () => {
  let state: LocalStateData;
  let saveState: ReturnType<typeof vi.fn>;
  let service: GiftCardService;

  beforeEach(() => {
    state = createState();
    saveState = vi.fn((nextState: LocalStateData) => {
      state = {
        ...nextState,
        updatedAtISO: '2026-04-24T13:00:00.000Z'
      };
      return true;
    });

    TestBed.configureTestingModule({
      providers: [
        GiftCardService,
        {
          provide: LocalStateService,
          useValue: {
            loadState: () => state,
            saveState
          }
        }
      ]
    });

    service = TestBed.inject(GiftCardService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a pending gift card with a generated folio', () => {
    const giftCard = service.createGiftCard({
      buyerName: 'Diego Arana',
      buyerPhone: '2381110000',
      recipientName: 'Mamá Lupita',
      amountMXN: 500,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });

    expect(giftCard.status).toBe('pendiente');
    expect(giftCard.folio).toMatch(/^BM-REGALO-\d{8}-[A-Z0-9]{4}$/);
    expect(giftCard.id).toBeTruthy();
  });

  it('persists gift cards into local state', () => {
    const giftCard = service.createGiftCard({
      buyerName: 'Diego Arana',
      buyerPhone: '2381110000',
      recipientName: 'Mamá Lupita',
      amountMXN: 500,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });

    expect(saveState).toHaveBeenCalled();
    expect(state.giftCards).toHaveLength(1);
    expect(state.giftCards[0]).toEqual(giftCard);
  });

  it('updates gift card status', () => {
    const giftCard = service.createGiftCard({
      buyerName: 'Diego Arana',
      buyerPhone: '2381110000',
      recipientName: 'Mamá Lupita',
      amountMXN: 500,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });

    const updated = service.updateStatus(giftCard.id, 'pagada');

    expect(updated?.status).toBe('pagada');
    expect(state.giftCards[0]?.status).toBe('pagada');
    expect(state.giftCards[0]?.updatedAtISO).toBeTruthy();
  });

  it('sets confirmation, delivery, and use timestamps on status changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T10:00:00.000Z'));

    const paid = service.createGiftCard({
      buyerName: 'A',
      buyerPhone: '1',
      recipientName: 'B',
      amountMXN: 300,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });
    const delivered = service.createGiftCard({
      buyerName: 'C',
      buyerPhone: '2',
      recipientName: 'D',
      amountMXN: 500,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });
    const used = service.createGiftCard({
      buyerName: 'E',
      buyerPhone: '3',
      recipientName: 'F',
      amountMXN: 700,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });

    expect(service.updateStatus(paid.id, 'pagada')?.confirmedAtISO).toBe(
      '2026-04-25T10:00:00.000Z'
    );
    expect(service.updateStatus(delivered.id, 'entregada')?.deliveredAtISO).toBe(
      '2026-04-25T10:00:00.000Z'
    );
    expect(service.updateStatus(used.id, 'usada')?.usedAtISO).toBe(
      '2026-04-25T10:00:00.000Z'
    );
  });

  it('preserves existing status timestamps when a status is selected again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T10:00:00.000Z'));

    const giftCard = service.createGiftCard({
      buyerName: 'Diego Arana',
      buyerPhone: '2381110000',
      recipientName: 'Mamá Lupita',
      amountMXN: 500,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });

    const firstUpdate = service.updateStatus(giftCard.id, 'pagada');
    vi.setSystemTime(new Date('2026-04-26T10:00:00.000Z'));
    const secondUpdate = service.updateStatus(giftCard.id, 'pagada');

    expect(secondUpdate?.confirmedAtISO).toBe(firstUpdate?.confirmedAtISO);
  });

  it('works with older gift cards without the new timestamp fields', () => {
    state.giftCards = [
      {
        id: 'old-gc',
        folio: 'BM-REGALO-20260424-OLD1',
        createdAtISO: '2026-04-24T12:00:00.000Z',
        buyerName: 'Diego Arana',
        buyerPhone: '2381110000',
        recipientName: 'Mamá Lupita',
        amountMXN: 500,
        paymentMethod: 'transferencia',
        status: 'pendiente'
      }
    ];

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        GiftCardService,
        {
          provide: LocalStateService,
          useValue: {
            loadState: () => state,
            saveState
          }
        }
      ]
    });
    service = TestBed.inject(GiftCardService);

    const updated = service.updateStatus('old-gc', 'pagada');

    expect(updated?.status).toBe('pagada');
    expect(updated?.confirmedAtISO).toBeTruthy();
    expect(service.getGiftCardById('old-gc')?.folio).toBe('BM-REGALO-20260424-OLD1');
  });

  it('calculates summary totals from the current cards', () => {
    service.createGiftCard({
      buyerName: 'A',
      buyerPhone: '1',
      recipientName: 'B',
      amountMXN: 300,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });
    const paid = service.createGiftCard({
      buyerName: 'C',
      buyerPhone: '2',
      recipientName: 'D',
      amountMXN: 500,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });
    const used = service.createGiftCard({
      buyerName: 'E',
      buyerPhone: '3',
      recipientName: 'F',
      amountMXN: 700,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });

    service.updateStatus(paid.id, 'pagada');
    service.updateStatus(used.id, 'usada');

    expect(service.getSummary()).toMatchObject({
      totalCards: 3,
      pendingCount: 1,
      paidCount: 1,
      usedCount: 1,
      totalPaidAmountMXN: 500,
      availableBalanceMXN: 500
    });
  });
});
