export type TransactionStatus = 'programada' | 'completada' | 'cancelada';

export type PaymentMethod = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';

export interface TransactionItem {
  serviceId: string;
  serviceNombre: string;
  precioBaseMXN: number;
  duracionMin: number;
  bomSnapshot?: Array<{
    materialId: string;
    nombre: string;
    cantidad: number;
    unidad?: string;
  }>;
}

export interface Transaction {
  id: string;
  createdAtISO: string;
  startAtISO: string;
  status: TransactionStatus;
  clientId: string;
  clientNombre: string;
  items: TransactionItem[];
  totalMXN: number;
  paymentMethod?: PaymentMethod;
  notas?: string;
}
