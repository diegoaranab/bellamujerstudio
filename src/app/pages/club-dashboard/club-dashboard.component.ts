import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  Observable,
  Subject,
  catchError,
  finalize,
  map,
  of,
  startWith,
  switchMap
} from 'rxjs';

import { ClubClient, LoyaltyBalance, Service } from '../../core/models';
import {
  AdminClubApiClient,
  AdminClubApiError,
  AdminClubClientDetailResponse,
  AdminClubVisitCreateRequest,
  AdminClubVisitCreateResponse
} from '../../core/services/admin-club-api.client';
import { DbFacadeService } from '../../core/services/db-facade.service';

type DetailIntent =
  | { kind: 'load'; client: ClubClient }
  | { kind: 'resolved'; detail: AdminClubClientDetailResponse };

type DetailResult =
  | { kind: 'success'; detail: AdminClubClientDetailResponse }
  | { kind: 'error'; message: string };

interface PendingVisitAttempt {
  clientId: string;
  clientName: string;
  idempotencyKey: string;
  request: AdminClubVisitCreateRequest;
}

interface VisitOutcome {
  clientId: string;
  clientName: string;
  response: AdminClubVisitCreateResponse;
}

type ServiceCatalogState =
  | { kind: 'loading' }
  | { kind: 'ready'; services: Service[] }
  | { kind: 'error'; message: string };

const MAX_VISIT_SERVICES = 50;
const STRICT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const safeIntegerValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const value = control.value;
  return value === null || value === '' || Number.isSafeInteger(value)
    ? null
    : { integer: true };
};

const eligibleAmountValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const amount = control.get('amountMXN')?.value;
  const eligibleAmount = control.get('eligibleAmountMXN')?.value;
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(eligibleAmount)) {
    return null;
  }
  return eligibleAmount <= amount ? null : { eligibleExceedsAmount: true };
};

const serviceCountValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null =>
  Array.isArray(control.value) && control.value.length <= MAX_VISIT_SERVICES
    ? null
    : { maxServices: true };

