import { AsyncPipe, CurrencyPipe, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { combineLatest, finalize, map, startWith, take } from 'rxjs';

import { GiftCard, GiftCardPaymentMethod, GiftCardStatus } from '../../core/models';
import {
  AdminGiftCardApiClient,
  AdminGiftCardApiError,
  AdminGiftCardUpdate
} from '../../core/services/admin-gift-card-api.client';
import { GiftCardService } from '../../core/services/gift-card.service';
import {
  GIFT_CARD_MIN_AMOUNT_MXN,
  GIFT_CARD_STATUS_FILTER_OPTIONS,
  GIFT_CARD_STATUS_OPTIONS,
  GiftCardStatusFilter,
  buildGiftCardBuyerWhatsAppUrl,
  buildGiftCardClientConfirmationMessage,
  filterGiftCards,
  giftCardStatusFilterLabel,
  giftCardStatusLabel
} from '../../core/services/gift-card.utils';

@Component({
  selector: 'app-tarjetas-regalo',
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    NgClass,
    NgFor,
    NgIf,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatSnackBarModule
  ],
  templateUrl: './tarjetas-regalo.component.html',
  styleUrl: './tarjetas-regalo.component.scss'
})
export class TarjetasRegaloComponent implements OnInit {
  private readonly giftCardService = inject(GiftCardService);
  private readonly adminGiftCardApi = inject(AdminGiftCardApiClient);
  private readonly snackBar = inject(MatSnackBar);

  readonly giftCards$ = this.giftCardService.giftCards$;
  readonly summary$ = this.giftCardService.summary$;
  readonly statusOptions = GIFT_CARD_STATUS_OPTIONS;
  readonly statusFilterOptions = GIFT_CARD_STATUS_FILTER_OPTIONS;
  readonly paymentMethods: GiftCardPaymentMethod[] = [
    'transferencia',
    'efectivo',
    'tarjeta',
    'otro'
  ];
  readonly remoteConfigured = this.adminGiftCardApi.isConfigured;
  readonly remoteGiftCards = signal<GiftCard[]>([]);
  readonly remoteLoading = signal(false);
  readonly remoteError = signal<string | null>(null);
  readonly remoteNextToken = signal<string | null>(null);
  readonly remoteSavingIds = signal<ReadonlySet<string>>(new Set());
  readonly remoteNotesDrafts = signal<Record<string, string>>({});

