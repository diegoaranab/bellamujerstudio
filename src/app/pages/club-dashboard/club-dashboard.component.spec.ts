import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { ClubClient, LoyaltyBalance } from '../../core/models';
import {
  AdminClubApiClient,
  AdminClubApiError,
  AdminClubClientCreateResponse,
  AdminClubClientDetailResponse,
  AdminClubClientListResponse
} from '../../core/services/admin-club-api.client';
import { ClubDashboardComponent } from './club-dashboard.component';

const ana: ClubClient = {
  studioId: 'studio-1',
  clientId: 'client-ana',
  name: 'Ana López',
  phone: '+52 238 111 0000',
  status: 'active',
  createdAtISO: '2026-11-01T10:00:00.000Z',
  updatedAtISO: '2026-11-01T10:00:00.000Z'
};

const beatriz: ClubClient = {
  ...ana,
  clientId: 'client-beatriz',
  name: 'Beatriz Ramos',
  phone: '238 222 0000',
  status: 'inactive'
};

function balance(clientId: string, stampCount: number, carry: number): LoyaltyBalance {
  return {
    studioId: 'studio-1',
    clientId,
    stampCount,
    eligibleSpendCarryMXN: carry,
    version: 2,
    updatedAtISO: '2026-11-09T12:00:00.000Z'
  };
}

