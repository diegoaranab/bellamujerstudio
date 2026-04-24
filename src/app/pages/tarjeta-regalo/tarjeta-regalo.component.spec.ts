import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';

import { GiftCard } from '../../core/models';
import { GiftCardService } from '../../core/services/gift-card.service';
import { TarjetaRegaloComponent } from './tarjeta-regalo.component';

const createdGiftCard: GiftCard = {
  id: 'gc-1',
  folio: 'BM-REGALO-20260424-ABCD',
  createdAtISO: '2026-04-24T12:00:00.000Z',
  buyerName: 'Diego Arana',
  buyerPhone: '2381110000',
  recipientName: 'Mamá Lupita',
  amountMXN: 500,
  message: 'Te queremos mucho.',
  paymentMethod: 'transferencia',
  status: 'pendiente'
};

describe('TarjetaRegaloComponent', () => {
  let createGiftCard: ReturnType<typeof vi.fn>;
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    createGiftCard = vi.fn(() => createdGiftCard);
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await TestBed.configureTestingModule({
      imports: [TarjetaRegaloComponent],
      providers: [
        provideNoopAnimations(),
        {
          provide: GiftCardService,
          useValue: { createGiftCard }
        }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('prevents invalid submit when required fields are missing', () => {
    const fixture = TestBed.createComponent(TarjetaRegaloComponent);
    const component = fixture.componentInstance;

    component.onSubmit();

    expect(component.form.invalid).toBe(true);
    expect(createGiftCard).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('updates preset and custom amount preview state', () => {
    const fixture = TestBed.createComponent(TarjetaRegaloComponent);
    const component = fixture.componentInstance;

    component.selectPresetAmount(700);
    expect(component.form.controls.amountMXN.value).toBe(700);

    component.form.controls.amountMXN.setValue(850);
    expect(component.form.controls.amountMXN.value).toBe(850);
  });

  it('creates a pending request and opens WhatsApp with the expected message', () => {
    const fixture = TestBed.createComponent(TarjetaRegaloComponent);
    const component = fixture.componentInstance;

    component.form.setValue({
      buyerName: 'Diego Arana',
      buyerPhone: '2381110000',
      buyerEmail: '',
      recipientName: 'Mamá Lupita',
      recipientPhone: '',
      message: 'Te queremos mucho.',
      amountMXN: 500
    });
    component.onSubmit();

    expect(createGiftCard).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerName: 'Diego Arana',
        recipientName: 'Mamá Lupita',
        amountMXN: 500,
        paymentMethod: 'transferencia',
        status: 'pendiente'
      })
    );
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/522381117950?text='),
      '_blank',
      'noopener'
    );

    const url = openSpy.mock.calls[0]?.[0] as string;
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('BM-REGALO-20260424-ABCD');
    expect(decoded).toContain('Diego Arana');
    expect(decoded).toContain('Mamá Lupita');
    expect(decoded).toContain('$500');
    expect(decoded).toContain('transferencia');
    expect(decoded).toContain('comprobante de transferencia');
  });
});
