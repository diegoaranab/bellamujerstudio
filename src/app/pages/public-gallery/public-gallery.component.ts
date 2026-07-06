import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { buildBellaMujerWhatsAppUrl } from '../../core/constants/contact.constants';

interface GalleryImage {
  src: string;
  alt: string;
  category: string;
  title: string;
  width: number;
  height: number;
}

interface GalleryGuidanceItem {
  title: string;
  description: string;
}

@Component({
  selector: 'app-public-gallery',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './public-gallery.component.html',
  styleUrl: './public-gallery.component.scss'
})
export class PublicGalleryComponent {
  protected readonly whatsappUrl = buildBellaMujerWhatsAppUrl(
    'Hola Bella Mujer Studio, vi la galería y quiero información para agendar una cita.'
  );

  protected readonly categoryLabels = [
    'Uñas',
    'Pestañas',
    'Maquillaje',
    'Peinado',
    'Cejas',
    'Cabello'
  ];

  protected readonly galleryImages: readonly GalleryImage[] = [
    {
      src: 'assets/gallery/maquillaje-peinado-glam-01.webp',
      alt: 'Maquillaje glam con peinado de ondas realizado en Bella Mujer Studio Tehuacán.',
      category: 'Maquillaje y peinado',
      title: 'Glam completo para evento',
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/cabello-ondas-largas-01.webp',
      alt: 'Cabello largo con ondas suaves visto de espalda en Bella Mujer Studio Tehuacán.',
      category: 'Cabello',
      title: 'Ondas largas con movimiento',
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/pestanas-efecto-natural-01.webp',
      alt: 'Pestañas con efecto natural aplicadas en Bella Mujer Studio Tehuacán.',
      category: 'Pestañas',
      title: 'Mirada natural definida',
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/unas-coloridas-acrilico-01.webp',
      alt: 'Uñas acrílicas coloridas con acabado brillante realizadas en Bella Mujer Studio Tehuacán.',
      category: 'Uñas',
      title: 'Uñas coloridas en acrílico',
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/maquillaje-social-glam-01.webp',
      alt: 'Maquillaje social glam con acabado luminoso en Bella Mujer Studio Tehuacán.',
      category: 'Maquillaje',
      title: 'Maquillaje social luminoso',
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/peinado-evento-ondas-01.webp',
      alt: 'Peinado para evento con ondas definidas realizado en Bella Mujer Studio Tehuacán.',
      category: 'Peinado',
      title: 'Peinado con ondas para evento',
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/cejas-diseno-laminado-01.webp',
      alt: 'Diseño de cejas con acabado cuidado en Bella Mujer Studio Tehuacán.',
      category: 'Cejas',
      title: 'Diseño de cejas cuidado',
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/cabello-corte-peinado-01.webp',
      alt: 'Corte y peinado de cabello largo realizado en Bella Mujer Studio Tehuacán.',
      category: 'Cabello',
      title: 'Corte y peinado pulido',
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/cabello-alisado-tratamiento-01.webp',
      alt: 'Cabello lacio y brillante después de alisado en Bella Mujer Studio Tehuacán.',
      category: 'Cabello',
      title: 'Alisado y tratamiento',
      width: 576,
      height: 1024
    }
  ];

  protected readonly guidanceItems: readonly GalleryGuidanceItem[] = [
    {
      title: 'Envía tu referencia',
      description:
        'Puedes mandar por WhatsApp una captura o el nombre del trabajo de la galería que te gustó.'
    },
    {
      title: 'Confirmamos por mensaje',
      description:
        'La disponibilidad, el tiempo aproximado y la cotización se revisan antes de apartar tu cita.'
    },
    {
      title: 'Cabello y color',
      description:
        'Para servicios de cabello o color, pueden solicitarse fotos actuales y referencias para orientarte mejor.'
    },
    {
      title: 'Eventos con anticipación',
      description:
        'Maquillaje y peinado para evento se recomiendan agendar con tiempo para revisar horario y preparación.'
    }
  ];
}
