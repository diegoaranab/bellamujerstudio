import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, Subject, map, of, throwError } from 'rxjs';

import { GiftCard } from '../../core/models';
import {
  AdminGiftCardApiClient,
  AdminGiftCardApiError,
  AdminGiftCardListResponse
} from '../../core/services/admin-gift-card-api.client';
import { GiftCardService } from '../../core/services/gift-card.service';
import { calculateGiftCardSummary } from '../../core/services/gift-card.utils';
import { TarjetasRegaloComponent } from './tarjetas-regalo.component';

const localGiftCard: GiftCard = {
  id: 'local-1',
  folio: 'BM-REGALO-20260424-LOCAL',
  createdAtISO: '2026-04-24T12:00:00.000Z',
  buyerName: 'Diego Arana',
  buyerPhone: '2381110000',
  recipientName: 'Mamá Lupita',
  amountMXN: 500,
  paymentMethod: 'transferencia',
  status: 'pendiente',
  notes: 'Validar comprobante'
};

const remoteGiftCard: GiftCard = {
  id: 'remote-1',
  folio: 'BM-REGALO-20261108-ONLINE',
  createdAtISO: '2026-11-08T12:00:00.000Z',
  buyerName: 'Ana Online',
  buyerPhone: '2382220000',
  recipientName: 'Lucía Online',
  amountMXN: 800,
  message: 'Disfruta tu regalo',
  paymentMethod: 'transferencia',
  status: 'pendiente'
};

const secondRemoteGiftCard: GiftCard = {
  ...remoteGiftCard,
  id: 'remote-2',
  folio: 'BM-REGALO-20261108-ONLINE-2',
  recipientName: 'Elena Online'
};

