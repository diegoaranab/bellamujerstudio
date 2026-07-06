import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import {
  BELLA_MUJER_LOCATION_LABEL,
  buildBellaMujerWhatsAppUrl
} from '../../core/constants/contact.constants';

interface ContactOption {
  icon: string;
  title: string;
  label: string;
  description: string;
}

interface SendGuidance {
  title: string;
  description: string;
}

@Component({
  selector: 'app-public-contact',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './public-contact.component.html',
  styleUrl: './public-contact.component.scss'
})
export class PublicContactComponent {
  protected readonly locationLabel = BELLA_MUJER_LOCATION_LABEL;
  protected readonly whatsappUrl = buildBellaMujerWhatsAppUrl(
    'Hola Bella Mujer Studio, quiero información para agendar una cita.'
  );

  protected readonly contactOptions: readonly ContactOption[] = [
    {
      icon: 'chat',
      title: 'WhatsApp',
      label: 'WhatsApp principal',
      description:
        'Escríbenos para resolver dudas, revisar disponibilidad, compartir referencias y confirmar tu cita.'
    },
    {
      icon: 'location_on',
      title: 'Ubicación',
      label: this.locationLabel,
      description:
        'Atendemos en Tehuacán, Puebla. La ubicación exacta se comparte al confirmar la cita por mensaje.'
    },
    {
      icon: 'event_available',
      title: 'Citas',
      label: 'Atención con cita previa',
      description:
        'Servicio, disponibilidad, tiempo y cotización se confirman por WhatsApp. Algunas fechas o servicios pueden requerir anticipo para apartar espacio.'
    }
  ];

  protected readonly sendGuidance: readonly SendGuidance[] = [
    {
      title: 'Servicio',
      description: 'Cuéntanos qué servicio quieres y si buscas algún acabado o estilo especial.'
    },
    {
      title: 'Fecha y hora tentativa',
      description: 'Compártenos la fecha y hora tentativa para revisar disponibilidad.'
    },
    {
      title: 'Fotos de referencia',
      description: 'Envía referencias visuales para entender mejor el resultado que tienes en mente.'
    },
    {
      title: 'Cabello / color',
      description:
        'Para cabello o color, manda fotos actuales de tu cabello con luz natural y la referencia deseada.'
    },
    {
      title: 'Eventos',
      description:
        'Para maquillaje o peinado, incluye fecha, hora, tipo de evento y referencias del estilo.'
    },
    {
      title: 'Uñas, pestañas o cejas',
      description: 'Comparte una referencia o describe el estilo, efecto, largo o diseño que prefieres.'
    }
  ];
}
