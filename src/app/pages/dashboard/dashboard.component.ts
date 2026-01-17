import { AsyncPipe, CurrencyPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatListModule } from '@angular/material/list';
import { combineLatest, map } from 'rxjs';

import { DbFacadeService } from '../../core/services/db-facade.service';
import { TransactionStatus } from '../../core/models';

interface CitaHoyVm {
  id: string;
  cliente: string;
  servicio: string;
  hora: string;
  estado: TransactionStatus;
  totalMXN: number;
  startAtISO: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    AsyncPipe,
    CurrencyPipe,
    NgClass,
    MatCardModule,
    MatChipsModule,
    MatListModule,
    NgFor,
    NgIf
  ],
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
  readonly insumosCriticosCount$ = this.dbFacade.inventory$.pipe(
    map(
      (seed) =>
        seed.materials.filter(
          (material) => material.stockActual <= material.stockMinimo
        ).length
    )
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
  readonly citasHoy$ = combineLatest([
    this.dbFacade.transactions$,
    this.dbFacade.clients$,
    this.dbFacade.services$
  ]).pipe(
    map(([transactions, clientsSeed, servicesSeed]) => {
      const today = new Date();
      const clientsMap = new Map(
        clientsSeed.clients.map((client) => [client.id, client])
      );
      const servicesMap = new Map(
        servicesSeed.services.map((service) => [service.id, service])
      );

      return transactions
        .filter((tx) => this.isSameLocalDay(new Date(tx.startAtISO), today))
        .map((tx) => {
          const clientName =
            clientsMap.get(tx.clientId)?.nombre ??
            tx.clientNombre ??
            'Cliente no disponible';
          const serviceNames = tx.items
            .map(
              (item) =>
                servicesMap.get(item.serviceId)?.nombre ?? item.serviceNombre
            )
            .filter((name): name is string => Boolean(name));
          const servicio = this.formatServiceName(serviceNames);

          return {
            id: tx.id,
            cliente: clientName,
            servicio,
            hora: this.formatHora(tx.startAtISO),
            estado: tx.status,
            totalMXN: tx.totalMXN,
            startAtISO: tx.startAtISO
          } satisfies CitaHoyVm;
        })
        .sort(
          (a, b) =>
            new Date(a.startAtISO).getTime() -
            new Date(b.startAtISO).getTime()
        )
        .slice(0, 6);
    })
  );

  statusLabel(status: TransactionStatus): string {
    switch (status) {
      case 'completada':
        return 'Completada';
      case 'cancelada':
        return 'Cancelada';
      default:
        return 'Programada';
    }
  }

  private formatServiceName(serviceNames: string[]): string {
    if (serviceNames.length === 0) {
      return 'Servicio no disponible';
    }

    const [first, ...rest] = serviceNames;
    if (rest.length === 0) {
      return first;
    }

    return `${first} y ${rest.length} más`;
  }

  private formatHora(startAtISO: string): string {
    return new Date(startAtISO).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private isSameLocalDay(date: Date, reference: Date): boolean {
    return (
      date.getFullYear() === reference.getFullYear() &&
      date.getMonth() === reference.getMonth() &&
      date.getDate() === reference.getDate()
    );
  }
}
