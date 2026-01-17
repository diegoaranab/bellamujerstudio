import { Injectable } from '@angular/core';

export interface LocalStateData {
  version: 1;
  updatedAtISO: string;
  serviceOverrides: any[];
  inventoryAdjustments: any[];
  clientsOverrides: any[];
  transactions: any[];
}

@Injectable({
  providedIn: 'root'
})
export class LocalStateService {
  private readonly storageKey = 'bm_state_v1';

  loadState(): LocalStateData {
    if (!this.isStorageAvailable()) {
      return this.createDefaultState();
    }

    const stored = window.localStorage.getItem(this.storageKey);
    if (!stored) {
      return this.createDefaultState();
    }

    try {
      const parsed = JSON.parse(stored);
      if (this.isValidState(parsed)) {
        return parsed;
      }
    } catch {
      return this.createDefaultState();
    }

    return this.createDefaultState();
  }

  saveState(state: LocalStateData): boolean {
    if (!this.isStorageAvailable()) {
      return false;
    }

    const payload: LocalStateData = {
      ...state,
      version: 1,
      updatedAtISO: new Date().toISOString()
    };

    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(payload));
      return true;
    } catch (error) {
      if (this.isQuotaExceededError(error)) {
        return false;
      }

      return false;
    }
  }

  reset(): void {
    if (!this.isStorageAvailable()) {
      return;
    }

    try {
      window.localStorage.removeItem(this.storageKey);
    } catch {
      return;
    }
  }

  exportState(): string {
    const currentState = this.loadState();
    return JSON.stringify(currentState);
  }

  importState(jsonString: string): LocalStateData | null {
    try {
      const parsed = JSON.parse(jsonString);
      if (!this.isValidState(parsed)) {
        return null;
      }

      const saved = this.saveState(parsed);
      if (!saved) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private isStorageAvailable(): boolean {
    if (typeof window === 'undefined' || !('localStorage' in window)) {
      return false;
    }

    try {
      const testKey = '__bm_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private isValidState(value: unknown): value is LocalStateData {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as LocalStateData;

    return (
      record.version === 1 &&
      typeof record.updatedAtISO === 'string' &&
      Array.isArray(record.serviceOverrides) &&
      Array.isArray(record.inventoryAdjustments) &&
      Array.isArray(record.clientsOverrides) &&
      Array.isArray(record.transactions)
    );
  }

  private createDefaultState(): LocalStateData {
    return {
      version: 1,
      updatedAtISO: new Date().toISOString(),
      serviceOverrides: [],
      inventoryAdjustments: [],
      clientsOverrides: [],
      transactions: []
    };
  }

  private isQuotaExceededError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const exception = error as DOMException;
    return (
      exception.name === 'QuotaExceededError' ||
      exception.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    );
  }
}
