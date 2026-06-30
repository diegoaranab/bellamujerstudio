import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { buildBellaMujerWhatsAppUrl } from '../../core/constants/contact.constants';

interface HomeService {
  title: string;
  description: string;
  note: string;
}

interface GalleryPreview {
  title: string;
  label: string;
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
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './public-home.component.html',
  styleUrl: './public-home.component.scss'
})
export class PublicHomeComponent {
  protected readonly whatsappUrl = buildBellaMujerWhatsAppUrl(
    'Hola Bella Mujer Studio, quiero información para agendar una cita.'
  );

  protected readonly services: readonly HomeService[] = [
    {
      title: 'Uñas',
      description: 'Manicure, aplicación y diseño con acabados limpios para tu estilo diario o evento.',
      note: 'Diseños a elegir en cita'
    },
    {
      title: 'Pestañas',
      description: 'Realce y mirada cuidada con atención al resultado que buscas.',
      note: 'Valoración según servicio'
    },
    {
      title: 'Maquillaje y peinado',
      description: 'Preparación para eventos, sesiones o momentos especiales.',
      note: 'Agenda con anticipación'
    },
    {
      title: 'Cejas',
      description: 'Diseño y mantenimiento para enmarcar tu rostro con naturalidad.',
      note: 'Atención personalizada'
    },
    {
      title: 'Cabello / color',
      description: 'Color, cambios de look y correcciones con diagnóstico antes de confirmar.',
      note: 'Cotización previa'
    },
    {
      title: 'Faciales / spa',
      description: 'Espacios de cuidado para consentirte y salir renovada.',
      note: 'Pregunta disponibilidad'
    }
  ];

  protected readonly galleryChips = ['Uñas', 'Pestañas', 'Maquillaje', 'Peinado', 'Cabello'];

  protected readonly galleryPreviews: readonly GalleryPreview[] = [
    { title: 'Diseños de uñas', label: 'Próximamente trabajo real' },
    { title: 'Miradas y pestañas', label: 'Galería curada en camino' },
    { title: 'Eventos y peinados', label: 'Fotos reales por agregar' },
    { title: 'Color y cabello', label: 'Antes y después pronto' }
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
