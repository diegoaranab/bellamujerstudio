export interface Category {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface CategorySeedDto {
  categories: Category[];
}
