import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { GIFT_CARD_WHATSAPP_NUMBER } from '../../core/services/gift-card.utils';

@Component({
  selector: 'app-public-home',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './public-home.component.html',
  styleUrl: './public-home.component.scss'
})
export class PublicHomeComponent {
  protected readonly whatsappUrl = `https://wa.me/${GIFT_CARD_WHATSAPP_NUMBER}`;
}
