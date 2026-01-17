export interface Client {
  id: string;
  nombre: string;
  telefono: string;
  notas: string;
}

export interface ClientSeedDto {
  clients: Client[];
}
