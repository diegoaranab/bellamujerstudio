import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { buildBellaMujerWhatsAppUrl } from '../../core/constants/contact.constants';

interface HomeService {
  title: string;
  description: string;
  note: string;
  accentImage?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
}

interface PublicGalleryImage {
  src: string;
  alt: string;
  category: string;
  title: string;
  featured: boolean;
  hero?: boolean;
  width: number;
  height: number;
}

interface WhyItem {
  title: string;
  description: string;
}

interface BookingStep {
  title: string;
  description: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-public-home',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './public-home.component.html',
  styleUrl: './public-home.component.scss'
})
export class PublicHomeComponent {
  protected readonly galleryImages: readonly PublicGalleryImage[] = [
    {
      src: 'assets/gallery/maquillaje-peinado-glam-01.webp',
      alt: 'Maquillaje glam y peinado con ondas realizado en Bella Mujer Studio Tehuacán.',
      category: 'Maquillaje y peinado',
      title: 'Glam completo para evento',
      featured: true,
      hero: true,
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/cabello-ondas-largas-01.webp',
      alt: 'Peinado con ondas largas visto de espalda en Bella Mujer Studio Tehuacán.',
      category: 'Cabello',
      title: 'Ondas largas con movimiento',
      featured: true,
      hero: true,
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/pestanas-efecto-natural-01.webp',
      alt: 'Extensiones de pestañas con efecto natural realizadas en Bella Mujer Studio Tehuacán.',
      category: 'Pestañas',
      title: 'Mirada natural definida',
      featured: true,
      hero: true,
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/unas-coloridas-acrilico-01.webp',
      alt: 'Uñas de colores con acabado brillante realizadas en Bella Mujer Studio Tehuacán.',
      category: 'Uñas',
      title: 'Uñas coloridas en acrílico',
      featured: true,
      hero: true,
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/maquillaje-social-glam-01.webp',
      alt: 'Maquillaje social glam realizado en Bella Mujer Studio Tehuacán.',
      category: 'Maquillaje',
      title: 'Maquillaje social luminoso',
      featured: true,
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/peinado-evento-ondas-01.webp',
      alt: 'Peinado para evento con ondas realizado en Bella Mujer Studio Tehuacán.',
      category: 'Peinado',
      title: 'Peinado con ondas para evento',
      featured: true,
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/cejas-diseno-laminado-01.webp',
      alt: 'Diseño de cejas realizado en Bella Mujer Studio Tehuacán.',
      category: 'Cejas',
      title: 'Diseño de cejas cuidado',
      featured: true,
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/cabello-corte-peinado-01.webp',
      alt: 'Corte y peinado de cabello largo visto de espalda en Bella Mujer Studio Tehuacán.',
      category: 'Cabello',
      title: 'Corte y peinado pulido',
      featured: true,
      width: 1200,
      height: 1600
    },
    {
      src: 'assets/gallery/cabello-alisado-tratamiento-01.webp',
      alt: 'Resultado de alisado con cabello lacio y brillante en Bella Mujer Studio Tehuacán.',
      category: 'Cabello',
      title: 'Alisado y tratamiento',
      featured: false,
      width: 576,
      height: 1024
    }
  ];

  protected readonly heroImages = this.galleryImages.filter((image) => image.hero);

  protected readonly galleryPreviews = this.galleryImages.filter((image) => image.featured);

  protected readonly whatsappUrl = buildBellaMujerWhatsAppUrl(
    'Hola Bella Mujer Studio, quiero información para agendar una cita.'
  );

