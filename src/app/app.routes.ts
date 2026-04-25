import { Routes } from '@angular/router';
import { AsistenteComponent } from './pages/asistente/asistente.component';
import { ClientesComponent } from './pages/clientes/clientes.component';
import { ConfiguracionComponent } from './pages/configuracion/configuracion.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { InventarioComponent } from './pages/inventario/inventario.component';
import { ServiciosComponent } from './pages/servicios/servicios.component';
import { TarjetaRegaloDetalleComponent } from './pages/tarjeta-regalo-detalle/tarjeta-regalo-detalle.component';
import { TarjetaRegaloComponent } from './pages/tarjeta-regalo/tarjeta-regalo.component';
import { TarjetasRegaloComponent } from './pages/tarjetas-regalo/tarjetas-regalo.component';

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: 'inicio', component: DashboardComponent },
  { path: 'servicios', component: ServiciosComponent },
  { path: 'clientes', component: ClientesComponent },
  { path: 'inventario', component: InventarioComponent },
  { path: 'tarjeta-regalo', component: TarjetaRegaloComponent },
  { path: 'tarjetas-regalo', component: TarjetasRegaloComponent },
  { path: 'tarjetas-regalo/:id', component: TarjetaRegaloDetalleComponent },
  { path: 'asistente', component: AsistenteComponent },
  { path: 'configuracion', component: ConfiguracionComponent }
];
