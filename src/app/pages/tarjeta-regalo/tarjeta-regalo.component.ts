import { CurrencyPipe, NgClass, NgIf } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
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

const wholePesoAmount: ValidatorFn = (control) =>
  Number.isInteger(control.value) ? null : { wholePeso: true };

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
  readonly whatsappFallbackUrl = signal('');
  readonly errorMessage = signal('');
  readonly isSubmitting = signal(false);
  private pendingApiRequest?: { body: string; key: string };

  readonly form = new FormGroup({
    buyerName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)]
    }),
    buyerPhone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(30)]
    }),
    buyerEmail: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(160)]
    }),
    recipientName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)]
    }),
    recipientPhone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(30)] }),
    message: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    amountMXN: new FormControl(500, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(GIFT_CARD_MIN_AMOUNT_MXN), wholePesoAmount]
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
    if (this.isSubmitting()) return;

    this.successMessage.set('');
    this.whatsappFallbackUrl.set('');
    this.errorMessage.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Open while the submit gesture still has transient user activation.
    const whatsappWindow = window.open('', '_blank');
    if (!whatsappWindow) {
      this.errorMessage.set('Permite las ventanas emergentes para abrir WhatsApp e intenta de nuevo.');
      return;
    }
    whatsappWindow.opener = null;

    const value = this.form.getRawValue();
    this.isSubmitting.set(true);
    const request = {
      buyerName: value.buyerName.trim(),
      buyerPhone: value.buyerPhone.trim(),
      buyerEmail: this.optionalText(value.buyerEmail),
      recipientName: value.recipientName.trim(),
      recipientPhone: this.optionalText(value.recipientPhone),
      amountMXN: value.amountMXN,
      message: this.optionalText(value.message)
    };
    const body = JSON.stringify(request);
    if (this.dataMode === 'api' && this.pendingApiRequest?.body !== body) {
      this.pendingApiRequest = { body, key: crypto.randomUUID() };
    }
    this.giftCardRequests.createRequest(request, this.pendingApiRequest?.key).subscribe({
      next: (giftCard) => {
        this.pendingApiRequest = undefined;
        const whatsappUrl = buildGiftCardWhatsAppUrl(giftCard);
        let whatsappOpened = false;
        try {
          if (!whatsappWindow.closed) {
            whatsappWindow.location.replace(whatsappUrl);
            whatsappOpened = true;
          }
        } catch {
          whatsappWindow.close();
        }
        this.previewFolio.set(giftCard.folio);
        this.whatsappFallbackUrl.set(whatsappOpened ? '' : whatsappUrl);
        this.successMessage.set(whatsappOpened
          ? 'Se abrió WhatsApp con tu mensaje. Adjunta manualmente tu comprobante antes de enviarlo.'
          : 'Solicitud creada. Abre WhatsApp con el enlace de abajo y adjunta manualmente tu comprobante.');
        this.isSubmitting.set(false);
      },
      error: (error: unknown) => {
        if (error instanceof GiftCardRequestError &&
          (error.kind === 'validation' || error.kind === 'client' || error.kind === 'configuration')) {
          this.pendingApiRequest = undefined;
        }
        whatsappWindow.close();
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
