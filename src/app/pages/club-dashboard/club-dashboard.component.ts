import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, Subject, catchError, finalize, map, of, switchMap } from 'rxjs';

import { ClubClient, LoyaltyBalance } from '../../core/models';
import {
  AdminClubApiClient,
  AdminClubApiError,
  AdminClubClientDetailResponse
} from '../../core/services/admin-club-api.client';

type DetailIntent =
  | { kind: 'load'; client: ClubClient }
  | { kind: 'resolved'; detail: AdminClubClientDetailResponse };

type DetailResult =
  | { kind: 'success'; detail: AdminClubClientDetailResponse }
  | { kind: 'error'; message: string };

@Component({
  selector: 'app-club-dashboard',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
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
