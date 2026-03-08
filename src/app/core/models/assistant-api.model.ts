import { AssistantChatMessage } from './assistant-chat-message.model';
import { PaymentMethod, TransactionStatus } from './transaction.model';

export interface AssistantChatRequest {
  messages: Array<Pick<AssistantChatMessage, 'role' | 'content'>>;
  snapshot: AssistantBusinessSnapshot;
  timezone: string;
}

export interface AssistantChatSuccessResponse {
  ok: true;
  reply: string;
}

export interface AssistantChatErrorResponse {
  ok: false;
  error: string;
}

export type AssistantChatResponse =
  | AssistantChatSuccessResponse
  | AssistantChatErrorResponse;

export interface AssistantBusinessSnapshot {
  locale: 'es-MX';
  currency: 'MXN';
  timezone: string;
  generatedAtISO: string;
  today: {
    localDateISO: string;
    weekday: string;
  };
  kpis: {
    citasHoy: number;
    ingresosHoyMXN: number;
    ticketPromedioHoyMXN: number;
    statusHoy: {
      programada: number;
      completada: number;
      cancelada: number;
    };
  };
  inventory: {
    insumosCriticosTotal: number;
    insumosCriticosTop: AssistantLowStockItem[];
  };
  services: {
    activosTotal: number;
    categoriasActivasTotal: number;
    topServicios30d: AssistantTopServiceItem[];
  };
  transactions: {
    resumen30d: {
      total: number;
      completadas: number;
      programadas: number;
      canceladas: number;
      ingresosMXN: number;
    };
    recientes: AssistantRecentTransaction[];
  };
  overhead?: {
    gastosFijosPorHoraMXN: number;
  };
}

export interface AssistantLowStockItem {
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  unidad: string;
}

export interface AssistantTopServiceItem {
  nombre: string;
  usos: number;
  ingresosMXN: number;
}

export interface AssistantRecentTransaction {
  startAtISO: string;
  status: TransactionStatus;
  totalMXN: number;
  paymentMethod?: PaymentMethod;
  services: string[];
}
