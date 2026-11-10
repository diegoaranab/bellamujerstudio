import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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

  protected readonly isConfigured = this.clubApi.isConfigured;
  protected readonly filterControl = new FormControl('', { nonNullable: true });
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

  protected clients: ClubClient[] = [];
  protected initialLoading = false;
  protected initialError: string | null = null;
  protected nextToken: string | undefined;
  protected loadMoreLoading = false;
  protected loadMoreError: string | null = null;

  protected selectedClientId: string | null = null;
  protected selectedClient: ClubClient | null = null;
  protected selectedBalance: LoyaltyBalance | null = null;
  protected detailLoading = false;
  protected detailError: string | null = null;

  protected createLoading = false;
  protected createError: string | null = null;
  protected createSuccess: string | null = null;

  ngOnInit(): void {
    this.connectDetailSelection();
    if (this.isConfigured) {
      this.loadFirstPage();
    }
  }

  protected get filteredClients(): ClubClient[] {
    const query = this.filterControl.value.trim().toLocaleLowerCase('es-MX');
    if (!query) {
      return this.clients;
    }
    return this.clients.filter((client) =>
      `${client.name} ${client.phone}`.toLocaleLowerCase('es-MX').includes(query)
    );
  }

  protected loadFirstPage(): void {
    if (!this.isConfigured || this.initialLoading) {
      return;
    }
    this.initialLoading = true;
    this.initialError = null;
    this.loadMoreError = null;

    this.clubApi
      .listClients(50)
      .pipe(
        finalize(() => (this.initialLoading = false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          this.clients = this.uniqueClients(response.items);
          this.nextToken = response.nextToken;
        },
        error: (error: unknown) => {
          this.initialError = this.safeErrorMessage(error);
        }
      });
  }

  protected loadMore(): void {
    const token = this.nextToken;
    if (!token || this.loadMoreLoading || this.initialLoading) {
      return;
    }
    this.loadMoreLoading = true;
    this.loadMoreError = null;

    this.clubApi
      .listClients(50, token)
      .pipe(
        finalize(() => (this.loadMoreLoading = false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          this.clients = this.uniqueClients([...this.clients, ...response.items]);
          this.nextToken = response.nextToken;
        },
        error: (error: unknown) => {
          this.loadMoreError = this.safeErrorMessage(error);
        }
      });
  }

  protected selectClient(client: ClubClient): void {
    this.detailIntents.next({ kind: 'load', client });
  }

  protected createClient(): void {
    if (!this.isConfigured || this.createLoading || this.createForm.invalid) {
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
    this.createLoading = true;
    this.createError = null;
    this.createSuccess = null;

    this.clubApi
      .createClient({ name, phone })
      .pipe(
        finalize(() => (this.createLoading = false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (detail) => {
          this.clients = this.replaceClient(this.clients, detail.client);
          this.detailIntents.next({ kind: 'resolved', detail });
          this.createForm.reset({ name: '', phone: '' });
          this.createSuccess = 'Clienta creada correctamente.';
        },
        error: (error: unknown) => {
          this.createError = this.safeErrorMessage(error);
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
          this.detailError = null;
          if (intent.kind === 'resolved') {
            return of({ kind: 'success', detail: intent.detail });
          }

          this.selectedClientId = intent.client.clientId;
          this.selectedClient = intent.client;
          this.selectedBalance = null;
          this.detailLoading = true;
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
        this.detailLoading = false;
        if (result.kind === 'error') {
          this.detailError = result.message;
          return;
        }
        this.selectedClientId = result.detail.client.clientId;
        this.selectedClient = result.detail.client;
        this.selectedBalance = result.detail.balance;
        this.clients = this.replaceClient(this.clients, result.detail.client);
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
