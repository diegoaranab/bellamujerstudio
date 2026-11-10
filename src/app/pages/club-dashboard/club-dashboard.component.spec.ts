import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { ClubClient, LoyaltyBalance, Service } from '../../core/models';
import {
  AdminClubApiClient,
  AdminClubApiError,
  AdminClubClientCreateResponse,
  AdminClubClientDetailResponse,
  AdminClubClientListResponse,
  AdminClubVisitCreateRequest,
  AdminClubVisitCreateResponse
} from '../../core/services/admin-club-api.client';
import { DbFacadeService } from '../../core/services/db-facade.service';
import { ServicesDbSeed } from '../../core/services/seed-db.service';
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

const activeService: Service = {
  id: 'service-active',
  categoryId: 'category-1',
  nombre: 'Corte activo',
  descripcionCorta: 'Servicio canónico activo',
  precioBaseMXN: 450,
  duracionMinBase: 60,
  activo: true
};

const secondActiveService: Service = {
  ...activeService,
  id: 'service-active-2',
  nombre: 'Peinado activo'
};

const inactiveService: Service = {
  ...activeService,
  id: 'service-inactive',
  nombre: 'Servicio inactivo',
  activo: false
};

const serviceCatalog: ServicesDbSeed = {
  services: [activeService, secondActiveService, inactiveService],
  variants: [],
  addOns: [],
  serviceAddOns: [],
  bom: []
};

const UUID_ONE = '11111111-1111-4111-8111-111111111111';
const UUID_TWO = '22222222-2222-4222-8222-222222222222';

interface VisitTestActions {
  registerVisit(): void;
  retryVisit(): void;
  editVisitAttempt(): void;
  toggleService(serviceId: string, checked: boolean): void;
  pendingVisitAttempt(): unknown;
  selectedBalance(): LoyaltyBalance | null;
}

function balance(
  clientId: string,
  stampCount: number,
  carry: number,
  version = 2
): LoyaltyBalance {
  return {
    studioId: 'studio-1',
    clientId,
    stampCount,
    eligibleSpendCarryMXN: carry,
    version,
    updatedAtISO: '2026-11-09T12:00:00.000Z'
  };
}

