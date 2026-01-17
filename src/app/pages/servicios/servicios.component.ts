import { AsyncPipe, CurrencyPipe, NgFor } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { combineLatest, map } from 'rxjs';

import { DbFacadeService } from '../../core/services/db-facade.service';

@Component({
  selector: 'app-servicios',
  imports: [AsyncPipe, CurrencyPipe, MatCardModule, MatListModule, NgFor],
  templateUrl: './servicios.component.html',
  styleUrl: './servicios.component.scss'
})
export class ServiciosComponent {
  private readonly dbFacade = inject(DbFacadeService);

  readonly categorias$ = combineLatest([
    this.dbFacade.categories$,
    this.dbFacade.services$
  ]).pipe(
    map(([categoriesSeed, servicesSeed]) =>
      categoriesSeed.categories.map((category) => ({
        ...category,
        servicios: servicesSeed.services.filter(
          (service) => service.categoryId === category.id && service.activo
        )
      }))
    )
  );
}
