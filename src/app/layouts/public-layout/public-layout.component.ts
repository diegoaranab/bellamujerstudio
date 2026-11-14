import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { buildBellaMujerWhatsAppUrl } from '../../core/constants/contact.constants';
import { NavigationFocusService } from '../../core/services/navigation-focus.service';

@Component({
  selector: 'app-public-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss'
})
export class PublicLayoutComponent {
  constructor(private readonly navigationFocus: NavigationFocusService) {}

  protected readonly whatsappUrl = buildBellaMujerWhatsAppUrl(
    'Hola Bella Mujer Studio, quiero pedir información para agendar una cita.'
  );

  protected skipToMain(): void {
    this.navigationFocus.focusMain('public-main');
  }
}