function visitResponse(options: {
  clientId?: string;
  amountMXN?: number;
  eligibleAmountMXN?: number;
  stampCount?: number;
  carry?: number;
  stampsAwarded?: 0 | 1;
  replayed?: boolean;
  occurredAtISO?: string;
  balanceVersion?: number;
} = {}): AdminClubVisitCreateResponse {
  const clientId = options.clientId ?? ana.clientId;
  const occurredAtISO = options.occurredAtISO ?? '2026-11-10T15:30:00.000Z';
  return {
    visit: {
      studioId: 'studio-1',
      clientId,
      visitId: 'visit-1',
      occurredAtISO,
      amountMXN: options.amountMXN ?? 500,
      eligibleAmountMXN: options.eligibleAmountMXN ?? 400,
      serviceIds: [activeService.id],
      source: 'admin',
      createdByAdminSub: 'admin-1',
      createdAtISO: '2026-11-10T15:31:00.000Z'
    },
    loyalty: {
      stampsAwarded: options.stampsAwarded ?? 1,
      stampCountAfter: options.stampCount ?? 7,
      eligibleSpendCarryAfterMXN: options.carry ?? 650
    },
    balance: balance(
      clientId,
      options.stampCount ?? 7,
      options.carry ?? 650,
      options.balanceVersion ?? 2
    ),
    replayed: options.replayed ?? false
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
  let registerVisit: ReturnType<
    typeof vi.fn<
      (
        clientId: string,
        request: AdminClubVisitCreateRequest,
        idempotencyKey: string
      ) => Observable<AdminClubVisitCreateResponse>
    >
  >;
  let listLedgerEntries: ReturnType<typeof vi.fn>;

  async function configure(options: {
    configured?: boolean;
    listResponse?: Observable<AdminClubClientListResponse>;
    detailResponse?: (clientId: string) => Observable<AdminClubClientDetailResponse>;
    createResponse?: Observable<AdminClubClientCreateResponse>;
    visitResponse?: (
      clientId: string,
      request: AdminClubVisitCreateRequest,
      idempotencyKey: string
    ) => Observable<AdminClubVisitCreateResponse>;
    servicesResponse?: Observable<ServicesDbSeed>;
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
    registerVisit = vi.fn(
      (clientId, request, idempotencyKey) =>
        options.visitResponse?.(clientId, request, idempotencyKey) ??
        of(visitResponse({ clientId }))
    );
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
        },
        {
          provide: DbFacadeService,
          useValue: {
            services$: options.servicesResponse ?? of(serviceCatalog)
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

  function prepareVisit(
    fixture: ComponentFixture<ClubDashboardComponent>,
    amount = '500',
    eligibleAmount = '400'
  ): void {
    click(fixture, '[data-client-id="client-ana"]');
    setInput(fixture, '[data-testid="visit-date"]', '2026-11-10T09:30');
    setInput(fixture, '[data-testid="visit-amount"]', amount);
    setInput(fixture, '[data-testid="visit-eligible-amount"]', eligibleAmount);
  }

  function visitActions(
    fixture: ComponentFixture<ClubDashboardComponent>
  ): VisitTestActions {
    return fixture.componentInstance as unknown as VisitTestActions;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

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
      selectedClient(): ClubClient | null;
      selectedBalance(): LoyaltyBalance | null;
    };

    component.selectClient(ana);
    component.selectClient(beatriz);
    beatrizResponse.next({ client: beatriz, balance: balance(beatriz.clientId, 2, 700) });
    anaResponse.next({ client: ana, balance: balance(ana.clientId, 9, 999) });

    expect(component.selectedClient()).toEqual(beatriz);
    expect(component.selectedBalance()).toEqual(balance(beatriz.clientId, 2, 700));
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

  it('renders completed asynchronous Club states in the zoneless test environment', async () => {
    const firstPage = new Subject<AdminClubClientListResponse>();
    const loadMorePage = new Subject<AdminClubClientListResponse>();
    const detailResponse = new Subject<AdminClubClientDetailResponse>();
    const createResponse = new Subject<AdminClubClientCreateResponse>();
    const created: ClubClient = {
      ...ana,
      clientId: 'client-zoneless-created',
      name: 'Carla Asíncrona',
      phone: '2385550000'
    };

    await configure({
      listResponse: firstPage,
      detailResponse: () => detailResponse,
      createResponse
    });
    const fixture = render();

    expect(fixture.nativeElement.querySelector('[data-testid="clients-loading"]')).toBeTruthy();

    firstPage.next({ items: [ana], nextToken: 'zoneless-next' });
    firstPage.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Ana López');
    expect(fixture.nativeElement.querySelector('[data-testid="load-more"]')).toBeTruthy();

    listClients.mockReturnValueOnce(loadMorePage);
    click(fixture, '[data-testid="load-more"]');
    loadMorePage.next({ items: [beatriz] });
    loadMorePage.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Beatriz Ramos');

    click(fixture, '[data-client-id="client-ana"]');
    expect(fixture.nativeElement.querySelector('[data-testid="detail-loading"]')).toBeTruthy();

    detailResponse.next({ client: ana, balance: balance(ana.clientId, 3, 575) });
    detailResponse.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('3 sellos acumulados');
    expect(text(fixture)).toContain('$575');

    setInput(fixture, 'input[formcontrolname="name"]', 'Carla Asíncrona');
    setInput(fixture, 'input[formcontrolname="phone"]', '2385550000');
    click(fixture, '[data-testid="create-client-submit"]');

    createResponse.next({
      client: created,
      balance: balance(created.clientId, 1, 625)
    });
    createResponse.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Carla Asíncrona');
    expect(text(fixture)).toContain('1 sello acumulado');
    expect(text(fixture)).toContain('$625');
    expect(text(fixture)).toContain('Clienta creada correctamente.');
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
    await fixture.whenStable();
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
    await fixture.whenStable();
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

  it('keeps visit submission unavailable without a selected client and makes no request', async () => {
    await configure();
    const fixture = render();
    const submit = fixture.nativeElement.querySelector(
      '[data-testid="visit-submit"]'
    ) as HTMLButtonElement;

    expect(submit.disabled).toBe(true);
    expect(text(fixture)).toContain(
      'Selecciona una clienta del directorio para registrar su visita.'
    );

    visitActions(fixture).registerVisit();
    expect(registerVisit).not.toHaveBeenCalled();
  });

  it('offers only active services from the canonical DbFacade catalog', async () => {
    const catalog = new Subject<ServicesDbSeed>();
    await configure({ servicesResponse: catalog });
    const fixture = render();

    expect(fixture.nativeElement.querySelector('[data-testid="services-loading"]')).toBeTruthy();

    catalog.next(serviceCatalog);
    await fixture.whenStable();
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelector(
      '[data-testid="active-service-options"]'
    ) as HTMLElement;
    expect(options.textContent).toContain(activeService.nombre);
    expect(options.textContent).toContain(secondActiveService.nombre);
    expect(options.textContent).not.toContain(inactiveService.nombre);
    expect(options.querySelectorAll('mat-checkbox')).toHaveLength(2);
  });

  it('mirrors integer money validation and accepts valid zero values', async () => {
    await configure();
    const fixture = render();
    const actions = visitActions(fixture);
    prepareVisit(fixture, '-1', '0');

    actions.registerVisit();
    expect(registerVisit).not.toHaveBeenCalled();

    setInput(fixture, '[data-testid="visit-amount"]', '10.5');
    actions.registerVisit();
    expect(registerVisit).not.toHaveBeenCalled();

    setInput(fixture, '[data-testid="visit-amount"]', '100');
    setInput(fixture, '[data-testid="visit-eligible-amount"]', '101');
    actions.registerVisit();
    expect(registerVisit).not.toHaveBeenCalled();

    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    setInput(fixture, '[data-testid="visit-amount"]', '0');
    setInput(fixture, '[data-testid="visit-eligible-amount"]', '0');
    actions.registerVisit();

    expect(registerVisit).toHaveBeenCalledTimes(1);
    expect(registerVisit.mock.calls[0][1]).toMatchObject({
      amountMXN: 0,
      eligibleAmountMXN: 0
    });
  });

  it('sends the canonical request shape with local time converted to ISO and unique IDs', async () => {
    await configure();
    const fixture = render();
    const actions = visitActions(fixture);
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture, '725', '625');
    actions.toggleService(activeService.id, true);
    actions.toggleService(activeService.id, true);
    actions.toggleService(secondActiveService.id, true);

    actions.registerVisit();

    expect(uuid).toHaveBeenCalledTimes(1);
    expect(registerVisit).toHaveBeenCalledWith(
      ana.clientId,
      {
        occurredAtISO: new Date('2026-11-10T09:30').toISOString(),
        amountMXN: 725,
        eligibleAmountMXN: 625,
        serviceIds: [activeService.id, secondActiveService.id]
      },
      UUID_ONE
    );
    expect(Object.keys(registerVisit.mock.calls[0][1])).toEqual([
      'occurredAtISO',
      'amountMXN',
      'eligibleAmountMXN',
      'serviceIds'
    ]);
  });

  it('creates one UUID and one request when repeated submission occurs in flight', async () => {
    const pending = new Subject<AdminClubVisitCreateResponse>();
    await configure({ visitResponse: () => pending });
    const fixture = render();
    const actions = visitActions(fixture);
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);

    actions.registerVisit();
    actions.registerVisit();
    fixture.detectChanges();

    expect(uuid).toHaveBeenCalledTimes(1);
    expect(registerVisit).toHaveBeenCalledTimes(1);
    expect(text(fixture)).toContain('Procesando visita');
    pending.complete();
  });

  it('retries a failed attempt with the exact frozen client, UUID and request body', async () => {
    let attemptCount = 0;
    const normalized = new AdminClubApiError('network', 'No se pudo confirmar la visita.');
    await configure({
      visitResponse: () =>
        attemptCount++ === 0
          ? throwError(() => normalized)
          : of(visitResponse())
    });
    const fixture = render();
    const actions = visitActions(fixture);
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);

    actions.registerVisit();
    const [firstClientId, firstRequest, firstKey] = registerVisit.mock.calls[0];
    actions.retryVisit();
    const [retryClientId, retryRequest, retryKey] = registerVisit.mock.calls[1];

    expect(firstClientId).toBe(ana.clientId);
    expect(retryClientId).toBe(firstClientId);
    expect(retryRequest).toBe(firstRequest);
    expect(retryKey).toBe(firstKey);
    expect(retryKey).toBe(UUID_ONE);
    expect(Object.isFrozen(firstRequest)).toBe(true);
    expect(Object.isFrozen(firstRequest.serviceIds)).toBe(true);
    expect(uuid).toHaveBeenCalledTimes(1);
  });

  it('abandons a failed attempt before changed data receives a new UUID', async () => {
    let attemptCount = 0;
    await configure({
      visitResponse: () =>
        attemptCount++ === 0
          ? throwError(() => new AdminClubApiError('server', 'Primer intento fallido.'))
          : of(visitResponse({ amountMXN: 700 }))
    });
    const fixture = render();
    const actions = visitActions(fixture);
    const uuid = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce(UUID_ONE)
      .mockReturnValueOnce(UUID_TWO);
    prepareVisit(fixture);

    actions.registerVisit();
    expect(actions.pendingVisitAttempt()).not.toBeNull();
    actions.editVisitAttempt();
    expect(actions.pendingVisitAttempt()).toBeNull();
    setInput(fixture, '[data-testid="visit-amount"]', '700');
    actions.registerVisit();

    expect(registerVisit.mock.calls[0][2]).toBe(UUID_ONE);
    expect(registerVisit.mock.calls[1][2]).toBe(UUID_TWO);
    expect(registerVisit.mock.calls[1][1].amountMXN).toBe(700);
    expect(uuid).toHaveBeenCalledTimes(2);
  });

  it('renders the server-authoritative outcome and updates the selected balance directly', async () => {
    const canonicalResponse = visitResponse({
      amountMXN: 50,
      eligibleAmountMXN: 0,
      stampCount: 11,
      carry: 975,
      stampsAwarded: 0
    });
    await configure({ visitResponse: () => of(canonicalResponse) });
    const fixture = render();
    const actions = visitActions(fixture);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture, '50', '0');

    actions.registerVisit();
    fixture.detectChanges();

    expect(actions.selectedBalance()).toEqual(canonicalResponse.balance);
    expect(text(fixture)).toContain('Visita registrada correctamente');
    expect(text(fixture)).toContain('Esta visita no otorgó sello.');
    expect(text(fixture)).toContain('11 sellos acumulados');
    expect(text(fixture)).toContain('$975');
    expect(text(fixture)).toContain('$50 total');
    expect(getClient).toHaveBeenCalledTimes(1);
    expect(listLedgerEntries).not.toHaveBeenCalled();
  });

  it('presents a safe replay as the original visit rather than a second registration', async () => {
    await configure({
      visitResponse: () =>
        of(visitResponse({ replayed: true, stampsAwarded: 1, stampCount: 4, carry: 625 }))
    });
    const fixture = render();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);

    visitActions(fixture).registerVisit();
    fixture.detectChanges();

    expect(text(fixture)).toContain('La visita ya estaba registrada');
    expect(text(fixture)).toContain('Se recuperó el resultado sin duplicar sellos.');
    expect(text(fixture)).toContain('La visita original otorgó 1 sello.');
    expect(text(fixture)).not.toContain('Esta visita otorgó 1 sello.');
  });

  it('keeps client B balance selected when client A visit resolves late', async () => {
    const pendingVisit = new Subject<AdminClubVisitCreateResponse>();
    await configure({ visitResponse: () => pendingVisit });
    const fixture = render();
    const actions = visitActions(fixture);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);
    actions.registerVisit();

    click(fixture, '[data-client-id="client-beatriz"]');
    const beatrizBalance = balance(beatriz.clientId, 1, 550);
    expect(actions.selectedBalance()).toEqual(beatrizBalance);

    pendingVisit.next(
      visitResponse({ clientId: ana.clientId, stampCount: 9, carry: 999 })
    );
    pendingVisit.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(actions.selectedBalance()).toEqual(beatrizBalance);
    expect(text(fixture)).toContain('Ana López');
    expect(fixture.nativeElement.querySelector('[data-testid="visit-outcome"]')).toBeTruthy();
  });

  it('keeps the newer visit balance when an older same-client detail response arrives later', async () => {
    const pendingDetail = new Subject<AdminClubClientDetailResponse>();
    const canonicalVisit = visitResponse({
      stampCount: 8,
      carry: 725,
      balanceVersion: 5
    });
    await configure({
      detailResponse: (clientId) =>
        clientId === ana.clientId
          ? pendingDetail
          : of({
              client: beatriz,
              balance: balance(beatriz.clientId, 1, 550)
            }),
      visitResponse: () => of(canonicalVisit)
    });
    const fixture = render();
    const actions = visitActions(fixture);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);

    expect(actions.selectedBalance()).toBeNull();

    actions.registerVisit();
    fixture.detectChanges();

    expect(actions.selectedBalance()).toEqual(canonicalVisit.balance);
    expect(text(fixture)).toContain('8 sellos acumulados');
    expect(text(fixture)).toContain('$725');

    pendingDetail.next({
      client: ana,
      balance: balance(ana.clientId, 3, 125, 4)
    });
    pendingDetail.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(actions.selectedBalance()).toEqual(canonicalVisit.balance);
    expect(actions.selectedBalance()?.version).toBe(5);
    expect(text(fixture)).toContain('8 sellos acumulados');
    expect(text(fixture)).toContain('$725');
  });

  it('accepts a genuinely newer same-client detail balance', async () => {
    const firstDetail = new Subject<AdminClubClientDetailResponse>();
    const newerDetail = balance(ana.clientId, 10, 875, 6);
    await configure({
      detailResponse: () => firstDetail,
      visitResponse: () =>
        of(
          visitResponse({
            stampCount: 8,
            carry: 725,
            balanceVersion: 5
          })
        )
    });
    const fixture = render();
    const actions = visitActions(fixture);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);

    actions.registerVisit();
    expect(actions.selectedBalance()?.version).toBe(5);

    firstDetail.next({ client: ana, balance: newerDetail });
    firstDetail.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(actions.selectedBalance()).toEqual(newerDetail);
    expect(text(fixture)).toContain('10 sellos acumulados');
    expect(text(fixture)).toContain('$875');
  });

  it('renders only normalized visit failures and preserves conflicts for explicit action', async () => {
    const conflict = new AdminClubApiError(
      'conflict',
      'La solicitud entra en conflicto con información actual.'
    );
    await configure({ visitResponse: () => throwError(() => conflict) });
    const fixture = render();
    const actions = visitActions(fixture);
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);

    actions.registerVisit();
    fixture.detectChanges();

    expect(text(fixture)).toContain(conflict.message);
    expect(text(fixture)).not.toContain('AccessDeniedException');
    expect(actions.pendingVisitAttempt()).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="visit-retry-actions"]')).toBeTruthy();
    expect(registerVisit).toHaveBeenCalledTimes(1);
    expect(uuid).toHaveBeenCalledTimes(1);
  });

  it('renders asynchronous visit failure, retry, and success in the zoneless fixture', async () => {
    const firstAttempt = new Subject<AdminClubVisitCreateResponse>();
    const retryAttempt = new Subject<AdminClubVisitCreateResponse>();
    let attemptCount = 0;
    await configure({
      visitResponse: () => (attemptCount++ === 0 ? firstAttempt : retryAttempt)
    });
    const fixture = render();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);
    visitActions(fixture).registerVisit();

    firstAttempt.error(new AdminClubApiError('network', 'Falla segura asíncrona.'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Falla segura asíncrona.');

    visitActions(fixture).retryVisit();
    retryAttempt.next(visitResponse({ stampCount: 8, carry: 725 }));
    retryAttempt.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Visita registrada correctamente');
    expect(text(fixture)).toContain('8 sellos acumulados');
    expect(visitActions(fixture).pendingVisitAttempt()).toBeNull();
  });

  it('does not call visit automatically or cross the ledger/history phase boundary', async () => {
    await configure();
    const fixture = render();
    click(fixture, '[data-client-id="client-ana"]');

    expect(registerVisit).not.toHaveBeenCalled();
    expect(listLedgerEntries).not.toHaveBeenCalled();
  });
});
