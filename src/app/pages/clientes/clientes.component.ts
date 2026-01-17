import { AsyncPipe, NgFor } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';

import { DbFacadeService } from '../../core/services/db-facade.service';

@Component({
  selector: 'app-clientes',
  imports: [AsyncPipe, MatCardModule, MatListModule, NgFor],
  templateUrl: './clientes.component.html',
  styleUrl: './clientes.component.scss'
})
export class ClientesComponent {
  private readonly dbFacade = inject(DbFacadeService);

  readonly clientes$ = this.dbFacade.clients$;
}
