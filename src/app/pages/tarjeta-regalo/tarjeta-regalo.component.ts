import { CurrencyPipe, NgClass, NgIf } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { GIFT_CARD_API_CONFIG } from '../../core/services/gift-card-api-config';
import { GIFT_CARD_REQUEST_DATA_ACCESS } from '../../core/services/gift-card-request.data-access';
import { GiftCardRequestError } from '../../core/services/public-gift-card-api.client';
import {
  GIFT_CARD_MIN_AMOUNT_MXN,
  GIFT_CARD_PRESET_AMOUNTS_MXN,
  buildGiftCardWhatsAppUrl,
  generateGiftCardFolio
} from '../../core/services/gift-card.utils';

@Component({
  selector: 'app-tarjeta-regalo',
  imports: [
    CurrencyPipe,
    NgClass,
    NgIf,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule
  ],
  templateUrl: './tarjeta-regalo.component.html',
  styleUrl: './tarjeta-regalo.component.scss'
})
export class TarjetaRegaloComponent {
  private readonly giftCardRequests = inject(GIFT_CARD_REQUEST_DATA_ACCESS);
  readonly dataMode = inject(GIFT_CARD_API_CONFIG).mode;

  readonly presetAmounts = GIFT_CARD_PRESET_AMOUNTS_MXN;
  readonly minAmount = GIFT_CARD_MIN_AMOUNT_MXN;
  readonly previewFolio = signal(generateGiftCardFolio());
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly isSubmitting = signal(false);

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
    message: new FormControl('', { nonNullable: true }),
    amountMXN: new FormControl(500, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(GIFT_CARD_MIN_AMOUNT_MXN)]
    })
  });

  previewRecipient(): string {
    return this.form.controls.recipientName.value.trim() || 'Para alguien especial';
  }

  previewBuyer(): string {
    return this.form.controls.buyerName.value.trim() || 'Con cariño';
  }

  previewMessage(): string {
    return (
      this.form.controls.message.value.trim() ||
      'Un momento para consentirte en Bella Mujer Studio.'
    );
  }

  selectPresetAmount(amount: number): void {
    this.form.controls.amountMXN.setValue(amount);
    this.form.controls.amountMXN.markAsDirty();
  }

  isSelectedAmount(amount: number): boolean {
    return this.form.controls.amountMXN.value === amount;
  }

  onSubmit(): void {
    this.successMessage.set('');
    this.errorMessage.set('');

    if (this.isSubmitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.isSubmitting.set(true);
    this.giftCardRequests.createRequest({
      buyerName: value.buyerName.trim(),
      buyerPhone: value.buyerPhone.trim(),
      buyerEmail: this.optionalText(value.buyerEmail),
      recipientName: value.recipientName.trim(),
      recipientPhone: this.optionalText(value.recipientPhone),
      amountMXN: value.amountMXN,
      message: this.optionalText(value.message)
    }).subscribe({
      next: (giftCard) => {
        window.open(buildGiftCardWhatsAppUrl(giftCard), '_blank', 'noopener');
        this.previewFolio.set(giftCard.folio);
        this.successMessage.set(
          'Se abrió WhatsApp con tu mensaje. Adjunta manualmente tu comprobante antes de enviarlo.'
        );
        this.isSubmitting.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(error instanceof GiftCardRequestError
          ? error.message
          : 'No pudimos crear la solicitud. Intenta de nuevo.');
        this.isSubmitting.set(false);
      }
    });
  }

  private optionalText(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
}
