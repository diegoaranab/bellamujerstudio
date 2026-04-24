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

import { GiftCardService } from '../../core/services/gift-card.service';
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
  private readonly giftCardService = inject(GiftCardService);

  readonly presetAmounts = GIFT_CARD_PRESET_AMOUNTS_MXN;
  readonly minAmount = GIFT_CARD_MIN_AMOUNT_MXN;
  readonly previewFolio = signal(generateGiftCardFolio());
  readonly successMessage = signal('');

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
    return this.form.controls.recipientName.value.trim() || 'Para mamá';
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

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const giftCard = this.giftCardService.createGiftCard({
      buyerName: value.buyerName.trim(),
      buyerPhone: value.buyerPhone.trim(),
      buyerEmail: this.optionalText(value.buyerEmail),
      recipientName: value.recipientName.trim(),
      recipientPhone: this.optionalText(value.recipientPhone),
      amountMXN: value.amountMXN,
      message: this.optionalText(value.message),
      paymentMethod: 'transferencia',
      status: 'pendiente'
    });

    window.open(buildGiftCardWhatsAppUrl(giftCard), '_blank', 'noopener');
    this.previewFolio.set(giftCard.folio);
    this.successMessage.set(
      'Se abrió WhatsApp con tu mensaje. Recuerda adjuntar tu comprobante antes de enviarlo.'
    );
  }

  private optionalText(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
}