  readonly form = new FormGroup({
    buyerName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    buyerPhone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    buyerEmail: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email]
    }),
    recipientName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    recipientPhone: new FormControl('', { nonNullable: true }),
    amountMXN: new FormControl(500, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(GIFT_CARD_MIN_AMOUNT_MXN)]
    }),
    message: new FormControl('', { nonNullable: true }),
    status: new FormControl<GiftCardStatus>('pendiente', { nonNullable: true }),
    paymentMethod: new FormControl<GiftCardPaymentMethod>('transferencia', {
      nonNullable: true
    }),
    notes: new FormControl('', { nonNullable: true })
  });

  readonly filters = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    status: new FormControl<GiftCardStatusFilter>('todas', { nonNullable: true })
  });

  readonly filteredGiftCards$ = combineLatest([
    this.giftCards$,
    this.filters.controls.query.valueChanges.pipe(
      startWith(this.filters.controls.query.value)
    ),
    this.filters.controls.status.valueChanges.pipe(
      startWith(this.filters.controls.status.value)
    )
  ]).pipe(
    map(([giftCards, query, status]) =>
      filterGiftCards(giftCards, {
        query,
        status
      })
    )
  );

  ngOnInit(): void {
    if (this.remoteConfigured) {
      this.loadRemotePage();
    }
  }

  loadMoreRemote(): void {
    const nextToken = this.remoteNextToken();
    if (nextToken) {
      this.loadRemotePage(nextToken);
    }
  }

  retryRemote(): void {
    this.loadRemotePage(
      this.remoteGiftCards().length > 0 ? this.remoteNextToken() ?? undefined : undefined
    );
  }

  statusLabel(status: GiftCardStatus): string {
    return giftCardStatusLabel(status);
  }

  statusFilterLabel(status: GiftCardStatusFilter): string {
    return giftCardStatusFilterLabel(status);
  }

  paymentLabel(method: GiftCardPaymentMethod): string {
    const labels: Record<GiftCardPaymentMethod, string> = {
      transferencia: 'Transferencia',
      efectivo: 'Efectivo',
      tarjeta: 'Tarjeta',
      otro: 'Otro'
    };
    return labels[method];
  }

  onCreate(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.giftCardService.createGiftCard({
      buyerName: value.buyerName.trim(),
      buyerPhone: value.buyerPhone.trim(),
      buyerEmail: this.optionalText(value.buyerEmail),
      recipientName: value.recipientName.trim(),
      recipientPhone: this.optionalText(value.recipientPhone),
      amountMXN: value.amountMXN,
      message: this.optionalText(value.message),
      paymentMethod: value.paymentMethod,
      status: value.status,
      notes: this.optionalText(value.notes)
    });

    this.form.reset({
      buyerName: '',
      buyerPhone: '',
      buyerEmail: '',
      recipientName: '',
      recipientPhone: '',
      amountMXN: 500,
      message: '',
      status: 'pendiente',
      paymentMethod: 'transferencia',
      notes: ''
    });
  }

  onStatusChange(id: string, event: MatSelectChange): void {
    this.giftCardService.updateStatus(id, event.value as GiftCardStatus);
  }

  onNotesBlur(id: string, event: Event): void {
    const notes = (event.target as HTMLTextAreaElement).value;
    this.giftCardService.updateNotes(id, notes);
  }

  isRemoteSaving(id: string): boolean {
    return this.remoteSavingIds().has(id);
  }

  remoteNotesDraft(giftCard: GiftCard): string {
    return this.remoteNotesDrafts()[giftCard.id] ?? giftCard.notes ?? '';
  }

  onRemoteNotesInput(id: string, event: Event): void {
    const notes = (event.target as HTMLTextAreaElement).value;
    this.remoteNotesDrafts.update((drafts) => ({ ...drafts, [id]: notes }));
  }

  onRemoteStatusChange(giftCard: GiftCard, event: MatSelectChange): void {
    if (this.isRemoteSaving(giftCard.id)) {
      return;
    }

    const status = event.value as GiftCardStatus;
    if (status === giftCard.status) {
      return;
    }

    event.source?.writeValue(giftCard.status);
    this.updateRemoteGiftCard(giftCard.id, { status }, 'Estatus actualizado.');
  }

  saveRemoteNotes(giftCard: GiftCard): void {
    if (this.isRemoteSaving(giftCard.id)) {
      return;
    }

    this.updateRemoteGiftCard(
      giftCard.id,
      { notes: this.remoteNotesDraft(giftCard) },
      'Notas guardadas.'
    );
  }

  copyFolio(giftCard: GiftCard): void {
    void this.copyText(giftCard.folio, 'Folio copiado.');
  }

  copyClientMessage(giftCard: GiftCard): void {
    void this.copyText(
      buildGiftCardClientConfirmationMessage(giftCard),
      'Mensaje para cliente copiado.'
    );
  }

  openBuyerWhatsApp(giftCard: GiftCard): void {
    window.open(buildGiftCardBuyerWhatsAppUrl(giftCard), '_blank', 'noopener');
  }

  private loadRemotePage(nextToken?: string): void {
    if (this.remoteLoading()) {
      return;
    }

    this.remoteLoading.set(true);
    this.remoteError.set(null);

    this.adminGiftCardApi
      .listGiftCards(50, nextToken)
      .pipe(
        take(1),
        finalize(() => this.remoteLoading.set(false))
      )
      .subscribe({
        next: (response) => {
          this.remoteGiftCards.update((current) =>
            nextToken
              ? this.appendUniqueGiftCards(current, response.items)
              : [...response.items]
          );
          this.initializeRemoteNotesDrafts(response.items);
          this.remoteNextToken.set(response.nextToken ?? null);
        },
        error: (error: unknown) => {
          this.remoteError.set(
            error instanceof AdminGiftCardApiError
              ? error.message
              : 'No fue posible consultar las solicitudes en línea. Intenta de nuevo.'
          );
        }
      });
  }

  private updateRemoteGiftCard(
    id: string,
    update: AdminGiftCardUpdate,
    successMessage: string
  ): void {
    if (this.isRemoteSaving(id)) {
      return;
    }

    this.remoteSavingIds.update((ids) => new Set(ids).add(id));
    this.adminGiftCardApi
      .updateGiftCard(id, update)
      .pipe(
        take(1),
        finalize(() => {
          this.remoteSavingIds.update((ids) => {
            const next = new Set(ids);
            next.delete(id);
            return next;
          });
        })
      )
      .subscribe({
        next: (updatedGiftCard) => {
          let replaced = false;
          this.remoteGiftCards.update((current) =>
            current.map((giftCard) => {
              if (giftCard.id !== id) {
                return giftCard;
              }
              replaced = true;
              return updatedGiftCard;
            })
          );

          if (!replaced) {
            this.snackBar.open('No fue posible reflejar los cambios en la lista.', 'Cerrar', {
              duration: 3500
            });
            return;
          }

          this.remoteNotesDrafts.update((drafts) => ({
            ...drafts,
            [id]: updatedGiftCard.notes ?? ''
          }));
          this.snackBar.open(successMessage, 'Cerrar', { duration: 2500 });
        },
        error: (error: unknown) => {
          this.snackBar.open(
            error instanceof AdminGiftCardApiError
              ? error.message
              : 'No fue posible guardar los cambios. Intenta de nuevo.',
            'Cerrar',
            { duration: 3500 }
          );
        }
      });
  }

  private initializeRemoteNotesDrafts(giftCards: GiftCard[]): void {
    this.remoteNotesDrafts.update((drafts) => {
      const next = { ...drafts };
      for (const giftCard of giftCards) {
        if (!(giftCard.id in next)) {
          next[giftCard.id] = giftCard.notes ?? '';
        }
      }
      return next;
    });
  }

  private appendUniqueGiftCards(current: GiftCard[], incoming: GiftCard[]): GiftCard[] {
    const existingIds = new Set(current.map((giftCard) => giftCard.id));
    return [
      ...current,
      ...incoming.filter((giftCard) => {
        if (existingIds.has(giftCard.id)) {
          return false;
        }
        existingIds.add(giftCard.id);
        return true;
      })
    ];
  }

  private optionalText(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private async copyText(text: string, successMessage: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        this.copyTextWithFallback(text);
      }

      this.snackBar.open(successMessage, 'Cerrar', { duration: 2500 });
    } catch {
      this.snackBar.open('No se pudo copiar automáticamente.', 'Cerrar', {
        duration: 3000
      });
    }
  }

  private copyTextWithFallback(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}
