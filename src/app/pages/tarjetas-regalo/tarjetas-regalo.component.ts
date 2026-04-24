import { AsyncPipe, CurrencyPipe, DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
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
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';

import { GiftCardPaymentMethod, GiftCardStatus } from '../../core/models';
import { GiftCardService } from '../../core/services/gift-card.service';
import {
  GIFT_CARD_MIN_AMOUNT_MXN,
  GIFT_CARD_STATUS_OPTIONS,
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
    MatSelectModule
  ],
  templateUrl: './tarjetas-regalo.component.html',
  styleUrl: './tarjetas-regalo.component.scss'
})
export class TarjetasRegaloComponent {
  private readonly giftCardService = inject(GiftCardService);

  readonly giftCards$ = this.giftCardService.giftCards$;
  readonly summary$ = this.giftCardService.summary$;
  readonly statusOptions = GIFT_CARD_STATUS_OPTIONS;
  readonly paymentMethods: GiftCardPaymentMethod[] = [
    'transferencia',
    'efectivo',
    'tarjeta',
    'otro'
  ];

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

  statusLabel(status: GiftCardStatus): string {
    return giftCardStatusLabel(status);
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

  private optionalText(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
}
