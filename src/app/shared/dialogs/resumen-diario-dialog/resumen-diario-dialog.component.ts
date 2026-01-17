import { AsyncPipe, CurrencyPipe, NgFor, NgIf } from '@angular/common';
import { Component, inject, ViewEncapsulation } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { combineLatest, map } from 'rxjs';

import { DbFacadeService } from '../../../core/services/db-facade.service';

interface StatusCounts {
  programada: number;
  completada: number;
  cancelada: number;
}

interface TopServicioVm {
  serviceId: string;
  nombre: string;
  count: number;
  revenueMXN: number;
}

interface InsumoCriticoVm {
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
}

interface ResumenDiarioVm {
  fechaLabel: string;
  ingresosHoyMXN: number;
  citasHoy: number;
  ticketPromedioMXN: number;
  statusCounts: StatusCounts;
  topServicios: TopServicioVm[];
  insumosCriticos: InsumoCriticoVm[];
}

@Component({
  selector: 'app-resumen-diario-dialog',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    NgFor,
    NgIf,
    MatButtonModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './resumen-diario-dialog.component.html',
  styleUrl: './resumen-diario-dialog.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class ResumenDiarioDialogComponent {
  private readonly dbFacade = inject(DbFacadeService);
  private readonly dialogRef = inject(MatDialogRef<ResumenDiarioDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);

  readonly resumen$ = combineLatest([
    this.dbFacade.transactions$,
    this.dbFacade.services$,
    this.dbFacade.inventory$
  ]).pipe(
    map(([transactions, servicesSeed, inventorySeed]) => {
      const today = new Date();
      const todayLabel = today.toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
      const statusCounts: StatusCounts = {
        programada: 0,
        completada: 0,
        cancelada: 0
      };
      let ingresosHoyMXN = 0;
      let completadasCount = 0;

      const todaysTransactions = transactions.filter((tx) =>
        this.isSameLocalDay(new Date(tx.startAtISO), today)
      );

      todaysTransactions.forEach((tx) => {
        statusCounts[tx.status] += 1;
        if (tx.status === 'completada') {
          ingresosHoyMXN += tx.totalMXN;
          completadasCount += 1;
        }
      });

      const citasHoy = todaysTransactions.length;
      const ticketPromedioMXN = completadasCount
        ? ingresosHoyMXN / completadasCount
        : 0;

      const servicesMap = new Map(
        servicesSeed.services.map((service) => [service.id, service])
      );
      const topServiciosMap = new Map<string, TopServicioVm>();

      todaysTransactions.forEach((tx) => {
        tx.items.forEach((item) => {
          const nombre =
            servicesMap.get(item.serviceId)?.nombre ??
            item.serviceNombre ??
            'Servicio';
          const current = topServiciosMap.get(item.serviceId) ?? {
            serviceId: item.serviceId,
            nombre,
            count: 0,
            revenueMXN: 0
          };
          current.count += 1;
          if (tx.status === 'completada') {
            current.revenueMXN += item.precioBaseMXN;
          }
          topServiciosMap.set(item.serviceId, current);
        });
      });

      const topServicios = Array.from(topServiciosMap.values())
        .sort((a, b) => b.count - a.count || b.revenueMXN - a.revenueMXN)
        .slice(0, 5);

      const insumosCriticos = inventorySeed.materials
        .filter((material) => material.stockActual <= material.stockMinimo)
        .slice(0, 6)
        .map((material) => ({
          nombre: material.nombre,
          unidad: material.unidad,
          stockActual: material.stockActual,
          stockMinimo: material.stockMinimo
        }));

      return {
        fechaLabel: todayLabel,
        ingresosHoyMXN,
        citasHoy,
        ticketPromedioMXN,
        statusCounts,
        topServicios,
        insumosCriticos
      } satisfies ResumenDiarioVm;
    })
  );

  close(): void {
    this.dialogRef.close();
  }

  async copiarResumen(resumen: ResumenDiarioVm): Promise<void> {
    const texto = this.buildSummaryText(resumen);

    if (!navigator?.clipboard) {
      this.snackBar.open('No se pudo copiar el resumen.', 'Cerrar', {
        duration: 2400
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(texto);
      this.snackBar.open('Resumen copiado al portapapeles.', 'Cerrar', {
        duration: 2400
      });
    } catch {
      this.snackBar.open('No se pudo copiar el resumen.', 'Cerrar', {
        duration: 2400
      });
    }
  }

  private buildSummaryText(resumen: ResumenDiarioVm): string {
    const currency = this.formatCurrency(resumen.ingresosHoyMXN);
    const ticket = this.formatCurrency(resumen.ticketPromedioMXN);
    const topServicio = resumen.topServicios[0]?.nombre;
    const topDetalle = topServicio
      ? `Servicio más solicitado: ${topServicio}.`
      : '';
    const insumos = resumen.insumosCriticos.length
      ? `Insumos críticos: ${resumen.insumosCriticos.length}.`
      : 'Sin insumos críticos hoy.';

    return [
      `Resumen del día (${resumen.fechaLabel}):`,
      `Ingresos ${currency}.`,
      `Citas ${resumen.citasHoy} (Completadas ${resumen.statusCounts.completada}, Programadas ${resumen.statusCounts.programada}, Canceladas ${resumen.statusCounts.cancelada}).`,
      `Ticket promedio ${ticket}.`,
      topDetalle,
      insumos
    ]
      .filter(Boolean)
      .join(' ');
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0
    }).format(amount);
  }

  private isSameLocalDay(date: Date, reference: Date): boolean {
    return (
      date.getFullYear() === reference.getFullYear() &&
      date.getMonth() === reference.getMonth() &&
      date.getDate() === reference.getDate()
    );
  }
}
