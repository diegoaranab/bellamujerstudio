import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import {
  ClubClient,
  LoyaltyBalance,
  LoyaltyLedgerEntry,
  Service
} from '../../core/models';
import {
  AdminClubAccessMutationResponse,
  AdminClubAccessReadResponse,
  AdminClubAccessSummary,
  AdminClubApiClient,
  AdminClubApiError,
  AdminClubClientCreateResponse,
  AdminClubClientDetailResponse,
  AdminClubClientListResponse,
  AdminClubLedgerListResponse,
  AdminClubVisitCreateRequest,
  AdminClubVisitCreateResponse
} from '../../core/services/admin-club-api.client';
import { DbFacadeService } from '../../core/services/db-facade.service';
import { ServicesDbSeed } from '../../core/services/seed-db.service';
import {
  buildClubActivationUrl,
  ClubDashboardComponent
} from './club-dashboard.component';

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

const invitedAccess: AdminClubAccessSummary = {
  status: 'invited',
  credentialVersion: 4,
  invitationGeneration: 2,
  hasPin: false,
  updatedAtISO: '2026-11-10T16:00:00.000Z'
};

const activeAccess: AdminClubAccessSummary = {
  ...invitedAccess,
  status: 'active',
  hasPin: true,
  updatedAtISO: '2026-11-10T17:00:00.000Z'
};

const disabledAccess: AdminClubAccessSummary = {
  ...activeAccess,
  status: 'disabled',
  updatedAtISO: '2026-11-10T18:00:00.000Z'
};

const activationFragment =
  '#/club/activar?access=opaque-access-handle&invite=one-time-invitation-token';

function accessMutation(
  access: AdminClubAccessSummary = invitedAccess,
  fragment = activationFragment
): AdminClubAccessMutationResponse {
  return {
    access,
    invitation: {
      activationFragment: fragment,
      expiresAtISO: '2026-11-11T16:00:00.000Z'
    }
  };
}

interface VisitTestActions {
  registerVisit(): void;
  retryVisit(): void;
  editVisitAttempt(): void;
  toggleService(serviceId: string, checked: boolean): void;
  pendingVisitAttempt(): unknown;
  selectedBalance(): LoyaltyBalance | null;
}

