import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map, Observable, shareReplay } from 'rxjs';

import {
  CategorySeedDto,
  Client,
  ClientSeedDto,
  InventorySeedDto,
  LocalStateData,
  Material,
  OverheadSeedDto,
  Service,
  Transaction
} from '../models';
import { LocalStateService } from './local-state.service';
import { SeedDbService, ServicesDbSeed } from './seed-db.service';

interface ServiceOverride extends Partial<Service> {
  id: string;
}

interface ClientOverride extends Partial<Client> {
  id: string;
}

interface InventoryAdjustment {
  materialId: string;
  cantidad?: number;
  delta?: number;
  ajuste?: number;
  motivo?: string;
  createdAtISO?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DbFacadeService {
  readonly categories$: Observable<CategorySeedDto>;
  readonly services$: Observable<ServicesDbSeed>;
  readonly inventory$: Observable<InventorySeedDto>;
  readonly clients$: Observable<ClientSeedDto>;
  readonly overhead$: Observable<OverheadSeedDto>;
  readonly transactions$: Observable<Transaction[]>;

  private readonly stateSubject: BehaviorSubject<LocalStateData>;

  constructor(
    private readonly seedDb: SeedDbService,
    private readonly localState: LocalStateService
  ) {
    this.stateSubject = new BehaviorSubject<LocalStateData>(
      this.localState.loadState()
    );

    this.categories$ = this.seedDb.loadCategories().pipe(shareReplay(1));
    this.services$ = combineLatest([
      this.seedDb.loadServicesDb(),
      this.stateSubject
    ]).pipe(
      map(([seed, state]) =>
        this.applyServiceOverrides(seed, state.serviceOverrides)
      ),
      shareReplay(1)
    );
    this.inventory$ = combineLatest([
      this.seedDb.loadInventory(),
      this.stateSubject
    ]).pipe(
      map(([seed, state]) =>
        this.applyInventoryAdjustments(seed, state.inventoryAdjustments)
      ),
      shareReplay(1)
    );
    this.clients$ = combineLatest([
      this.seedDb.loadClients(),
      this.stateSubject
    ]).pipe(
      map(([seed, state]) =>
        this.applyClientOverrides(seed, state.clientsOverrides)
      ),
      shareReplay(1)
    );
    this.overhead$ = this.seedDb.loadOverhead().pipe(shareReplay(1));
    this.transactions$ = this.stateSubject.pipe(
      map((state) => state.transactions),
      shareReplay(1)
    );
  }

  resetDemo(): void {
    this.localState.reset();
    this.refreshLocalState();
  }

  seedDemoDataIfEmpty(): void {
    const current = this.localState.loadState();
    const hasStateData =
      current.serviceOverrides.length > 0 ||
      current.inventoryAdjustments.length > 0 ||
      current.clientsOverrides.length > 0 ||
      current.transactions.length > 0;

    if (!hasStateData) {
      this.localState.saveState(current);
    }

    this.stateSubject.next(current);
  }

  addTransaction(tx: Transaction): void {
    const current = this.localState.loadState();
    const inventoryAdjustments = [
      ...current.inventoryAdjustments,
      ...this.createInventoryAdjustmentsForTransaction(tx)
    ];
    const nextState: LocalStateData = {
      ...current,
      transactions: [...current.transactions, tx],
      inventoryAdjustments
    };

    this.localState.saveState(nextState);
    this.stateSubject.next(nextState);
  }

  generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `bm_${Math.random().toString(36).slice(2, 10)}`;
  }

  private refreshLocalState(): void {
    this.stateSubject.next(this.localState.loadState());
  }

  private applyServiceOverrides(
    seed: ServicesDbSeed,
    overrides: unknown[]
  ): ServicesDbSeed {
    const safeOverrides = overrides.filter(this.isServiceOverride);
    if (safeOverrides.length === 0) {
      return seed;
    }

    const overrideMap = new Map(
      safeOverrides.map((override) => [override.id, override])
    );
    const services = seed.services.map((service) => {
      const override = overrideMap.get(service.id);
      if (!override) {
        return service;
      }

      return {
        ...service,
        ...override,
        id: service.id
      };
    });

    return {
      ...seed,
      services
    };
  }

  private applyClientOverrides(
    seed: ClientSeedDto,
    overrides: unknown[]
  ): ClientSeedDto {
    const safeOverrides = overrides.filter(this.isClientOverride);
    if (safeOverrides.length === 0) {
      return seed;
    }

    const overrideMap = new Map(
      safeOverrides.map((override) => [override.id, override])
    );
    const clients = seed.clients.map((client) => {
      const override = overrideMap.get(client.id);
      if (!override) {
        return client;
      }

      return {
        ...client,
        ...override,
        id: client.id
      };
    });

    return {
      ...seed,
      clients
    };
  }

  private applyInventoryAdjustments(
    seed: InventorySeedDto,
    adjustments: unknown[]
  ): InventorySeedDto {
    const safeAdjustments = adjustments.filter(this.isInventoryAdjustment);
    if (safeAdjustments.length === 0) {
      return seed;
    }

    const adjustmentTotals = new Map<string, number>();
    safeAdjustments.forEach((adjustment) => {
      const delta = this.resolveAdjustmentDelta(adjustment);
      if (delta === 0) {
        return;
      }

      adjustmentTotals.set(
        adjustment.materialId,
        (adjustmentTotals.get(adjustment.materialId) ?? 0) + delta
      );
    });

    const materials = seed.materials.map((material) =>
      this.applyMaterialAdjustment(material, adjustmentTotals)
    );

    return {
      ...seed,
      materials
    };
  }

  private applyMaterialAdjustment(
    material: Material,
    adjustmentTotals: Map<string, number>
  ): Material {
    const delta = adjustmentTotals.get(material.id);
    if (!delta) {
      return material;
    }

    return {
      ...material,
      stockActual: material.stockActual + delta
    };
  }

  private resolveAdjustmentDelta(adjustment: InventoryAdjustment): number {
    const candidates = [
      adjustment.cantidad,
      adjustment.delta,
      adjustment.ajuste
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
    }

    return 0;
  }

  private createInventoryAdjustmentsForTransaction(
    tx: Transaction
  ): InventoryAdjustment[] {
    if (tx.status !== 'completada') {
      return [];
    }

    const createdAtISO = new Date().toISOString();
    const adjustments: InventoryAdjustment[] = [];

    tx.items.forEach((item) => {
      item.bomSnapshot?.forEach((bomItem) => {
        adjustments.push({
          materialId: bomItem.materialId,
          delta: -bomItem.cantidad,
          motivo: `Consumo por servicio (${tx.id})`,
          createdAtISO
        });
      });
    });

    return adjustments;
  }

  private isServiceOverride(value: unknown): value is ServiceOverride {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as ServiceOverride;
    return typeof record.id === 'string' && record.id.length > 0;
  }

  private isClientOverride(value: unknown): value is ClientOverride {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as ClientOverride;
    return typeof record.id === 'string' && record.id.length > 0;
  }

  private isInventoryAdjustment(value: unknown): value is InventoryAdjustment {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as InventoryAdjustment;
    return typeof record.materialId === 'string' && record.materialId.length > 0;
  }
}
