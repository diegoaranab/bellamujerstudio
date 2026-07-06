import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { buildBellaMujerWhatsAppUrl } from '../../core/constants/contact.constants';

interface PublicServiceCategory {
  title: string;
  description: string;
  guidance: string;
  note: string;
  image?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
}

interface ServiceGuidanceItem {
  title: string;
  description: string;
}

@Component({
  selector: 'app-public-services',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './public-services.component.html',
  styleUrl: './public-services.component.scss'
})
export class PublicServicesComponent {
  protected readonly whatsappUrl = buildBellaMujerWhatsAppUrl(
    'Hola Bella Mujer Studio, quiero información para agendar un servicio.'
  );

  protected readonly serviceCategories: readonly PublicServiceCategory[] = [
    {
      title: 'Uñas',
      description:
        'Manicure, aplicación y diseño para un acabado limpio, femenino y acorde a tu estilo.',
      guidance: 'Envía una referencia del diseño, largo y colores que tienes en mente.',
      note: 'Diseño a confirmar',
      image: {
        src: 'assets/gallery/unas-coloridas-acrilico-01.webp',
        alt: 'Uñas coloridas con acabado brillante realizadas en Bella Mujer Studio.',
        width: 1200,
        height: 1600
      }
    },
    {
      title: 'Pestañas',
      description:
        'Servicios para definir la mirada con un resultado natural o más marcado según lo que buscas.',
      guidance: 'Cuéntanos si prefieres un efecto natural, volumen suave o retoque.',
      note: 'Valoración según servicio',
      image: {
        src: 'assets/gallery/pestanas-efecto-natural-01.webp',
        alt: 'Pestañas con efecto natural realizadas en Bella Mujer Studio.',
        width: 1200,
        height: 1600
      }
    },
    {
      title: 'Maquillaje y peinado',
      description:
        'Preparación para eventos, sesiones, graduaciones o fechas especiales con atención al look completo.',
      guidance: 'Comparte fecha, hora del evento, tipo de ocasión y referencias del estilo.',
      note: 'Agenda con anticipación',
      image: {
        src: 'assets/gallery/maquillaje-peinado-glam-01.webp',
        alt: 'Maquillaje glam con peinado de ondas realizado en Bella Mujer Studio.',
        width: 1200,
        height: 1600
      }
    },
    {
      title: 'Cejas',
      description:
        'Diseño y mantenimiento para enmarcar tu rostro con un acabado cuidado y natural.',
      guidance: 'Indica si buscas diseño, limpieza, laminado o mantenimiento.',
      note: 'Atención personalizada',
      image: {
        src: 'assets/gallery/cejas-diseno-laminado-01.webp',
        alt: 'Diseño de cejas con acabado natural en Bella Mujer Studio.',
        width: 1200,
        height: 1600
      }
    },
    {
      title: 'Cabello / color',
      description:
        'Cambios de look, color y servicios de cabello que se revisan antes de confirmar tiempo y cotización.',
      guidance: 'Envía fotos actuales de tu cabello con luz natural y referencias del resultado deseado.',
      note: 'Cotización previa',
      image: {
        src: 'assets/gallery/cabello-ondas-largas-01.webp',
        alt: 'Cabello largo con ondas realizado en Bella Mujer Studio.',
        width: 1200,
        height: 1600
      }
    },
    {
      title: 'Faciales / spa',
      description:
        'Opciones suaves de cuidado personal para consentirte y salir con una sensación renovada.',
      guidance: 'Pregunta por disponibilidad y comparte si buscas relajación o cuidado facial general.',
      note: 'Pregunta disponibilidad'
    }
  ];

  protected readonly guidanceItems: readonly ServiceGuidanceItem[] = [
    {
      title: 'Precios y disponibilidad',
      description:
        'Los precios, tiempos y horarios disponibles se confirman por WhatsApp antes de apartar tu cita.'
    },
    {
      title: 'Cabello y color',
      description:
        'Para servicios de cabello o color, envía fotos actuales y referencias para revisar diagnóstico y cotización previa.'
    },
    {
      title: 'Eventos',
      description:
        'Maquillaje y peinado para eventos se agenda con anticipación para coordinar horario, estilo y preparación.'
    },
    {
      title: 'Confirmación de cita',
      description:
        'Algunas fechas o servicios pueden requerir anticipo para apartar espacio; te lo confirmamos con claridad por WhatsApp.'
    }
  ];

  protected scrollToGuidance(): void {
    document.getElementById('como-agendar')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
}
