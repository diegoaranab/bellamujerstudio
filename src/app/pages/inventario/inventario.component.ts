import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';

import { DbFacadeService } from '../../core/services/db-facade.service';
import { RegistrarEntradaDialogComponent } from '../../shared/dialogs/registrar-entrada-dialog/registrar-entrada-dialog.component';

@Component({
  selector: 'app-inventario',
  imports: [
    AsyncPipe,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatListModule,
    NgFor,
    NgIf
  ],
  templateUrl: './inventario.component.html',
  styleUrl: './inventario.component.scss'
})
export class InventarioComponent {
  private readonly dbFacade = inject(DbFacadeService);
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly inventario$ = this.dbFacade.inventory$;

  openRegistrarEntrada(): void {
    const isHandset = this.breakpointObserver.isMatched(Breakpoints.Handset);
    this.dialog.open(RegistrarEntradaDialogComponent, {
      width: isHandset ? '100vw' : '520px',
      maxWidth: isHandset ? '100vw' : '95vw',
      height: isHandset ? '100vh' : undefined,
      maxHeight: isHandset ? '100vh' : '90vh',
      panelClass: isHandset ? 'bm-dialog-fullscreen' : undefined
    });
  }
}
