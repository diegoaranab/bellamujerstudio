import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, map } from 'rxjs';

import { GiftCard } from '../../core/models';
import { GiftCardService } from '../../core/services/gift-card.service';
import { calculateGiftCardSummary } from '../../core/services/gift-card.utils';
import { TarjetasRegaloComponent } from './tarjetas-regalo.component';

const giftCard: GiftCard = {
  id: 'gc-1',
  folio: 'BM-REGALO-20260424-ABCD',
  createdAtISO: '2026-04-24T12:00:00.000Z',
  buyerName: 'Diego Arana',
  buyerPhone: '2381110000',
  recipientName: 'Mamá Lupita',
  amountMXN: 500,
  paymentMethod: 'transferencia',
  status: 'pendiente',
  notes: 'Validar comprobante'
};

describe('TarjetasRegaloComponent', () => {
  let giftCardsSubject: BehaviorSubject<GiftCard[]>;
  let updateStatus: ReturnType<typeof vi.fn>;

  async function configure(cards: GiftCard[]): Promise<void> {
    giftCardsSubject = new BehaviorSubject<GiftCard[]>(cards);
    updateStatus = vi.fn();

    await TestBed.configureTestingModule({
      imports: [TarjetasRegaloComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: GiftCardService,
          useValue: {
            giftCards$: giftCardsSubject.asObservable(),
            summary$: giftCardsSubject.pipe(map((items) => calculateGiftCardSummary(items))),
            createGiftCard: vi.fn(),
            updateStatus,
            updateNotes: vi.fn()
          }
        }
      ]
    }).compileComponents();
  }

  it('renders empty state when there are no gift cards', async () => {
    await configure([]);
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(
      'Aún no hay tarjetas regalo registradas.'
    );
  });

  it('renders existing gift cards', async () => {
    await configure([giftCard]);
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('BM-REGALO-20260424-ABCD');
    expect(text).toContain('Mamá Lupita');
    expect(text).toContain('Diego Arana');
    expect(text).toContain('Pendiente');
  });

  it('changing status calls the gift card update logic', async () => {
    await configure([giftCard]);
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    const component = fixture.componentInstance;

    component.onStatusChange(giftCard.id, { value: 'pagada' } as never);

    expect(updateStatus).toHaveBeenCalledWith(giftCard.id, 'pagada');
  });
});
