export interface Material {
  id: string;
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
  costoPorUnidadMXN: number;
  proveedorSugerido: string;
}

export interface InventorySeedDto {
  materials: Material[];
}
