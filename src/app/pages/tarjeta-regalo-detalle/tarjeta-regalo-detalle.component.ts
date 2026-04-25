import { AsyncPipe, CurrencyPipe, DatePipe, NgClass, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, map } from 'rxjs';

import { GiftCard, GiftCardPaymentMethod, GiftCardStatus } from '../../core/models';
import { GiftCardService } from '../../core/services/gift-card.service';
import {
  buildGiftCardBuyerWhatsAppUrl,
  buildGiftCardClientConfirmationMessage,
  giftCardStatusLabel
} from '../../core/services/gift-card.utils';

@Component({
  selector: 'app-tarjeta-regalo-detalle',
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    NgClass,
    NgIf,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './tarjeta-regalo-detalle.component.html',
  styleUrl: './tarjeta-regalo-detalle.component.scss'
})
export class TarjetaRegaloDetalleComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly giftCardService = inject(GiftCardService);
  private readonly snackBar = inject(MatSnackBar);

  readonly giftCard$ = combineLatest([
    this.route.paramMap,
    this.giftCardService.giftCards$
  ]).pipe(
    map(([params, giftCards]) => {
      const id = params.get('id');
      return giftCards.find((giftCard) => giftCard.id === id) ?? null;
    })
  );

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

  print(): void {
    window.print();
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