interface AccessTestActions {
  selectClient(client: ClubClient): void;
  generateAccessInvitation(): void;
  requestAccessReset(): void;
  cancelAccessReset(): void;
  confirmAccessReset(): void;
  refreshClientAccess(): void;
  copyAccessInvitation(): Promise<void>;
  shareAccessInvitation(): Promise<void>;
  selectedAccess(): AdminClubAccessSummary | null;
  oneTimeInvitation(): { activationUrl: string; expiresAtISO: string } | null;
  accessMutationLoading(): boolean;
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

function ledgerEntry(options: {
  entryId: string;
  type?: LoyaltyLedgerEntry['type'];
  occurredAtISO?: string;
  stampDelta?: number;
  eligibleSpendDeltaMXN?: number;
  stampCountAfter?: number;
  eligibleSpendCarryAfterMXN?: number;
  clientId?: string;
  reason?: string;
  createdByAdminSub?: string;
}): LoyaltyLedgerEntry {
  return {
    studioId: 'studio-1',
    clientId: options.clientId ?? ana.clientId,
    entryId: options.entryId,
    type: options.type ?? 'ELIGIBLE_SPEND_ADDED',
    occurredAtISO: options.occurredAtISO ?? '2026-11-10T15:30:00.000Z',
    createdAtISO: '2026-11-10T15:31:00.000Z',
    stampDelta: options.stampDelta ?? 0,
    eligibleSpendDeltaMXN: options.eligibleSpendDeltaMXN ?? 250,
    stampCountAfter: options.stampCountAfter ?? 2,
    eligibleSpendCarryAfterMXN: options.eligibleSpendCarryAfterMXN ?? 550,
    createdByAdminSub: options.createdByAdminSub ?? 'cognito-admin-sub-secret',
    visitId: 'visit-audit-link',
    ...(options.reason === undefined ? {} : { reason: options.reason })
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
  let listLedgerEntries: ReturnType<
    typeof vi.fn<
      (
        clientId: string,
        limit?: number,
        nextToken?: string
      ) => Observable<AdminClubLedgerListResponse>
    >
  >;
  let getClientAccess: ReturnType<
    typeof vi.fn<(clientId: string) => Observable<AdminClubAccessReadResponse>>
  >;
  let generateClientAccessInvitation: ReturnType<
    typeof vi.fn<(clientId: string) => Observable<AdminClubAccessMutationResponse>>
  >;
  let resetClientAccess: ReturnType<
    typeof vi.fn<(clientId: string) => Observable<AdminClubAccessMutationResponse>>
  >;

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
    ledgerResponse?: (
      clientId: string,
      limit?: number,
      nextToken?: string
    ) => Observable<AdminClubLedgerListResponse>;
    accessResponse?: (clientId: string) => Observable<AdminClubAccessReadResponse>;
    invitationResponse?: (
      clientId: string
    ) => Observable<AdminClubAccessMutationResponse>;
    resetResponse?: (clientId: string) => Observable<AdminClubAccessMutationResponse>;
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
    listLedgerEntries = vi.fn(
      (clientId, limit, nextToken) =>
        options.ledgerResponse?.(clientId, limit, nextToken) ?? of({ items: [] })
    );
    getClientAccess = vi.fn(
      (clientId) => options.accessResponse?.(clientId) ?? of({ access: null })
    );
    generateClientAccessInvitation = vi.fn(
      (clientId) => options.invitationResponse?.(clientId) ?? of(accessMutation())
    );
    resetClientAccess = vi.fn(
      (clientId) => options.resetResponse?.(clientId) ?? of(accessMutation())
    );

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
            listLedgerEntries,
            getClientAccess,
            generateClientAccessInvitation,
            resetClientAccess
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

  function accessActions(
    fixture: ComponentFixture<ClubDashboardComponent>
  ): AccessTestActions {
    return fixture.componentInstance as unknown as AccessTestActions;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window.navigator, 'clipboard');
    Reflect.deleteProperty(window.navigator, 'share');
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

  it('loads access independently when a client is selected', async () => {
    await configure({ accessResponse: () => of({ access: activeAccess }) });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');

    expect(getClientAccess).toHaveBeenCalledWith(ana.clientId);
    expect(text(fixture)).toContain('Acceso activo');
    expect(text(fixture)).toContain('La clienta ya configuró su NIP.');
  });

  it('keeps detail, balance, and history intact when access loading fails and retries independently', async () => {
    const accessError = new AdminClubApiError('network', 'No fue posible cargar el acceso.');
    const keptLedger = ledgerEntry({
      entryId: 'kept-during-access-read-error',
      type: 'ADMIN_ADJUSTMENT',
      reason: 'Historial independiente'
    });
    await configure({ ledgerResponse: () => of({ items: [keptLedger] }) });
    getClientAccess
      .mockReturnValueOnce(throwError(() => accessError))
      .mockReturnValueOnce(of({ access: activeAccess }));
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');

    expect(text(fixture)).toContain(accessError.message);
    expect(text(fixture)).toContain('1 sello acumulado');
    expect(text(fixture)).toContain('Historial independiente');
    click(fixture, '[data-testid="access-read-error"] button');

    expect(getClientAccess).toHaveBeenCalledTimes(2);
    expect(text(fixture)).toContain('Acceso activo');
    expect(text(fixture)).toContain('1 sello acumulado');
    expect(text(fixture)).toContain('Historial independiente');
  });

  it('renders asynchronous access reads and mutations in the zoneless fixture', async () => {
    const pendingAccess = new Subject<AdminClubAccessReadResponse>();
    const pendingInvitation = new Subject<AdminClubAccessMutationResponse>();
    await configure({
      accessResponse: () => pendingAccess,
      invitationResponse: () => pendingInvitation
    });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    expect(fixture.nativeElement.querySelector('[data-testid="access-loading"]')).toBeTruthy();
    pendingAccess.next({ access: null });
    pendingAccess.complete();
    await fixture.whenStable();
    expect(text(fixture)).toContain('Acceso no configurado');

    click(fixture, '[data-testid="access-invitation-action"]');
    pendingInvitation.next(accessMutation());
    pendingInvitation.complete();
    await fixture.whenStable();

    expect(text(fixture)).toContain('Invitación pendiente');
    expect(fixture.nativeElement.querySelector('[data-testid="one-time-invitation"]')).toBeTruthy();
  });

  it('never lets a late client A access response replace client B access', async () => {
    const anaAccess = new Subject<AdminClubAccessReadResponse>();
    const beatrizAccess = new Subject<AdminClubAccessReadResponse>();
    await configure({
      accessResponse: (clientId) =>
        clientId === ana.clientId ? anaAccess : beatrizAccess
    });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-client-id="client-beatriz"]');
    beatrizAccess.next({ access: disabledAccess });
    anaAccess.next({ access: invitedAccess });
    fixture.detectChanges();

    expect(accessActions(fixture).selectedAccess()).toEqual(disabledAccess);
    expect(text(fixture)).toContain('Acceso deshabilitado');
    expect(text(fixture)).not.toContain('Invitación pendiente');
  });

  it('does not let a stale access read overwrite a successful mutation result', async () => {
    const staleRead = new Subject<AdminClubAccessReadResponse>();
    const authoritative = { ...invitedAccess, invitationGeneration: 9 };
    await configure({
      accessResponse: () => staleRead,
      invitationResponse: () => of(accessMutation(authoritative))
    });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    accessActions(fixture).generateAccessInvitation();
    staleRead.next({ access: activeAccess });
    fixture.detectChanges();

    expect(accessActions(fixture).selectedAccess()).toEqual(authoritative);
    expect(text(fixture)).toContain('Invitación pendiente');
    expect(text(fixture)).not.toContain('Acceso activo');
  });

  it.each([
    [null, 'Acceso no configurado', 'Generar invitación', false],
    [invitedAccess, 'Invitación pendiente', 'Regenerar enlace', false],
    [activeAccess, 'Acceso activo', 'Restablecer acceso', true],
    [disabledAccess, 'Acceso deshabilitado', 'Restablecer acceso', true]
  ] as const)(
    'renders the authoritative access state %# with only its valid operation',
    async (access, stateText, actionText, expectsReset) => {
      await configure({ accessResponse: () => of({ access }) });
      const fixture = render();

      click(fixture, '[data-client-id="client-ana"]');

      const accessCard = fixture.nativeElement.querySelector(
        '[data-testid="client-access"]'
      ) as HTMLElement;
      expect(accessCard.textContent).toContain(stateText);
      expect(accessCard.textContent).toContain(actionText);
      expect(
        accessCard.querySelector('[data-testid="access-reset-action"]') !== null
      ).toBe(expectsReset);
      expect(
        accessCard.querySelector('[data-testid="access-invitation-action"]') !== null
      ).toBe(!expectsReset);
    }
  );

  it('requires explicit reset confirmation and cancellation sends no mutation', async () => {
    await configure({ accessResponse: () => of({ access: activeAccess }) });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-reset-action"]');

    expect(resetClientAccess).not.toHaveBeenCalled();
    expect(text(fixture)).toContain('El NIP actual y las sesiones activas dejarán de funcionar.');
    click(fixture, '[data-testid="access-reset-cancel"]');
    expect(resetClientAccess).not.toHaveBeenCalled();
    expect(
      fixture.nativeElement.querySelector('[data-testid="access-reset-confirmation"]')
    ).toBeNull();
  });

  it('applies an initial invitation response and keeps its private link in component memory', async () => {
    const mutation = accessMutation();
    await configure({ invitationResponse: () => of(mutation) });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-invitation-action"]');

    expect(generateClientAccessInvitation).toHaveBeenCalledWith(ana.clientId);
    expect(accessActions(fixture).selectedAccess()).toEqual(mutation.access);
    expect(accessActions(fixture).oneTimeInvitation()?.activationUrl).toBe(
      new URL(activationFragment, document.baseURI).toString()
    );
    expect(fixture.nativeElement.querySelector('[data-testid="one-time-invitation"]')).toBeTruthy();
  });

  it('replaces an earlier one-time invitation with a successful regeneration result', async () => {
    const firstFragment = '#/club/activar?access=first-handle&invite=first-token';
    const secondFragment = '#/club/activar?access=second-handle&invite=second-token';
    await configure({ accessResponse: () => of({ access: invitedAccess }) });
    generateClientAccessInvitation
      .mockReturnValueOnce(of(accessMutation(invitedAccess, firstFragment)))
      .mockReturnValueOnce(of(accessMutation(invitedAccess, secondFragment)));
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-invitation-action"]');
    expect(accessActions(fixture).oneTimeInvitation()?.activationUrl).toContain('first-handle');
    click(fixture, '[data-testid="access-invitation-action"]');

    expect(generateClientAccessInvitation).toHaveBeenCalledTimes(2);
    expect(accessActions(fixture).oneTimeInvitation()?.activationUrl).toContain('second-handle');
    expect(accessActions(fixture).oneTimeInvitation()?.activationUrl).not.toContain('first-handle');
  });

  it('applies a full reset response, closes confirmation, and shows the one-time panel', async () => {
    await configure({
      accessResponse: () => of({ access: activeAccess }),
      resetResponse: () => of(accessMutation(invitedAccess))
    });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-reset-action"]');
    click(fixture, '[data-testid="access-reset-confirm"]');

    expect(resetClientAccess).toHaveBeenCalledWith(ana.clientId);
    expect(accessActions(fixture).selectedAccess()).toEqual(invitedAccess);
    expect(
      fixture.nativeElement.querySelector('[data-testid="access-reset-confirmation"]')
    ).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="one-time-invitation"]')).toBeTruthy();
  });

