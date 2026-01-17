import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import {
  CategorySeedDto,
  ClientSeedDto,
  InventorySeedDto,
  OverheadSeedDto,
  ServiceSeedDto
} from '../models';

export interface SeedDb {
  categories: CategorySeedDto;
  services: ServicesDbSeed;
  inventory: InventorySeedDto;
  clients: ClientSeedDto;
  overhead: OverheadSeedDto;
}

export type ServicesDbSeed = ServiceSeedDto & {
  mappings?: Record<string, unknown>;
};

@Injectable({
  providedIn: 'root'
})
export class SeedDbService {
  private categories$?: Observable<CategorySeedDto>;
  private services$?: Observable<ServicesDbSeed>;
  private inventory$?: Observable<InventorySeedDto>;
  private clients$?: Observable<ClientSeedDto>;
  private overhead$?: Observable<OverheadSeedDto>;

  constructor(private readonly http: HttpClient) {}

  loadCategories(): Observable<CategorySeedDto> {
    if (!this.categories$) {
      this.categories$ = this.http
        .get<CategorySeedDto>('assets/db/categories.seed.json')
        .pipe(shareReplay(1));
    }

    return this.categories$;
  }

  loadServicesDb(): Observable<ServicesDbSeed> {
    if (!this.services$) {
      this.services$ = this.http
        .get<ServicesDbSeed>('assets/db/services.seed.json')
        .pipe(shareReplay(1));
    }

    return this.services$;
  }

  loadInventory(): Observable<InventorySeedDto> {
    if (!this.inventory$) {
      this.inventory$ = this.http
        .get<InventorySeedDto>('assets/db/inventory.seed.json')
        .pipe(shareReplay(1));
    }

    return this.inventory$;
  }

  loadClients(): Observable<ClientSeedDto> {
    if (!this.clients$) {
      this.clients$ = this.http
        .get<ClientSeedDto>('assets/db/clients.seed.json')
        .pipe(shareReplay(1));
    }

    return this.clients$;
  }

  loadOverhead(): Observable<OverheadSeedDto> {
    if (!this.overhead$) {
      this.overhead$ = this.http
        .get<OverheadSeedDto>('assets/db/overhead.seed.json')
        .pipe(shareReplay(1));
    }

    return this.overhead$;
  }
}