describe('TarjetasRegaloComponent', () => {
  let giftCardsSubject: BehaviorSubject<GiftCard[]>;
  let updateStatus: ReturnType<typeof vi.fn>;
  let updateNotes: ReturnType<typeof vi.fn>;
  let createGiftCard: ReturnType<typeof vi.fn>;
  let updateGiftCard: ReturnType<typeof vi.fn>;
  let listGiftCards: ReturnType<
    typeof vi.fn<() => Observable<AdminGiftCardListResponse>>
  >;

  async function configure(
    cards: GiftCard[],
    remoteResponse: Observable<AdminGiftCardListResponse> = of({ items: [] }),
    remoteConfigured = true
  ): Promise<void> {
    giftCardsSubject = new BehaviorSubject<GiftCard[]>(cards);
    updateStatus = vi.fn();
    updateNotes = vi.fn();
    createGiftCard = vi.fn();
    updateGiftCard = vi.fn(() => of(remoteGiftCard));
    listGiftCards = vi.fn(() => remoteResponse);

    await TestBed.configureTestingModule({
      imports: [TarjetasRegaloComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: GiftCardService,
          useValue: {
            giftCards$: giftCardsSubject.asObservable(),
            summary$: giftCardsSubject.pipe(
              map((items) => calculateGiftCardSummary(items))
            ),
            createGiftCard,
            updateStatus,
            updateNotes
          }
        },
        {
          provide: AdminGiftCardApiClient,
          useValue: { isConfigured: remoteConfigured, listGiftCards, updateGiftCard }
        }
      ]
    }).compileComponents();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('keeps the existing local empty state', async () => {
    await configure([]);
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain(
      'Aún no hay tarjetas regalo registradas.'
    );
  });

  it('keeps rendering existing local gift cards', async () => {
    await configure([localGiftCard]);
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const localList = fixture.nativeElement.querySelector(
      '[data-testid="admin-gift-card-list"]'
    ) as HTMLElement;
    expect(localList.textContent).toContain('BM-REGALO-20260424-LOCAL');
    expect(localList.textContent).toContain('Mamá Lupita');
    expect(localList.textContent).toContain('Diego Arana');
    expect(localList.textContent).toContain('Pendiente');
  });

  it('keeps local status updates connected to GiftCardService', async () => {
    await configure([localGiftCard]);
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.componentInstance.onStatusChange(localGiftCard.id, { value: 'pagada' } as never);
    expect(updateStatus).toHaveBeenCalledWith(localGiftCard.id, 'pagada');
  });

  it('shows a remote loading state while the first page is pending', async () => {
    const response = new Subject<AdminGiftCardListResponse>();
    await configure([], response);
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="remote-loading-state"]')
        .textContent
    ).toContain('Cargando solicitudes en línea');
    response.complete();
  });

  it('renders remote requests separately with remote status and notes controls', async () => {
    await configure([localGiftCard], of({ items: [remoteGiftCard] }));
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const remoteRow = fixture.nativeElement.querySelector(
      '[data-testid="remote-gift-card-row"]'
    ) as HTMLElement;
    const localList = fixture.nativeElement.querySelector(
      '[data-testid="admin-gift-card-list"]'
    ) as HTMLElement;
    expect(remoteRow.textContent).toContain('BM-REGALO-20261108-ONLINE');
    expect(remoteRow.textContent).toContain('Ana Online');
    expect(remoteRow.textContent).toContain('2382220000');
    expect(remoteRow.textContent).toContain('Lucía Online');
    expect(remoteRow.textContent).toContain('Disfruta tu regalo');
    expect(localList.textContent).not.toContain('BM-REGALO-20261108-ONLINE');
    expect(remoteRow.querySelector('[data-testid="remote-status-selector"]')).not.toBeNull();
    expect(remoteRow.querySelector('[data-testid="remote-notes-textarea"]')).not.toBeNull();
    expect(remoteRow.querySelector('[data-testid="remote-save-notes-button"]')).not.toBeNull();
    expect(remoteRow.querySelector('a')).toBeNull();
    expect(remoteRow.querySelector('[data-testid="gift-card-actions-button"]')).toBeNull();
  });

  it('updates remote status through the API and replaces the card with canonical timestamps', async () => {
    const updated: GiftCard = {
      ...remoteGiftCard,
      status: 'pagada',
      updatedAtISO: '2026-11-09T13:00:00.000Z',
      confirmedAtISO: '2026-11-09T13:00:00.000Z',
      deliveredAtISO: '2026-11-09T14:00:00.000Z',
      usedAtISO: '2026-11-09T15:00:00.000Z'
    };
    await configure([localGiftCard], of({ items: [remoteGiftCard] }));
    updateGiftCard.mockReturnValue(of(updated));
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();

    fixture.componentInstance.onRemoteStatusChange(remoteGiftCard, {
      value: 'pagada'
    } as never);
    fixture.detectChanges();

    expect(updateGiftCard).toHaveBeenCalledWith(remoteGiftCard.id, { status: 'pagada' });
    expect(updateStatus).not.toHaveBeenCalled();
    expect(fixture.componentInstance.remoteGiftCards()).toEqual([updated]);
    const remoteRow = fixture.nativeElement.querySelector(
      '[data-testid="remote-gift-card-row"]'
    ) as HTMLElement;
    expect(remoteRow.textContent).toContain('Pagada:');
    expect(remoteRow.textContent).toContain('Entregada:');
    expect(remoteRow.textContent).toContain('Usada:');
  });

  it('preserves an unsaved remote notes draft when status updates canonically', async () => {
    const giftCard: GiftCard = {
      ...remoteGiftCard,
      notes: 'Nota persistida anterior'
    };
    const updated: GiftCard = {
      ...giftCard,
      status: 'pagada',
      confirmedAtISO: '2026-11-09T13:00:00.000Z'
    };
    await configure([localGiftCard], of({ items: [giftCard] }));
    updateGiftCard.mockReturnValue(of(updated));
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();

    const notesTextarea = fixture.nativeElement.querySelector(
      '[data-testid="remote-notes-textarea"]'
    ) as HTMLTextAreaElement;
    notesTextarea.value = 'Borrador todavía no guardado';
    notesTextarea.dispatchEvent(new Event('input'));
    fixture.componentInstance.onRemoteStatusChange(giftCard, {
      value: 'pagada'
    } as never);
    fixture.detectChanges();

    expect(updateGiftCard).toHaveBeenCalledWith(giftCard.id, { status: 'pagada' });
    expect(fixture.componentInstance.remoteGiftCards()).toEqual([updated]);
    expect(fixture.componentInstance.remoteGiftCards()[0]).toEqual(
      expect.objectContaining({
        status: 'pagada',
        confirmedAtISO: '2026-11-09T13:00:00.000Z'
      })
    );
    expect(fixture.componentInstance.remoteNotesDraft(updated)).toBe(
      'Borrador todavía no guardado'
    );
    expect(fixture.componentInstance.remoteNotesDraft(updated)).not.toBe(
      'Nota persistida anterior'
    );
    expect(notesTextarea.value).toBe('Borrador todavía no guardado');
    expect(updateStatus).not.toHaveBeenCalled();
    expect(updateNotes).not.toHaveBeenCalled();
  });

  it('saves remote notes through the API and synchronizes the canonical returned draft', async () => {
    const updated = { ...remoteGiftCard, notes: 'Nota normalizada por servidor' };
    await configure([], of({ items: [remoteGiftCard] }));
    updateGiftCard.mockReturnValue(of(updated));
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();

    fixture.componentInstance.onRemoteNotesInput(remoteGiftCard.id, {
      target: { value: '  Nota enviada  ' }
    } as unknown as Event);
    fixture.componentInstance.saveRemoteNotes(remoteGiftCard);

    expect(updateGiftCard).toHaveBeenCalledWith(remoteGiftCard.id, {
      notes: '  Nota enviada  '
    });
    expect(updateNotes).not.toHaveBeenCalled();
    expect(fixture.componentInstance.remoteGiftCards()).toEqual([updated]);
    expect(fixture.componentInstance.remoteNotesDraft(updated)).toBe(
      'Nota normalizada por servidor'
    );
  });

  it('keeps remote card state and the user notes draft after a safe mutation failure', async () => {
    await configure([], of({ items: [remoteGiftCard] }));
    updateGiftCard.mockReturnValue(
      throwError(
        () =>
          new AdminGiftCardApiError(
            'validation',
            'No fue posible guardar los cambios. Revisa la información.'
          )
      )
    );
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();

    fixture.componentInstance.onRemoteNotesInput(remoteGiftCard.id, {
      target: { value: 'Borrador importante' }
    } as unknown as Event);
    fixture.componentInstance.saveRemoteNotes(remoteGiftCard);
    fixture.detectChanges();

    expect(fixture.componentInstance.remoteGiftCards()).toEqual([remoteGiftCard]);
    expect(fixture.componentInstance.remoteNotesDraft(remoteGiftCard)).toBe(
      'Borrador importante'
    );
    expect(document.body.textContent).toContain(
      'No fue posible guardar los cambios. Revisa la información.'
    );
    expect(document.body.textContent).not.toContain('sensitive backend detail');
  });

  it('uses per-card saving state, disables only that row, and prevents duplicate PATCHes', async () => {
    const pending = new Subject<GiftCard>();
    await configure([], of({ items: [remoteGiftCard, secondRemoteGiftCard] }));
    updateGiftCard.mockImplementation((id: string) =>
      id === remoteGiftCard.id ? pending : of({ ...secondRemoteGiftCard, status: 'pagada' })
    );
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();

    fixture.componentInstance.onRemoteStatusChange(remoteGiftCard, {
      value: 'pagada'
    } as never);
    fixture.componentInstance.onRemoteStatusChange(remoteGiftCard, {
      value: 'entregada'
    } as never);
    fixture.detectChanges();

    expect(updateGiftCard).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.isRemoteSaving(remoteGiftCard.id)).toBe(true);
    expect(fixture.componentInstance.isRemoteSaving(secondRemoteGiftCard.id)).toBe(false);
    const rows = fixture.nativeElement.querySelectorAll(
      '[data-testid="remote-gift-card-row"]'
    ) as NodeListOf<HTMLElement>;
    expect(
      (rows[0].querySelector('[data-testid="remote-save-notes-button"]') as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (rows[1].querySelector('[data-testid="remote-save-notes-button"]') as HTMLButtonElement)
        .disabled
    ).toBe(false);

    fixture.componentInstance.onRemoteStatusChange(secondRemoteGiftCard, {
      value: 'pagada'
    } as never);
    expect(updateGiftCard).toHaveBeenCalledTimes(2);

    pending.error(new Error('network detail'));
    expect(fixture.componentInstance.isRemoteSaving(remoteGiftCard.id)).toBe(false);
  });

  it('keeps local notes and manual creation connected only to GiftCardService', async () => {
    await configure([localGiftCard]);
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);

    fixture.componentInstance.onNotesBlur(localGiftCard.id, {
      target: { value: 'Nota local' }
    } as unknown as Event);
    fixture.componentInstance.form.setValue({
      buyerName: 'Compradora',
      buyerPhone: '2381000000',
      buyerEmail: '',
      recipientName: 'Destinataria',
      recipientPhone: '',
      amountMXN: 500,
      message: '',
      status: 'pendiente',
      paymentMethod: 'transferencia',
      notes: 'Manual'
    });
    fixture.componentInstance.onCreate();

    expect(updateNotes).toHaveBeenCalledWith(localGiftCard.id, 'Nota local');
    expect(createGiftCard).toHaveBeenCalledWith(
      expect.objectContaining({ buyerName: 'Compradora', notes: 'Manual' })
    );
    expect(updateGiftCard).not.toHaveBeenCalled();
  });

  it('shows a remote empty state after an empty response', async () => {
    await configure([], of({ items: [] }));
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="remote-empty-state"]').textContent
    ).toContain('Aún no hay solicitudes recibidas en línea');
  });

  it('does not call the remote client when the API is not configured', async () => {
    await configure([], of({ items: [] }), false);
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);
    fixture.detectChanges();

    expect(listGiftCards).not.toHaveBeenCalled();
    expect(
      fixture.nativeElement.querySelector('[data-testid="remote-not-configured-state"]')
        .textContent
    ).toContain('no está configurada');
  });

  it('shows a safe remote error and retries the first page', async () => {
    await configure([], of({ items: [] }));
    listGiftCards.mockReturnValueOnce(
      throwError(
        () => new AdminGiftCardApiError('network', 'No se pudo conectar con el servidor.')
      )
    );
    listGiftCards.mockReturnValueOnce(of({ items: [remoteGiftCard] }));
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);

    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="remote-error-state"]').textContent
    ).toContain('No se pudo conectar con el servidor.');

    fixture.nativeElement.querySelector('[data-testid="remote-retry-button"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listGiftCards).toHaveBeenNthCalledWith(1, 50, undefined);
    expect(listGiftCards).toHaveBeenNthCalledWith(2, 50, undefined);
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="remote-gift-card-row"]')
    ).toHaveLength(1);
  });

  it('forwards the opaque load-more token and appends unique results', async () => {
    await configure([], of({ items: [] }));
    listGiftCards.mockReturnValueOnce(
      of({ items: [remoteGiftCard], nextToken: 'opaque+/= token' })
    );
    listGiftCards.mockReturnValueOnce(of({ items: [remoteGiftCard, secondRemoteGiftCard] }));
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);

    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="remote-load-more-button"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listGiftCards).toHaveBeenNthCalledWith(2, 50, 'opaque+/= token');
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="remote-gift-card-row"]')
    ).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('BM-REGALO-20261108-ONLINE-2');
    expect(
      fixture.nativeElement.querySelector('[data-testid="remote-load-more-button"]')
    ).toBeNull();
  });

  it('retries a failed load-more without duplicating displayed requests', async () => {
    await configure([], of({ items: [] }));
    listGiftCards.mockReturnValueOnce(
      of({ items: [remoteGiftCard], nextToken: 'retry-token' })
    );
    listGiftCards.mockReturnValueOnce(
      throwError(() => new AdminGiftCardApiError('server', 'Intenta de nuevo.'))
    );
    listGiftCards.mockReturnValueOnce(of({ items: [remoteGiftCard, secondRemoteGiftCard] }));
    const fixture = TestBed.createComponent(TarjetasRegaloComponent);

    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="remote-load-more-button"]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="remote-retry-button"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listGiftCards).toHaveBeenNthCalledWith(2, 50, 'retry-token');
    expect(listGiftCards).toHaveBeenNthCalledWith(3, 50, 'retry-token');
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid="remote-gift-card-row"]')
    ).toHaveLength(2);
  });
});
