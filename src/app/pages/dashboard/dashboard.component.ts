import { AsyncPipe, CurrencyPipe, NgFor } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { map } from 'rxjs';

import { DbFacadeService } from '../../core/services/db-facade.service';

@Component({
  selector: 'app-dashboard',
  imports: [AsyncPipe, CurrencyPipe, MatCardModule, MatListModule, NgFor],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly dbFacade = inject(DbFacadeService);

  readonly serviciosCount$ = this.dbFacade.services$.pipe(
    map((seed) => seed.services.length)
  );
  readonly materialesCount$ = this.dbFacade.inventory$.pipe(
    map((seed) => seed.materials.length)
  );
  readonly clientesCount$ = this.dbFacade.clients$.pipe(
    map((seed) => seed.clients.length)
  );
  readonly gastosFijosPorHora$ = this.dbFacade.overhead$.pipe(
    map((seed) => seed.gastosFijosPorHoraMXN)
  );
  readonly demoPrecioServicio$ = this.dbFacade.services$.pipe(
    map((seed) => seed.services[0]?.precioBaseMXN ?? 0)
  );
  readonly serviciosDestacados$ = this.dbFacade.services$.pipe(
    map((seed) => seed.services.slice(0, 4))
  );
  readonly clientesRecientes$ = this.dbFacade.clients$.pipe(
    map((seed) => seed.clients.slice(0, 4))
  );
}