@Component({
  selector: 'app-club-dashboard',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './club-dashboard.component.html',
  styleUrl: './club-dashboard.component.scss'
})
export class ClubDashboardComponent implements OnInit {
  private readonly clubApi = inject(AdminClubApiClient);
  private readonly dbFacade = inject(DbFacadeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly detailIntents = new Subject<DetailIntent>();
  private directoryRevision = 0;
  private readonly createdClientRevisions = new Map<string, number>();

  protected readonly isConfigured = this.clubApi.isConfigured;
  protected readonly filterControl = new FormControl('', { nonNullable: true });
  private readonly filterQuery = toSignal(this.filterControl.valueChanges, {
    initialValue: this.filterControl.value
  });
  protected readonly createForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)]
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50)]
    })
  });
  protected readonly visitForm = new FormGroup(
    {
      occurredAtLocal: new FormControl(this.localDateTimeValue(), {
        nonNullable: true,
        validators: [Validators.required]
      }),
      amountMXN: new FormControl<number | null>(null, {
        validators: [Validators.required, Validators.min(0), safeIntegerValidator]
      }),
      eligibleAmountMXN: new FormControl<number | null>(null, {
        validators: [Validators.required, Validators.min(0), safeIntegerValidator]
      }),
      serviceIds: new FormControl<string[]>([], {
        nonNullable: true,
        validators: [serviceCountValidator]
      })
    },
    { validators: [eligibleAmountValidator] }
  );

  private readonly serviceCatalogState = toSignal(
    this.dbFacade.services$.pipe(
      map(
        (catalog): ServiceCatalogState => ({
          kind: 'ready',
          services: catalog.services.filter((service) => service.activo)
        })
      ),
      startWith({ kind: 'loading' } as ServiceCatalogState),
      catchError(() =>
        of({
          kind: 'error',
          message: 'No fue posible cargar el catálogo de servicios.'
        } as ServiceCatalogState)
      )
    ),
    { initialValue: { kind: 'loading' } as ServiceCatalogState }
  );

  protected readonly clients = signal<ClubClient[]>([]);
  protected readonly initialLoading = signal(false);
  protected readonly initialError = signal<string | null>(null);
  protected readonly nextToken = signal<string | undefined>(undefined);
  protected readonly loadMoreLoading = signal(false);
  protected readonly loadMoreError = signal<string | null>(null);

  protected readonly selectedClientId = signal<string | null>(null);
  protected readonly selectedClient = signal<ClubClient | null>(null);
  protected readonly selectedBalance = signal<LoyaltyBalance | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal<string | null>(null);

  protected readonly createLoading = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly createSuccess = signal<string | null>(null);

  protected readonly visitLoading = signal(false);
  protected readonly pendingVisitAttempt = signal<PendingVisitAttempt | null>(null);
  protected readonly visitError = signal<string | null>(null);
  protected readonly visitOutcome = signal<VisitOutcome | null>(null);

  protected readonly activeServices = computed(() => {
    const state = this.serviceCatalogState();
    return state.kind === 'ready' ? state.services : [];
  });
  protected readonly serviceCatalogLoading = computed(
    () => this.serviceCatalogState().kind === 'loading'
  );
  protected readonly serviceCatalogError = computed(() => {
    const state = this.serviceCatalogState();
    return state.kind === 'error' ? state.message : null;
  });

  protected readonly filteredClients = computed(() => {
    const query = this.filterQuery().trim().toLocaleLowerCase('es-MX');
    const clients = this.clients();
    if (!query) {
      return clients;
    }
    return clients.filter((client) =>
      `${client.name} ${client.phone}`.toLocaleLowerCase('es-MX').includes(query)
    );
  });

  protected readonly selectedDetail = computed(() => {
    const client = this.selectedClient();
    const balance = this.selectedBalance();
    return client && balance ? { client, balance } : null;
  });

  ngOnInit(): void {
    this.connectDetailSelection();
    if (this.isConfigured) {
      this.loadFirstPage();
    }
  }

  protected loadFirstPage(): void {
    if (!this.isConfigured || this.initialLoading()) {
      return;
    }
    this.initialLoading.set(true);
    this.initialError.set(null);
    this.loadMoreError.set(null);
    const requestRevision = this.directoryRevision;

    this.clubApi
      .listClients(50)
      .pipe(
        finalize(() => this.initialLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          const clientsCreatedAfterRequest = this.clients().filter(
            (client) =>
              (this.createdClientRevisions.get(client.clientId) ?? 0) > requestRevision
          );
          this.clients.set(
            this.uniqueClients([...clientsCreatedAfterRequest, ...response.items])
          );
          this.nextToken.set(response.nextToken);
        },
        error: (error: unknown) => {
          this.initialError.set(this.safeErrorMessage(error));
        }
      });
  }

  protected loadMore(): void {
    const token = this.nextToken();
    if (!token || this.loadMoreLoading() || this.initialLoading()) {
      return;
    }
    this.loadMoreLoading.set(true);
    this.loadMoreError.set(null);

    this.clubApi
      .listClients(50, token)
      .pipe(
        finalize(() => this.loadMoreLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          this.clients.set(
            this.uniqueClients([...this.clients(), ...response.items])
          );
          this.nextToken.set(response.nextToken);
        },
        error: (error: unknown) => {
          this.loadMoreError.set(this.safeErrorMessage(error));
        }
      });
  }

  protected selectClient(client: ClubClient): void {
    this.detailIntents.next({ kind: 'load', client });
  }

  protected createClient(): void {
    if (!this.isConfigured || this.createLoading() || this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const value = this.createForm.getRawValue();
    const name = value.name.trim();
    const phone = value.phone.trim();
    if (!name || !phone) {
      if (!name) {
        this.createForm.controls.name.setErrors({ required: true });
      }
      if (!phone) {
        this.createForm.controls.phone.setErrors({ required: true });
      }
      this.createForm.markAllAsTouched();
      return;
    }

    this.createLoading.set(true);
    this.createError.set(null);
    this.createSuccess.set(null);

    this.clubApi
      .createClient({ name, phone })
      .pipe(
        finalize(() => this.createLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (detail) => {
          this.directoryRevision += 1;
          this.createdClientRevisions.set(detail.client.clientId, this.directoryRevision);
          this.clients.set(this.replaceClient(this.clients(), detail.client));
          this.detailIntents.next({ kind: 'resolved', detail });
          this.createForm.reset({ name: '', phone: '' });
          this.createSuccess.set('Clienta creada correctamente.');
        },
        error: (error: unknown) => {
          this.createError.set(this.safeErrorMessage(error));
        }
      });
  }

  protected registerVisit(): void {
    if (
      !this.isConfigured ||
      this.visitLoading() ||
      this.pendingVisitAttempt()
    ) {
      return;
    }

    const client = this.selectedClient();
    if (!client) {
      return;
    }

    this.visitForm.markAllAsTouched();
    if (this.visitForm.invalid) {
      return;
    }

    const value = this.visitForm.getRawValue();
    let occurredAtISO: string;
    try {
      occurredAtISO = new Date(value.occurredAtLocal).toISOString();
    } catch {
      this.visitForm.controls.occurredAtLocal.setErrors({ invalidDate: true });
      return;
    }

    const amountMXN = value.amountMXN;
    const eligibleAmountMXN = value.eligibleAmountMXN;
    if (
      typeof amountMXN !== 'number' ||
      typeof eligibleAmountMXN !== 'number' ||
      !Number.isSafeInteger(amountMXN) ||
      !Number.isSafeInteger(eligibleAmountMXN)
    ) {
      return;
    }

    const activeServiceIds = new Set(this.activeServices().map((service) => service.id));
    const serviceIds = [
      ...new Set(value.serviceIds.filter((serviceId) => activeServiceIds.has(serviceId)))
    ].slice(0, MAX_VISIT_SERVICES);
    const idempotencyKey = this.createIdempotencyKey();
    if (!idempotencyKey) {
      return;
    }

    const request = Object.freeze({
      occurredAtISO,
      amountMXN,
      eligibleAmountMXN,
      serviceIds: Object.freeze(serviceIds) as unknown as string[]
    });
    const attempt = Object.freeze({
      clientId: client.clientId,
      clientName: client.name,
      idempotencyKey,
      request
    });

    this.pendingVisitAttempt.set(attempt);
    this.visitOutcome.set(null);
    this.sendVisitAttempt(attempt);
  }

  protected retryVisit(): void {
    const attempt = this.pendingVisitAttempt();
    if (!attempt || this.visitLoading()) {
      return;
    }
    this.sendVisitAttempt(attempt);
  }

  protected editVisitAttempt(): void {
    if (this.visitLoading()) {
      return;
    }
    this.pendingVisitAttempt.set(null);
    this.visitError.set(null);
  }

  protected toggleService(serviceId: string, checked: boolean): void {
    if (this.visitLoading() || this.pendingVisitAttempt()) {
      return;
    }

    const selected = new Set(this.visitForm.controls.serviceIds.value);
    if (checked && selected.size < MAX_VISIT_SERVICES) {
      selected.add(serviceId);
    } else if (!checked) {
      selected.delete(serviceId);
    }
    this.visitForm.controls.serviceIds.setValue([...selected]);
    this.visitForm.controls.serviceIds.markAsDirty();
  }

  protected isServiceSelected(serviceId: string): boolean {
    return this.visitForm.controls.serviceIds.value.includes(serviceId);
  }

  protected serviceSelectionDisabled(serviceId: string): boolean {
    const selectedIds = this.visitForm.controls.serviceIds.value;
    return (
      this.visitLoading() ||
      this.pendingVisitAttempt() !== null ||
      (selectedIds.length >= MAX_VISIT_SERVICES && !selectedIds.includes(serviceId))
    );
  }

  protected statusLabel(client: ClubClient): string {
    return client.status === 'active' ? 'Activa' : 'Inactiva';
  }

  protected stampLabel(stamps: number): string {
    return `${stamps} ${stamps === 1 ? 'sello acumulado' : 'sellos acumulados'}`;
  }

  protected formatMXN(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  protected formatVisitDate(occurredAtISO: string): string {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(occurredAtISO));
  }

  protected stampAwardLabel(outcome: VisitOutcome): string {
    const awarded = outcome.response.loyalty.stampsAwarded === 1;
    if (outcome.response.replayed) {
      return awarded
        ? 'La visita original otorgó 1 sello.'
        : 'La visita original no otorgó sello.';
    }
    return awarded ? 'Esta visita otorgó 1 sello.' : 'Esta visita no otorgó sello.';
  }

  private sendVisitAttempt(attempt: PendingVisitAttempt): void {
    if (this.visitLoading()) {
      return;
    }

    this.visitLoading.set(true);
    this.visitError.set(null);

    this.clubApi
      .registerVisit(attempt.clientId, attempt.request, attempt.idempotencyKey)
      .pipe(
        finalize(() => this.visitLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          this.visitOutcome.set({
            clientId: attempt.clientId,
            clientName: attempt.clientName,
            response
          });
          if (this.selectedClientId() === attempt.clientId) {
            this.selectedBalance.set(response.balance);
          }
          this.pendingVisitAttempt.set(null);
          this.visitError.set(null);
          this.visitForm.reset({
            occurredAtLocal: this.localDateTimeValue(),
            amountMXN: null,
            eligibleAmountMXN: null,
            serviceIds: []
          });
        },
        error: (error: unknown) => {
          this.visitError.set(this.safeErrorMessage(error));
        }
      });
  }

  private createIdempotencyKey(): string | null {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (typeof randomUUID !== 'function') {
      this.visitError.set(
        'No fue posible crear una clave segura para registrar la visita. Intenta en un navegador compatible.'
      );
      return null;
    }

    const idempotencyKey = randomUUID.call(globalThis.crypto);
    if (!STRICT_UUID_PATTERN.test(idempotencyKey)) {
      this.visitError.set(
        'No fue posible crear una clave segura para registrar la visita. Intenta de nuevo.'
      );
      return null;
    }
    return idempotencyKey;
  }

  private localDateTimeValue(date = new Date()): string {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
  }

  private connectDetailSelection(): void {
    this.detailIntents
      .pipe(
        switchMap((intent): Observable<DetailResult> => {
          this.detailError.set(null);
          if (intent.kind === 'resolved') {
            return of({ kind: 'success', detail: intent.detail });
          }

          this.selectedClientId.set(intent.client.clientId);
          this.selectedClient.set(intent.client);
          this.selectedBalance.set(null);
          this.detailLoading.set(true);
          return this.clubApi.getClient(intent.client.clientId).pipe(
            map((detail) => ({ kind: 'success', detail }) as const),
            catchError((error: unknown) =>
              of({ kind: 'error', message: this.safeErrorMessage(error) } as const)
            )
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result) => {
        this.detailLoading.set(false);
        if (result.kind === 'error') {
          this.detailError.set(result.message);
          return;
        }

        this.selectedClientId.set(result.detail.client.clientId);
        this.selectedClient.set(result.detail.client);
        this.selectedBalance.set(result.detail.balance);
        this.clients.set(this.replaceClient(this.clients(), result.detail.client));
      });
  }

  private uniqueClients(clients: ClubClient[]): ClubClient[] {
    const seen = new Set<string>();
    return clients.filter((client) => {
      if (seen.has(client.clientId)) {
        return false;
      }
      seen.add(client.clientId);
      return true;
    });
  }

  private replaceClient(clients: ClubClient[], client: ClubClient): ClubClient[] {
    const index = clients.findIndex((item) => item.clientId === client.clientId);
    if (index === -1) {
      return [client, ...clients];
    }
    return clients.map((item) => (item.clientId === client.clientId ? client : item));
  }

  private safeErrorMessage(error: unknown): string {
    return error instanceof AdminClubApiError
      ? error.message
      : 'No fue posible procesar la solicitud del Club. Intenta de nuevo.';
  }
}
