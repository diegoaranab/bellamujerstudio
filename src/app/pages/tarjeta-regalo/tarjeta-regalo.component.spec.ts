import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { GiftCard } from '../../core/models';
import { GIFT_CARD_API_CONFIG } from '../../core/services/gift-card-api-config';
import { GIFT_CARD_REQUEST_DATA_ACCESS } from '../../core/services/gift-card-request.data-access';
import { GiftCardRequestError } from '../../core/services/public-gift-card-api.client';
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
  let popup: Window;
  let replaceSpy: ReturnType<typeof vi.fn>;
  let closeSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createGiftCard = vi.fn(() => of(createdGiftCard));
    replaceSpy = vi.fn();
    closeSpy = vi.fn();
    popup = { location: { replace: replaceSpy }, close: closeSpy, opener: window } as unknown as Window;
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => popup);

    await TestBed.configureTestingModule({
      imports: [TarjetaRegaloComponent],
      providers: [
        provideNoopAnimations(),
        {
          provide: GIFT_CARD_REQUEST_DATA_ACCESS,
          useValue: { createRequest: createGiftCard }
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

  it('opens a placeholder before the request completes and navigates it on success', () => {
    const fixture = TestBed.createComponent(TarjetaRegaloComponent);
    const component = fixture.componentInstance;
    const response = new Subject<GiftCard>();
    createGiftCard.mockReturnValue(response.asObservable());

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

    expect(openSpy).toHaveBeenCalledExactlyOnceWith('', '_blank');
    expect(openSpy.mock.invocationCallOrder[0]).toBeLessThan(createGiftCard.mock.invocationCallOrder[0]);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(component.isSubmitting()).toBe(true);
    response.next(createdGiftCard);

    expect(createGiftCard).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerName: 'Diego Arana',
        recipientName: 'Mamá Lupita',
        amountMXN: 500,
        buyerPhone: '2381110000'
      }),
      undefined
    );
    expect(replaceSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/522381117950?text='),
    );

    const url = replaceSpy.mock.calls[0]?.[0] as string;
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('BM-REGALO-20260424-ABCD');
    expect(decoded).toContain('Diego Arana');
    expect(decoded).toContain('Mamá Lupita');
    expect(decoded).toContain('$500');
    expect(decoded).toContain('transferencia');
    expect(decoded).toContain('comprobante de transferencia');
  });

  it('closes the placeholder and shows the normalized error when the request fails', () => {
    createGiftCard.mockReturnValue(throwError(() => new GiftCardRequestError('server', 'Intenta de nuevo.')));
    const component = TestBed.createComponent(TarjetaRegaloComponent).componentInstance;
    component.form.patchValue({ buyerName: 'Diego', buyerPhone: '2381110000', recipientName: 'Lupita' });

    component.onSubmit();

    expect(openSpy).toHaveBeenCalledOnce();
    expect(closeSpy).toHaveBeenCalledOnce();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Intenta de nuevo.');
    expect(component.isSubmitting()).toBe(false);
  });

  it('does not open another window or create another request during submission', () => {
    const response = new Subject<GiftCard>();
    createGiftCard.mockReturnValue(response.asObservable());
    const component = TestBed.createComponent(TarjetaRegaloComponent).componentInstance;
    component.form.patchValue({ buyerName: 'Diego', buyerPhone: '2381110000', recipientName: 'Lupita' });

    component.onSubmit();
    component.onSubmit();

    expect(openSpy).toHaveBeenCalledOnce();
    expect(createGiftCard).toHaveBeenCalledOnce();
    response.next(createdGiftCard);
    expect(replaceSpy).toHaveBeenCalledOnce();
  });

  it('offers a direct link if the placeholder was closed before the request succeeded', () => {
    const response = new Subject<GiftCard>();
    createGiftCard.mockReturnValue(response.asObservable());
    const fixture = TestBed.createComponent(TarjetaRegaloComponent);
    const component = fixture.componentInstance;
    component.form.patchValue({ buyerName: 'Diego', buyerPhone: '2381110000', recipientName: 'Lupita' });

    component.onSubmit();
    Object.defineProperty(popup, 'closed', { value: true });
    response.next(createdGiftCard);
    fixture.detectChanges();

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(component.successMessage()).not.toContain('Se abrió WhatsApp');
    expect(fixture.nativeElement.querySelector('a[href^="https://wa.me/"]')).not.toBeNull();
  });

  it('rejects fractional pesos before opening a window or creating a request', () => {
    const fixture = TestBed.createComponent(TarjetaRegaloComponent);
    const component = fixture.componentInstance;
    component.form.patchValue({
      buyerName: 'Diego', buyerPhone: '2381110000', recipientName: 'Lupita', amountMXN: 300.5
    });

    component.onSubmit();
    fixture.detectChanges();

    expect(component.form.invalid).toBe(true);
    expect(component.form.controls.amountMXN.hasError('wholePeso')).toBe(true);
    expect(createGiftCard).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Ingresa un monto en pesos enteros, sin centavos.');
  });

  it('does not create a request when popups are blocked', () => {
    openSpy.mockReturnValue(null);
    const component = TestBed.createComponent(TarjetaRegaloComponent).componentInstance;
    component.form.patchValue({ buyerName: 'Diego', buyerPhone: '2381110000', recipientName: 'Lupita' });

    component.onSubmit();

    expect(createGiftCard).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('ventanas emergentes');
  });

  it.each([
    ['buyerName', 'x'.repeat(121), 'El nombre de quien regala no puede superar 120 caracteres.'],
    ['recipientPhone', '1'.repeat(31), 'El WhatsApp de quien recibe no puede superar 30 caracteres.'],
    ['message', 'x'.repeat(501), 'El mensaje no puede superar 500 caracteres.']
  ] as const)('blocks an over-limit %s with a field error', (field, value, message) => {
    const fixture = TestBed.createComponent(TarjetaRegaloComponent);
    const component = fixture.componentInstance;
    component.form.patchValue({ buyerName: 'Diego', buyerPhone: '2381110000', recipientName: 'Lupita' });
    component.form.controls[field].setValue(value);
    component.onSubmit();
    fixture.detectChanges();
    expect(component.form.invalid).toBe(true);
    expect(component.form.controls[field].hasError('maxlength')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(message);
    expect(openSpy).not.toHaveBeenCalled();
    expect(createGiftCard).not.toHaveBeenCalled();
  });

  it('reuses an API key after a network failure and changes it for a new submission', () => {
    TestBed.overrideProvider(GIFT_CARD_API_CONFIG, { useValue: { mode: 'api', baseUrl: 'https://example.com' } });
    createGiftCard.mockReturnValueOnce(throwError(() => new GiftCardRequestError('network', 'Retry')));
    const component = TestBed.createComponent(TarjetaRegaloComponent).componentInstance;
    component.form.patchValue({ buyerName: 'Diego', buyerPhone: '2381110000', recipientName: 'Lupita' });
    component.onSubmit();
    const firstKey = createGiftCard.mock.calls[0][1];
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    component.onSubmit();
    expect(createGiftCard.mock.calls[1][1]).toBe(firstKey);
    component.onSubmit();
    expect(createGiftCard.mock.calls[2][1]).not.toBe(firstKey);
  });
});
