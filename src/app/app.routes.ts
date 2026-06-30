import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './layouts/admin-layout/admin-layout.component';
import { PublicLayoutComponent } from './layouts/public-layout/public-layout.component';
import { AsistenteComponent } from './pages/asistente/asistente.component';
import { ClientesComponent } from './pages/clientes/clientes.component';
import { ConfiguracionComponent } from './pages/configuracion/configuracion.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { InventarioComponent } from './pages/inventario/inventario.component';
import { PublicHomeComponent } from './pages/public-home/public-home.component';
import { ServiciosComponent } from './pages/servicios/servicios.component';
import { TarjetaRegaloDetalleComponent } from './pages/tarjeta-regalo-detalle/tarjeta-regalo-detalle.component';
import { TarjetaRegaloComponent } from './pages/tarjeta-regalo/tarjeta-regalo.component';
import { TarjetasRegaloComponent } from './pages/tarjetas-regalo/tarjetas-regalo.component';

export const routes: Routes = [
  {
    path: 'admin',
    component: AdminLayoutComponent,
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      { path: 'inicio', component: DashboardComponent },
      { path: 'servicios', component: ServiciosComponent },
      { path: 'clientes', component: ClientesComponent },
      { path: 'inventario', component: InventarioComponent },
      { path: 'tarjetas-regalo', component: TarjetasRegaloComponent },
      {
        path: 'tarjetas-regalo/:id',
        component: TarjetaRegaloDetalleComponent
      },
      { path: 'asistente', component: AsistenteComponent },
      { path: 'configuracion', component: ConfiguracionComponent }
    ]
  },
  { path: 'inicio', redirectTo: 'admin/inicio', pathMatch: 'full' },
  { path: 'servicios', redirectTo: 'admin/servicios', pathMatch: 'full' },
  { path: 'clientes', redirectTo: 'admin/clientes', pathMatch: 'full' },
  { path: 'inventario', redirectTo: 'admin/inventario', pathMatch: 'full' },
  {
    path: 'tarjetas-regalo',
    redirectTo: 'admin/tarjetas-regalo',
    pathMatch: 'full'
  },
  {
    path: 'tarjetas-regalo/:id',
    redirectTo: 'admin/tarjetas-regalo/:id',
    pathMatch: 'full'
  },
  { path: 'asistente', redirectTo: 'admin/asistente', pathMatch: 'full' },
  {
    path: 'configuracion',
    redirectTo: 'admin/configuracion',
    pathMatch: 'full'
  },
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      { path: '', component: PublicHomeComponent },
      { path: 'tarjeta-regalo', component: TarjetaRegaloComponent }
    ]
  }
];
