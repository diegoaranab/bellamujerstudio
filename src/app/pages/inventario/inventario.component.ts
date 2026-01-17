import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatListModule } from '@angular/material/list';

import { DbFacadeService } from '../../core/services/db-facade.service';

@Component({
  selector: 'app-inventario',
  imports: [AsyncPipe, MatCardModule, MatChipsModule, MatListModule, NgFor, NgIf],
  templateUrl: './inventario.component.html',
  styleUrl: './inventario.component.scss'
})
export class InventarioComponent {
  private readonly dbFacade = inject(DbFacadeService);

  readonly inventario$ = this.dbFacade.inventory$;
}
