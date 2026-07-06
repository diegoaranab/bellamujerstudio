import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { buildBellaMujerWhatsAppUrl } from '../../core/constants/contact.constants';

@Component({
  selector: 'app-public-layout',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss'
})
export class PublicLayoutComponent {
  protected readonly whatsappUrl = buildBellaMujerWhatsAppUrl(
    'Hola Bella Mujer Studio, quiero pedir información para agendar una cita.'
  );
}