  it('does not persist or render activation secrets or access implementation metadata', async () => {
    const localStorageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const originalUrl = window.location.href;
    const metadataHeavyAccess = {
      ...invitedAccess,
      credentialVersion: 987654,
      invitationGeneration: 876543
    };
    await configure({
      invitationResponse: () => of(accessMutation(metadataHeavyAccess))
    });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-invitation-action"]');

    expect(localStorageWrite).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.href).toBe(originalUrl);
    const adminDom = (fixture.nativeElement as HTMLElement).outerHTML;
    expect(adminDom).not.toContain('opaque-access-handle');
    expect(adminDom).not.toContain('one-time-invitation-token');
    expect(adminDom).not.toContain('987654');
    expect(adminDom).not.toContain('876543');
    expect(adminDom).not.toContain('digest');
    expect(adminDom).not.toContain('verifier');
  });

  it('builds activation URLs against localhost and GitHub Pages base paths only for the expected route', () => {
    expect(
      buildClubActivationUrl(
        activationFragment,
        'http://localhost:4200/'
      )
    ).toBe(`http://localhost:4200/${activationFragment}`);
    expect(
      buildClubActivationUrl(
        activationFragment,
        'https://diegoaranab.github.io/bellamujerstudio/'
      )
    ).toBe(`https://diegoaranab.github.io/bellamujerstudio/${activationFragment}`);
    expect(
      buildClubActivationUrl('https://evil.example/steal', 'http://localhost:4200/')
    ).toBeNull();
    expect(buildClubActivationUrl('#/otro?invite=secret', 'http://localhost:4200/')).toBeNull();
  });

  it('copies the exact full activation URL and reports success safely', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    await configure();
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-invitation-action"]');
    await accessActions(fixture).copyAccessInvitation();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith(new URL(activationFragment, document.baseURI).toString());
    expect(text(fixture)).toContain('Enlace copiado.');
  });

  it('shows clipboard failure without exposing the private URL', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('secret transport failure'));
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    await configure();
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-invitation-action"]');
    await accessActions(fixture).copyAccessInvitation();
    fixture.detectChanges();

    expect(text(fixture)).toContain('No pudimos copiar el enlace automáticamente.');
    expect(text(fixture)).not.toContain('opaque-access-handle');
    expect(text(fixture)).not.toContain('secret transport failure');
  });

  it('uses native share with the exact activation URL when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: share
    });
    await configure();
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-invitation-action"]');
    expect(fixture.nativeElement.querySelector('[data-testid="access-share-link"]')).toBeTruthy();
    await accessActions(fixture).shareAccessInvitation();
    fixture.detectChanges();

    expect(share).toHaveBeenCalledWith({
      title: 'Acceso a Bella Mujer Club',
      text: 'Configura tu acceso privado a Bella Mujer Club.',
      url: new URL(activationFragment, document.baseURI).toString()
    });
    expect(text(fixture)).toContain('Enlace compartido.');
  });

  it('hides native share safely when unsupported', async () => {
    await configure();
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-invitation-action"]');

    expect(fixture.nativeElement.querySelector('[data-testid="access-share-link"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="access-copy-link"]')).toBeTruthy();
  });

  it('locks client selection during a sensitive mutation and applies the result to its frozen client', async () => {
    const pendingMutation = new Subject<AdminClubAccessMutationResponse>();
    await configure({ invitationResponse: () => pendingMutation });
    const fixture = render();
    const actions = accessActions(fixture);

    click(fixture, '[data-client-id="client-ana"]');
    actions.generateAccessInvitation();
    actions.selectClient(beatriz);

    expect(actions.accessMutationLoading()).toBe(true);
    expect(getClientAccess).toHaveBeenCalledTimes(1);
    expect(getClientAccess).toHaveBeenCalledWith(ana.clientId);
    pendingMutation.next(accessMutation());
    pendingMutation.complete();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Acceso de Ana López');
  });

  it('clears a one-time invitation when deliberately selecting another client', async () => {
    await configure();
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-invitation-action"]');
    expect(accessActions(fixture).oneTimeInvitation()).not.toBeNull();
    click(fixture, '[data-client-id="client-beatriz"]');

    expect(accessActions(fixture).oneTimeInvitation()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="one-time-invitation"]')).toBeNull();
    expect(text(fixture)).toContain('Acceso de Beatriz Ramos');
  });

  it('does not retry a failed mutation and refreshes access without disturbing detail or history', async () => {
    const mutationError = new AdminClubApiError('network', 'No se pudo confirmar el cambio.');
    const keptLedger = ledgerEntry({
      entryId: 'kept-after-access-error',
      type: 'ADMIN_ADJUSTMENT',
      reason: 'Movimiento conservado'
    });
    await configure({
      accessResponse: () => of({ access: invitedAccess }),
      invitationResponse: () => throwError(() => mutationError),
      ledgerResponse: () => of({ items: [keptLedger] })
    });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="access-invitation-action"]');

    expect(generateClientAccessInvitation).toHaveBeenCalledTimes(1);
    expect(text(fixture)).toContain(mutationError.message);
    expect(text(fixture)).toContain('Invitación pendiente');
    expect(text(fixture)).toContain('1 sello acumulado');
    expect(text(fixture)).toContain('Movimiento conservado');
    click(fixture, '[data-testid="access-mutation-error"] button');

    expect(getClientAccess).toHaveBeenCalledTimes(2);
    expect(generateClientAccessInvitation).toHaveBeenCalledTimes(1);
    expect(text(fixture)).toContain('1 sello acumulado');
    expect(text(fixture)).toContain('Movimiento conservado');
  });

  it('loads the selected client ledger in server order and presents safe movement details', async () => {
    const entries = [
      ledgerEntry({
        entryId: 'newest-spend',
        eligibleSpendDeltaMXN: 250,
        occurredAtISO: '2026-11-10T18:00:00.000Z'
      }),
      ledgerEntry({
        entryId: 'stamp-earned',
        type: 'STAMP_EARNED',
        stampDelta: 1,
        eligibleSpendDeltaMXN: -300,
        occurredAtISO: '2026-11-10T17:59:59.000Z'
      }),
      ledgerEntry({
        entryId: 'adjustment-reason',
        type: 'ADMIN_ADJUSTMENT',
        stampDelta: -1,
        eligibleSpendDeltaMXN: 0,
        reason: 'Corrección autorizada'
      }),
      ledgerEntry({
        entryId: 'adjustment-fallback',
        type: 'ADMIN_ADJUSTMENT',
        eligibleSpendDeltaMXN: 0
      })
    ];
    await configure({
      ledgerResponse: () => of({ items: entries, nextToken: 'opaque-secret-token' })
    });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');

    expect(listLedgerEntries).toHaveBeenCalledWith(ana.clientId, 50);
    expect(
      [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
          '[data-entry-id]'
        )
      ].map((element) => element.dataset['entryId'])
    ).toEqual(entries.map((entry) => entry.entryId));
    expect(text(fixture)).toContain('Consumo elegible agregado');
    expect(text(fixture)).toContain('Sello ganado');
    expect(text(fixture)).toContain('Corrección autorizada');
    expect(text(fixture).match(/Ajuste administrativo/g)?.length).toBeGreaterThanOrEqual(2);
    expect(text(fixture)).toContain('+$250');
    expect(text(fixture)).toContain('-$300');
    expect(text(fixture)).toContain('+1 sello');
    expect(text(fixture)).toContain('-1 sello');
    expect(text(fixture)).not.toContain('cognito-admin-sub-secret');
    expect(text(fixture)).not.toContain('opaque-secret-token');
  });

  it('renders an empty ledger as a valid state', async () => {
    await configure();
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');

    expect(fixture.nativeElement.querySelector('[data-testid="history-empty"]')).toBeTruthy();
    expect(text(fixture)).toContain(
      'Esta clienta aún no tiene movimientos de fidelidad.'
    );
  });

  it('renders a normalized ledger error and retries the selected client first page', async () => {
    const normalized = new AdminClubApiError(
      'network',
      'No fue posible cargar el historial.'
    );
    await configure();
    listLedgerEntries
      .mockReturnValueOnce(throwError(() => normalized))
      .mockReturnValueOnce(of({ items: [] }));
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    expect(text(fixture)).toContain(normalized.message);
    click(fixture, '[data-testid="history-error"] button');

    expect(listLedgerEntries).toHaveBeenNthCalledWith(1, ana.clientId, 50);
    expect(listLedgerEntries).toHaveBeenNthCalledWith(2, ana.clientId, 50);
    expect(fixture.nativeElement.querySelector('[data-testid="history-empty"]')).toBeTruthy();
  });

  it('never lets a late client A ledger replace client B history', async () => {
    const anaLedger = new Subject<AdminClubLedgerListResponse>();
    const beatrizLedger = new Subject<AdminClubLedgerListResponse>();
    await configure({
      ledgerResponse: (clientId) =>
        clientId === ana.clientId ? anaLedger : beatrizLedger
    });
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-client-id="client-beatriz"]');
    beatrizLedger.next({
      items: [
        ledgerEntry({
          entryId: 'beatriz-entry',
          clientId: beatriz.clientId,
          type: 'ADMIN_ADJUSTMENT',
          reason: 'Movimiento de Beatriz'
        })
      ]
    });
    anaLedger.next({
      items: [
        ledgerEntry({
          entryId: 'ana-late-entry',
          type: 'ADMIN_ADJUSTMENT',
          reason: 'Movimiento tardío de Ana'
        })
      ]
    });
    fixture.detectChanges();

    const ledger = fixture.nativeElement.querySelector('[data-testid="ledger-list"]');
    expect(ledger.textContent).toContain('Movimiento de Beatriz');
    expect(ledger.textContent).not.toContain('Movimiento tardío de Ana');
    expect(text(fixture)).toContain('Movimientos de Beatriz Ramos');
  });

  it('forwards an opaque ledger token, appends in order, deduplicates, and stops at the end', async () => {
    const newest = ledgerEntry({ entryId: 'ledger-newest' });
    const older = ledgerEntry({
      entryId: 'ledger-older',
      occurredAtISO: newest.occurredAtISO
    });
    await configure();
    listLedgerEntries
      .mockReturnValueOnce(
        of({ items: [newest], nextToken: 'opaque+/= ledger token' })
      )
      .mockReturnValueOnce(of({ items: [newest, older] }));
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="history-load-more"]');

    expect(listLedgerEntries).toHaveBeenLastCalledWith(
      ana.clientId,
      50,
      'opaque+/= ledger token'
    );
    expect(
      [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
          '[data-entry-id]'
        )
      ].map((element) => element.dataset['entryId'])
    ).toEqual(['ledger-newest', 'ledger-older']);
    expect(
      fixture.nativeElement.querySelector('[data-testid="history-load-more"]')
    ).toBeNull();
    expect(text(fixture)).not.toContain('opaque+/= ledger token');
  });

  it('preserves ledger rows and retries load-more with the same opaque token', async () => {
    const pageError = new AdminClubApiError(
      'server',
      'No fue posible cargar movimientos anteriores.'
    );
    await configure();
    listLedgerEntries
      .mockReturnValueOnce(
        of({
          items: [ledgerEntry({ entryId: 'kept-entry' })],
          nextToken: 'retry-ledger-token'
        })
      )
      .mockReturnValueOnce(throwError(() => pageError))
      .mockReturnValueOnce(
        of({ items: [ledgerEntry({ entryId: 'retried-older-entry' })] })
      );
    const fixture = render();

    click(fixture, '[data-client-id="client-ana"]');
    click(fixture, '[data-testid="history-load-more"]');
    expect(text(fixture)).toContain(pageError.message);
    expect(fixture.nativeElement.querySelector('[data-entry-id="kept-entry"]')).toBeTruthy();
    click(fixture, '[data-testid="history-load-more"]');

    expect(listLedgerEntries).toHaveBeenNthCalledWith(
      2,
      ana.clientId,
      50,
      'retry-ledger-token'
    );
    expect(listLedgerEntries).toHaveBeenNthCalledWith(
      3,
      ana.clientId,
      50,
      'retry-ledger-token'
    );
    expect(
      fixture.nativeElement.querySelector('[data-entry-id="retried-older-entry"]')
    ).toBeTruthy();
  });

  it('renders asynchronous history loading, pagination, refresh, and errors zonelessly', async () => {
    const firstPage = new Subject<AdminClubLedgerListResponse>();
    const olderPage = new Subject<AdminClubLedgerListResponse>();
    const refreshPage = new Subject<AdminClubLedgerListResponse>();
    let firstPageRequests = 0;
    await configure({
      ledgerResponse: (_clientId, _limit, token) => {
        if (token) {
          return olderPage;
        }
        return firstPageRequests++ === 0 ? firstPage : refreshPage;
      }
    });
    const fixture = render();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);

    click(fixture, '[data-client-id="client-ana"]');
    expect(fixture.nativeElement.querySelector('[data-testid="history-loading"]')).toBeTruthy();

    firstPage.next({
      items: [ledgerEntry({ entryId: 'async-first' })],
      nextToken: 'async-next'
    });
    firstPage.complete();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-entry-id="async-first"]')).toBeTruthy();

    click(fixture, '[data-testid="history-load-more"]');
    olderPage.next({ items: [ledgerEntry({ entryId: 'async-older' })] });
    olderPage.complete();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-entry-id="async-older"]')).toBeTruthy();

    setInput(fixture, '[data-testid="visit-date"]', '2026-11-10T09:30');
    setInput(fixture, '[data-testid="visit-amount"]', '500');
    setInput(fixture, '[data-testid="visit-eligible-amount"]', '400');
    visitActions(fixture).registerVisit();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="history-refreshing"]')
    ).toBeTruthy();

    refreshPage.error(
      new AdminClubApiError('network', 'Error seguro de actualización asíncrona.')
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Visita registrada correctamente');
    expect(text(fixture)).toContain('Error seguro de actualización asíncrona.');
    expect(fixture.nativeElement.querySelector('[data-entry-id="async-first"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-entry-id="async-older"]')).toBeTruthy();
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
    expect(getClientAccess).toHaveBeenCalledWith(canonical.clientId);
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
    expect(listLedgerEntries).toHaveBeenCalledTimes(2);
    expect(listLedgerEntries).toHaveBeenLastCalledWith(ana.clientId, 50);
  });

  it('replaces ledger page and pagination after a successful visit refresh', async () => {
    const oldEntry = ledgerEntry({ entryId: 'before-visit' });
    const refreshedEntry = ledgerEntry({ entryId: 'after-visit' });
    await configure();
    listLedgerEntries
      .mockReturnValueOnce(
        of({ items: [oldEntry], nextToken: 'stale-before-visit-token' })
      )
      .mockReturnValueOnce(
        of({ items: [refreshedEntry], nextToken: 'fresh-after-visit-token' })
      )
      .mockReturnValueOnce(of({ items: [] }));
    const fixture = render();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);

    visitActions(fixture).registerVisit();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-entry-id="before-visit"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-entry-id="after-visit"]')).toBeTruthy();
    click(fixture, '[data-testid="history-load-more"]');
    expect(listLedgerEntries).toHaveBeenLastCalledWith(
      ana.clientId,
      50,
      'fresh-after-visit-token'
    );
  });

  it('deduplicates the authoritative ledger refresh after a replayed visit', async () => {
    const committed = ledgerEntry({ entryId: 'replayed-ledger-entry' });
    let firstPageCount = 0;
    await configure({
      visitResponse: () => of(visitResponse({ replayed: true })),
      ledgerResponse: () =>
        of({ items: firstPageCount++ === 0 ? [committed] : [committed, committed] })
    });
    const fixture = render();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);

    visitActions(fixture).registerVisit();
    fixture.detectChanges();

    expect(text(fixture)).toContain('La visita ya estaba registrada');
    expect(
      fixture.nativeElement.querySelectorAll('[data-entry-id="replayed-ledger-entry"]')
    ).toHaveLength(1);
    expect(listLedgerEntries).toHaveBeenCalledTimes(2);
  });

  it('keeps visit success and valid rows when the independent ledger refresh fails', async () => {
    const refreshError = new AdminClubApiError(
      'network',
      'La visita se guardó, pero el historial no pudo actualizarse.'
    );
    await configure();
    listLedgerEntries
      .mockReturnValueOnce(of({ items: [ledgerEntry({ entryId: 'valid-old-row' })] }))
      .mockReturnValueOnce(throwError(() => refreshError))
      .mockReturnValueOnce(of({ items: [ledgerEntry({ entryId: 'refreshed-row' })] }));
    const fixture = render();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);

    visitActions(fixture).registerVisit();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Visita registrada correctamente');
    expect(text(fixture)).toContain(refreshError.message);
    expect(fixture.nativeElement.querySelector('[data-entry-id="valid-old-row"]')).toBeTruthy();
    expect(registerVisit).toHaveBeenCalledTimes(1);

    click(fixture, '[data-testid="history-refresh-error"] button');
    expect(registerVisit).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('[data-entry-id="refreshed-row"]')).toBeTruthy();
  });

  it('does not refresh client B when a client A visit resolves after selection changed', async () => {
    const pendingVisit = new Subject<AdminClubVisitCreateResponse>();
    await configure({ visitResponse: () => pendingVisit });
    const fixture = render();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);
    visitActions(fixture).registerVisit();

    click(fixture, '[data-client-id="client-beatriz"]');
    expect(listLedgerEntries).toHaveBeenCalledTimes(2);
    pendingVisit.next(visitResponse({ clientId: ana.clientId }));
    pendingVisit.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listLedgerEntries).toHaveBeenCalledTimes(2);
    expect(listLedgerEntries).toHaveBeenLastCalledWith(beatriz.clientId, 50);
    expect(text(fixture)).toContain('Movimientos de Beatriz Ramos');
  });

  it('ignores an old load-more page after a visit starts a new history generation', async () => {
    const staleLoadMore = new Subject<AdminClubLedgerListResponse>();
    const refreshedFirstPage = new Subject<AdminClubLedgerListResponse>();
    let firstPageCount = 0;
    await configure({
      ledgerResponse: (_clientId, _limit, token) => {
        if (token) {
          return staleLoadMore;
        }
        return firstPageCount++ === 0
          ? of({
              items: [ledgerEntry({ entryId: 'initial-row' })],
              nextToken: 'old-page-token'
            })
          : refreshedFirstPage;
      }
    });
    const fixture = render();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(UUID_ONE);
    prepareVisit(fixture);
    click(fixture, '[data-testid="history-load-more"]');

    visitActions(fixture).registerVisit();
    refreshedFirstPage.next({ items: [ledgerEntry({ entryId: 'refresh-winner' })] });
    refreshedFirstPage.complete();
    staleLoadMore.next({ items: [ledgerEntry({ entryId: 'stale-older-row' })] });
    staleLoadMore.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-entry-id="refresh-winner"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-entry-id="initial-row"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-entry-id="stale-older-row"]')).toBeNull();
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

  it('loads history without calling visit or adding adjustment mutations', async () => {
    await configure();
    const fixture = render();
    click(fixture, '[data-client-id="client-ana"]');

    expect(registerVisit).not.toHaveBeenCalled();
    expect(listLedgerEntries).toHaveBeenCalledWith(ana.clientId, 50);
    expect(
      Object.keys(
        (TestBed.inject(AdminClubApiClient) as unknown as Record<string, unknown>)
      )
    ).not.toContain('adjustLedger');
  });
});
