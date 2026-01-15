import { Routes } from '@angular/router';
import { AsistenteComponent } from './pages/asistente/asistente.component';
import { ClientesComponent } from './pages/clientes/clientes.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { InventarioComponent } from './pages/inventario/inventario.component';
import { ServiciosComponent } from './pages/servicios/servicios.component';

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: 'inicio', component: DashboardComponent },
  { path: 'servicios', component: ServiciosComponent },
  { path: 'clientes', component: ClientesComponent },
  { path: 'inventario', component: InventarioComponent },
  { path: 'asistente', component: AsistenteComponent }
];