describe('ClubDashboardComponent', () => {
  let listClients: ReturnType<
    typeof vi.fn<
      (limit?: number, nextToken?: string) => Observable<AdminClubClientListResponse>
    >
  >;
  let getClient: ReturnType<
    typeof vi.fn<(clientId: string) => Observable<AdminClubClientDetailResponse>>
  >;
  let createClient: ReturnType<
    typeof vi.fn<
      (request: { name: string; phone: string }) => Observable<AdminClubClientCreateResponse>
    >
  >;
  let registerVisit: ReturnType<typeof vi.fn>;
  let listLedgerEntries: ReturnType<typeof vi.fn>;

  async function configure(options: {
    configured?: boolean;
    listResponse?: Observable<AdminClubClientListResponse>;
    detailResponse?: (clientId: string) => Observable<AdminClubClientDetailResponse>;
    createResponse?: Observable<AdminClubClientCreateResponse>;
  } = {}): Promise<void> {
    listClients = vi.fn(
      () => options.listResponse ?? of({ items: [ana, beatriz] })
    );
    getClient = vi.fn(
      (clientId: string) =>
        options.detailResponse?.(clientId) ??
        of({
          client: clientId === ana.clientId ? ana : beatriz,
          balance: balance(clientId, 1, 550)
        })
    );
    createClient = vi.fn(
      () =>
        options.createResponse ??
        of({ client: ana, balance: balance(ana.clientId, 1, 550) })
    );
    registerVisit = vi.fn();
    listLedgerEntries = vi.fn();

    await TestBed.configureTestingModule({
      imports: [ClubDashboardComponent],
      providers: [
        provideNoopAnimations(),
        {
          provide: AdminClubApiClient,
          useValue: {
            isConfigured: options.configured ?? true,
            listClients,
            getClient,
            createClient,
            registerVisit,
            listLedgerEntries
          }
        }
      ]
    }).compileComponents();
  }

  function render(): ComponentFixture<ClubDashboardComponent> {
    const fixture = TestBed.createComponent(ClubDashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<ClubDashboardComponent>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function click(
    fixture: ComponentFixture<ClubDashboardComponent>,
    selector: string
  ): void {
    const element = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
    expect(element).toBeTruthy();
    element?.click();
    fixture.detectChanges();
  }

  function setInput(
    fixture: ComponentFixture<ClubDashboardComponent>,
    selector: string,
    value: string
  ): void {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(selector);
    expect(input).toBeTruthy();
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('shows a safe unconfigured state without making API calls or adding demo clients', async () => {
    await configure({ configured: false });
    const fixture = render();

    expect(listClients).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('Servicio de Club no configurado');
    expect(text(fixture)).not.toContain('Clienta demo');
    expect(fixture.nativeElement.querySelector('[data-testid="client-list"]')).toBeNull();
  });

  it('shows initial loading while requesting the first page', async () => {
    const pending = new Subject<AdminClubClientListResponse>();
    await configure({ listResponse: pending });
    const fixture = render();

    expect(listClients).toHaveBeenCalledWith(50);
    expect(fixture.nativeElement.querySelector('[data-testid="clients-loading"]')).toBeTruthy();
    pending.complete();
  });

  it('renders real profiles without fabricated balance data in rows', async () => {
    await configure();
    const fixture = render();
    const list = fixture.nativeElement.querySelector('[data-testid="client-list"]') as HTMLElement;

    expect(list.textContent).toContain('Ana López');
    expect(list.textContent).toContain('+52 238 111 0000');
    expect(list.textContent).toContain('Beatriz Ramos');
    expect(list.textContent).toContain('Inactiva');
    expect(list.textContent).not.toContain('sello');
    expect(list.textContent).not.toContain('Saldo elegible');
    expect(list.textContent).not.toContain('$');
  });

  it('shows a clear empty directory state', async () => {
    await configure({ listResponse: of({ items: [] }) });
    const fixture = render();

    expect(fixture.nativeElement.querySelector('[data-testid="clients-empty"]')).toBeTruthy();
    expect(text(fixture)).toContain('Aún no hay clientas en el Club');
  });

  it('renders a safe first-page error and retries page one', async () => {
    const safeError = new AdminClubApiError('network', 'No se pudo conectar. Intenta de nuevo.');
    await configure({ listResponse: throwError(() => safeError) });
    const fixture = render();

    expect(text(fixture)).toContain(safeError.message);
    click(fixture, '[data-testid="clients-error"] button');
    expect(listClients).toHaveBeenCalledTimes(2);
    expect(listClients).toHaveBeenLastCalledWith(50);
  });

  it('forwards the opaque page token and appends without duplicate client IDs', async () => {
    await configure();
    listClients
      .mockReturnValueOnce(of({ items: [ana], nextToken: 'opaque+/= token' }))
      .mockReturnValueOnce(of({ items: [ana, beatriz] }));
    const fixture = render();

    click(fixture, '[data-testid="load-more"]');

    expect(listClients).toHaveBeenLastCalledWith(50, 'opaque+/= token');
    expect(fixture.nativeElement.querySelectorAll('.client-row')).toHaveLength(2);
  });

  it('preserves rows and the same retry token after a failed load-more request', async () => {
    const pageError = new AdminClubApiError('server', 'No fue posible cargar más clientas.');
    await configure();
    listClients
      .mockReturnValueOnce(of({ items: [ana], nextToken: 'retry-this-token' }))
      .mockReturnValueOnce(throwError(() => pageError))
      .mockReturnValueOnce(of({ items: [beatriz] }));
    const fixture = render();

    click(fixture, '[data-testid="load-more"]');
    expect(text(fixture)).toContain(pageError.message);
    expect(text(fixture)).toContain('Ana López');
    click(fixture, '[data-testid="load-more"]');

    expect(listClients).toHaveBeenNthCalledWith(2, 50, 'retry-this-token');
    expect(listClients).toHaveBeenNthCalledWith(3, 50, 'retry-this-token');
    expect(text(fixture)).toContain('Beatriz Ramos');
  });

  it('filters loaded clients by name and phone without an API search', async () => {
    await configure();
    const fixture = render();

    setInput(fixture, '[data-testid="client-filter"]', '222 0000');
    const list = fixture.nativeElement.querySelector('[data-testid="client-list"]') as HTMLElement;
    expect(list.textContent).not.toContain('Ana López');
    expect(list.textContent).toContain('Beatriz Ramos');
    expect(listClients).toHaveBeenCalledTimes(1);

    setInput(fixture, '[data-testid="client-filter"]', 'ANA');
    expect(list.textContent).toContain('Ana López');
    expect(list.textContent).not.toContain('Beatriz Ramos');
    expect(listClients).toHaveBeenCalledTimes(1);
  });

  it('loads canonical detail and renders singular and plural stamp wording', async () => {
    await configure({
      detailResponse: (clientId) =>
        of({
          client: clientId === ana.clientId ? ana : beatriz,
          balance: balance(clientId, clientId === ana.clientId ? 1 : 2, 550)
        })
    });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    expect(getClient).toHaveBeenCalledWith('client-ana');
    expect(text(fixture)).toContain('1 sello acumulado');
    expect(text(fixture)).toContain('Saldo elegible acumulado');
    expect(text(fixture)).toContain('$550');

    click(fixture, '[data-client-id="client-beatriz"]');
    expect(text(fixture)).toContain('2 sellos acumulados');
  });

  it('prevents a stale detail response from replacing the latest selection', async () => {
    const anaResponse = new Subject<AdminClubClientDetailResponse>();
    const beatrizResponse = new Subject<AdminClubClientDetailResponse>();
    await configure({
      detailResponse: (clientId) =>
        clientId === ana.clientId ? anaResponse : beatrizResponse
    });
    const fixture = render();
    const component = fixture.componentInstance as unknown as {
      selectClient(client: ClubClient): void;
      selectedClient: ClubClient | null;
      selectedBalance: LoyaltyBalance | null;
    };

    component.selectClient(ana);
    component.selectClient(beatriz);
    beatrizResponse.next({ client: beatriz, balance: balance(beatriz.clientId, 2, 700) });
    anaResponse.next({ client: ana, balance: balance(ana.clientId, 9, 999) });

    expect(component.selectedClient).toEqual(beatriz);
    expect(component.selectedBalance).toEqual(balance(beatriz.clientId, 2, 700));
  });

  it('does not submit an invalid create form', async () => {
    await configure();
    const fixture = render();

    click(fixture, '[data-testid="create-client-submit"]');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('sends exactly trimmed name and phone values', async () => {
    await configure();
    const fixture = render();
    setInput(fixture, 'input[formcontrolname="name"]', '  Carla Ruiz  ');
    setInput(fixture, 'input[formcontrolname="phone"]', '  +52 238 333 0000  ');

    click(fixture, '[data-testid="create-client-submit"]');

    expect(createClient).toHaveBeenCalledWith({
      name: 'Carla Ruiz',
      phone: '+52 238 333 0000'
    });
    expect(Object.keys(createClient.mock.calls[0][0])).toEqual(['name', 'phone']);
  });

  it('inserts canonical create data once, selects its returned balance, then resets', async () => {
    const canonical: ClubClient = {
      ...ana,
      name: 'Ana Canónica',
      phone: 'canonical-phone',
      updatedAtISO: '2026-11-09T15:00:00.000Z'
    };
    await configure({
      listResponse: of({ items: [ana] }),
      createResponse: of({ client: canonical, balance: balance(canonical.clientId, 4, 825) })
    });
    const fixture = render();
    setInput(fixture, 'input[formcontrolname="name"]', 'Ana Canónica');
    setInput(fixture, 'input[formcontrolname="phone"]', 'canonical-phone');

    click(fixture, '[data-testid="create-client-submit"]');

    expect(fixture.nativeElement.querySelectorAll('.client-row')).toHaveLength(1);
    expect(text(fixture)).toContain('Ana Canónica');
    expect(text(fixture)).toContain('4 sellos acumulados');
    expect(text(fixture)).toContain('$825');
    expect(text(fixture)).toContain('Clienta creada correctamente.');
    expect(getClient).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        'input[formcontrolname="name"]'
      )?.value
    ).toBe('');
  });

  it('preserves a created client when an older initial page resolves afterward', async () => {
    const pendingList = new Subject<AdminClubClientListResponse>();
    const created: ClubClient = {
      ...ana,
      clientId: 'client-created',
      name: 'Carla Nueva',
      phone: '2383330000'
    };
    await configure({
      listResponse: pendingList,
      createResponse: of({
        client: created,
        balance: balance(created.clientId, 3, 650)
      })
    });
    const fixture = render();

    setInput(fixture, 'input[formcontrolname="name"]', 'Carla Nueva');
    setInput(fixture, 'input[formcontrolname="phone"]', '2383330000');
    click(fixture, '[data-testid="create-client-submit"]');

    expect(text(fixture)).toContain('Carla Nueva');
    expect(text(fixture)).toContain('3 sellos acumulados');
    expect(text(fixture)).toContain('$650');

    pendingList.next({ items: [ana, beatriz] });
    pendingList.complete();
    fixture.detectChanges();

    const createdRows = fixture.nativeElement.querySelectorAll(
      '[data-client-id="client-created"]'
    );
    expect(createdRows).toHaveLength(1);
    expect(text(fixture)).toContain('Carla Nueva');
    expect(text(fixture)).toContain('3 sellos acumulados');
    expect(text(fixture)).toContain('$650');
  });

  it('preserves a created client when an older first-page retry resolves afterward', async () => {
    const firstError = new AdminClubApiError('network', 'No se pudo conectar.');
    const retryPage = new Subject<AdminClubClientListResponse>();
    const created: ClubClient = {
      ...ana,
      clientId: 'client-created-retry',
      name: 'Daniela Nueva',
      phone: '2384440000'
    };
    await configure({
      listResponse: throwError(() => firstError),
      createResponse: of({
        client: created,
        balance: balance(created.clientId, 2, 725)
      })
    });
    const fixture = render();

    listClients.mockReturnValueOnce(retryPage);
    click(fixture, '[data-testid="clients-error"] button');

    setInput(fixture, 'input[formcontrolname="name"]', 'Daniela Nueva');
    setInput(fixture, 'input[formcontrolname="phone"]', '2384440000');
    click(fixture, '[data-testid="create-client-submit"]');

    retryPage.next({ items: [ana] });
    retryPage.complete();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('[data-client-id="client-created-retry"]')
    ).toHaveLength(1);
    expect(text(fixture)).toContain('Daniela Nueva');
    expect(text(fixture)).toContain('2 sellos acumulados');
    expect(text(fixture)).toContain('$725');
  });

  it('prevents duplicate create submissions while the first is pending', async () => {
    const pending = new Subject<AdminClubClientCreateResponse>();
    await configure({ createResponse: pending });
    const fixture = render();
    setInput(fixture, 'input[formcontrolname="name"]', 'Carla');
    setInput(fixture, 'input[formcontrolname="phone"]', '2383330000');

    click(fixture, '[data-testid="create-client-submit"]');
    (fixture.componentInstance as unknown as { createClient(): void }).createClient();

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        'input[formcontrolname="name"]'
      )?.value
    ).toBe('Carla');
    pending.complete();
  });

  it('preserves form values and shows only the normalized message after create failure', async () => {
    const normalized = new AdminClubApiError('server', 'No fue posible crear la clienta.');
    await configure({ createResponse: throwError(() => normalized) });
    const fixture = render();
    setInput(fixture, 'input[formcontrolname="name"]', 'Carla');
    setInput(fixture, 'input[formcontrolname="phone"]', '2383330000');

    click(fixture, '[data-testid="create-client-submit"]');

    expect(text(fixture)).toContain(normalized.message);
    expect(text(fixture)).not.toContain('AccessDeniedException');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        'input[formcontrolname="name"]'
      )?.value
    ).toBe('Carla');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="create-client-submit"]'
      )?.disabled
    ).toBe(false);
  });

  it('does not call visit or ledger operations in this phase', async () => {
    await configure();
    const fixture = render();
    click(fixture, '[data-client-id="client-ana"]');

    expect(registerVisit).not.toHaveBeenCalled();
    expect(listLedgerEntries).not.toHaveBeenCalled();
  });
});
