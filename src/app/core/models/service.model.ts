export interface Service {
  id: string;
  categoryId: string;
  nombre: string;
  descripcionCorta: string;
  precioBaseMXN: number;
  duracionMinBase: number;
  activo: boolean;
}

export interface ServiceVariant {
  id: string;
  serviceId: string;
  nombre: string;
  precioDeltaMXN: number;
  duracionDeltaMin: number;
}

export interface ServiceAddOn {
  id: string;
  nombre: string;
  precioMXN: number;
  duracionExtraMin: number;
}

export interface ServiceAddOnLink {
  serviceId: string;
  addOnId: string;
}

export interface ServiceBomItem {
  serviceId: string;
  materialId: string;
  cantidad: number;
  unidad: string;
  variantId?: string;
}

export interface ServiceSeedDto {
  services: Service[];
  variants: ServiceVariant[];
  addOns: ServiceAddOn[];
  serviceAddOns: ServiceAddOnLink[];
  bom: ServiceBomItem[];
}