  protected readonly services: readonly HomeService[] = [
    {
      title: 'Uñas',
      description: 'Manicure, aplicación y diseño con acabados limpios para tu estilo diario o evento.',
      note: 'Diseños a elegir en cita',
      accentImage: {
        src: 'assets/gallery/unas-coloridas-acrilico-01.webp',
        alt: 'Detalle de uñas coloridas con acabado brillante en Bella Mujer Studio.',
        width: 1200,
        height: 1600
      }
    },
    {
      title: 'Pestañas',
      description: 'Realce y mirada cuidada con atención al resultado que buscas.',
      note: 'Valoración según servicio',
      accentImage: {
        src: 'assets/gallery/pestanas-efecto-natural-01.webp',
        alt: 'Detalle de extensiones de pestañas con efecto natural en Bella Mujer Studio.',
        width: 1200,
        height: 1600
      }
    },
    {
      title: 'Maquillaje y peinado',
      description: 'Preparación para eventos, sesiones o momentos especiales.',
      note: 'Agenda con anticipación',
      accentImage: {
        src: 'assets/gallery/maquillaje-peinado-glam-01.webp',
        alt: 'Maquillaje glam con peinado de ondas para evento en Bella Mujer Studio.',
        width: 1200,
        height: 1600
      }
    },
    {
      title: 'Cejas',
      description: 'Diseño y mantenimiento para enmarcar tu rostro con naturalidad.',
      note: 'Atención personalizada',
      accentImage: {
        src: 'assets/gallery/cejas-diseno-laminado-01.webp',
        alt: 'Diseño de cejas con acabado natural realizado en Bella Mujer Studio.',
        width: 1200,
        height: 1600
      }
    },
    {
      title: 'Cabello / color',
      description: 'Color, cambios de look y correcciones con diagnóstico antes de confirmar.',
      note: 'Cotización previa',
      accentImage: {
        src: 'assets/gallery/cabello-ondas-largas-01.webp',
        alt: 'Peinado de cabello largo con ondas visto de espalda en Bella Mujer Studio.',
        width: 1200,
        height: 1600
      }
    },
    {
      title: 'Faciales / spa',
      description: 'Espacios de cuidado para consentirte y salir renovada.',
      note: 'Pregunta disponibilidad'
    }
  ];

  protected readonly galleryChips = [
    'Uñas',
    'Pestañas',
    'Maquillaje',
    'Peinado',
    'Cejas',
    'Cabello'
  ];

  protected readonly whyItems: readonly WhyItem[] = [
    {
      title: 'Atención con calma',
      description: 'Trabajamos por cita para escucharte, cuidar los detalles y no hacer todo con prisa.'
    },
    {
      title: 'Guía honesta',
      description: 'Si un servicio necesita valoración, te orientamos antes de prometer un resultado.'
    },
    {
      title: 'Cuidado local',
      description: 'Un estudio en Tehuacán pensado para que te sientas cómoda desde que escribes.'
    }
  ];

  protected readonly bookingSteps: readonly BookingStep[] = [
    {
      title: 'Escríbenos por WhatsApp',
      description: 'Cuéntanos qué servicio te interesa y qué fecha tienes en mente.'
    },
    {
      title: 'Comparte referencias',
      description: 'Para cabello o color, envía fotos actuales de tu cabello y una foto de referencia.'
    },
    {
      title: 'Recibe guía y cotización',
      description: 'Te orientamos con opciones, tiempos aproximados y si hace falta valoración previa.'
    },
    {
      title: 'Confirma tu cita',
      description: 'Acordamos el horario disponible y te esperamos puntual para atenderte con cuidado.'
    }
  ];

  protected readonly faqItems: readonly FaqItem[] = [
    {
      question: '¿Necesito cita?',
      answer: 'Sí. Atendemos con cita previa para darte tiempo y atención personalizada.'
    },
    {
      question: '¿Cómo cotizo un servicio de color?',
      answer:
        'Escríbenos por WhatsApp con fotos actuales de tu cabello, una referencia y el resultado que buscas.'
    },
    {
      question: '¿Piden anticipo?',
      answer:
        'Puede solicitarse anticipo para apartar algunos servicios o fechas. Te lo confirmamos por WhatsApp.'
    },
    {
      question: '¿Dónde están ubicadas?',
      answer: 'Atención con cita previa en Tehuacán, Puebla. La ubicación se comparte al confirmar.'
    },
    {
      question: '¿Puedo agendar por WhatsApp?',
      answer: 'Sí. WhatsApp es el medio principal para resolver dudas, cotizar y confirmar tu cita.'
    }
  ];

  protected scrollToSection(sectionId: string): void {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
}
