import { CurrencyPipe, DOCUMENT, NgClass, NgIf } from '@angular/common';
import { Component, Injector, afterNextRender, inject, signal } from '@angular/core';
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

type GiftCardControlName =
  | 'buyerName'
  | 'buyerPhone'
  | 'buyerEmail'
  | 'recipientName'
  | 'recipientPhone'
  | 'message'
  | 'amountMXN';

interface ValidationSummaryItem {
  fieldId: string;
  message: string;
}

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
  private readonly document = inject(DOCUMENT);
  private readonly giftCardRequests = inject(GIFT_CARD_REQUEST_DATA_ACCESS);
  private readonly injector = inject(Injector);
  readonly dataMode = inject(GIFT_CARD_API_CONFIG).mode;

  readonly presetAmounts = GIFT_CARD_PRESET_AMOUNTS_MXN;
  readonly minAmount = GIFT_CARD_MIN_AMOUNT_MXN;
  readonly previewFolio = signal(generateGiftCardFolio());
  readonly successMessage = signal('');
  readonly whatsappFallbackUrl = signal('');
  readonly errorMessage = signal('');
  readonly isSubmitting = signal(false);
  readonly validationSummaryVisible = signal(false);
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

  validationSummaryItems(): ValidationSummaryItem[] {
    const fields: Array<{ name: GiftCardControlName; fieldId: string }> = [
      { name: 'buyerName', fieldId: 'buyer-name' },
      { name: 'buyerPhone', fieldId: 'buyer-phone' },
      { name: 'buyerEmail', fieldId: 'buyer-email' },
      { name: 'recipientName', fieldId: 'recipient-name' },
      { name: 'recipientPhone', fieldId: 'recipient-phone' },
      { name: 'message', fieldId: 'gift-message' },
      { name: 'amountMXN', fieldId: 'gift-amount' }
    ];

    return fields.flatMap(({ name, fieldId }) => {
      const control = this.form.controls[name];
      const message = this.validationMessage(name, control.errors);
      return message ? [{ fieldId, message }] : [];
    });
  }

  focusInvalidField(event: Event, fieldId: string): void {
    event.preventDefault();
    const field = this.document.getElementById(fieldId) as HTMLElement | null;
    if (!field) return;

    field.scrollIntoView({ block: 'center' });
    field.focus({ preventScroll: true });
  }

  onSubmit(): void {
    if (this.isSubmitting()) return;

    this.successMessage.set('');
    this.whatsappFallbackUrl.set('');
    this.errorMessage.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.validationSummaryVisible.set(true);
      afterNextRender(() => {
        this.document.getElementById('gift-card-validation-summary')?.focus();
      }, { injector: this.injector });
      return;
    }

    this.validationSummaryVisible.set(false);

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

  private validationMessage(
    name: GiftCardControlName,
    errors: Record<string, unknown> | null
  ): string | null {
    if (!errors) return null;
    if (errors['required']) {
      const requiredMessages: Partial<Record<GiftCardControlName, string>> = {
        buyerName: 'Este nombre es obligatorio.',
        buyerPhone: 'El WhatsApp es obligatorio.',
        recipientName: 'Este nombre es obligatorio.',
        amountMXN: 'El monto es obligatorio.'
      };
      return requiredMessages[name] ?? null;
    }
    if (errors['email']) return 'Escribe un email válido.';
    if (errors['min']) return 'El monto mínimo es de $300 MXN.';
    if (errors['wholePeso']) return 'Ingresa un monto en pesos enteros, sin centavos.';
    if (errors['maxlength']) {
      return {
        buyerName: 'El nombre de quien regala no puede superar 120 caracteres.',
        buyerPhone: 'El WhatsApp de quien regala no puede superar 30 caracteres.',
        buyerEmail: 'El email no puede superar 160 caracteres.',
        recipientName: 'El nombre de quien recibe no puede superar 120 caracteres.',
        recipientPhone: 'El WhatsApp de quien recibe no puede superar 30 caracteres.',
        message: 'El mensaje no puede superar 500 caracteres.',
        amountMXN: ''
      }[name] || null;
    }
    return null;
  }
}
