import { Injectable } from '@angular/core';

import { AssistantChatMessage, LocalStateData } from '../models';

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
      return this.normalizeState(parsed);
    } catch {
      return this.createDefaultState();
    }
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

      const normalized = this.normalizeState(parsed);
      const saved = this.saveState(normalized);
      if (!saved) {
        return null;
      }

      return normalized;
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

  private isValidState(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as Partial<LocalStateData>;

    return (
      record.version === 1 &&
      typeof record.updatedAtISO === 'string' &&
      Array.isArray(record.serviceOverrides) &&
      Array.isArray(record.inventoryAdjustments) &&
      Array.isArray(record.clientsOverrides) &&
      Array.isArray(record.transactions) &&
      (typeof record.assistantChatHistory === 'undefined' ||
        Array.isArray(record.assistantChatHistory))
    );
  }

  private normalizeState(value: unknown): LocalStateData {
    if (!value || typeof value !== 'object') {
      return this.createDefaultState();
    }

    const record = value as Partial<LocalStateData>;
    if (record.version !== 1 && typeof record.version !== 'undefined') {
      return this.createDefaultState();
    }

    const fallback = this.createDefaultState();

    return {
      ...fallback,
      updatedAtISO:
        typeof record.updatedAtISO === 'string'
          ? record.updatedAtISO
          : fallback.updatedAtISO,
      serviceOverrides: Array.isArray(record.serviceOverrides)
        ? record.serviceOverrides
        : fallback.serviceOverrides,
      inventoryAdjustments: Array.isArray(record.inventoryAdjustments)
        ? record.inventoryAdjustments
        : fallback.inventoryAdjustments,
      clientsOverrides: Array.isArray(record.clientsOverrides)
        ? record.clientsOverrides
        : fallback.clientsOverrides,
      transactions: Array.isArray(record.transactions)
        ? record.transactions
        : fallback.transactions,
      assistantChatHistory: this.normalizeAssistantChatHistory(
        record.assistantChatHistory
      )
    };
  }

  private createDefaultState(): LocalStateData {
    return {
      version: 1,
      updatedAtISO: new Date().toISOString(),
      serviceOverrides: [],
      inventoryAdjustments: [],
      clientsOverrides: [],
      transactions: [],
      assistantChatHistory: []
    };
  }

  private normalizeAssistantChatHistory(
    value: unknown
  ): AssistantChatMessage[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((message): message is AssistantChatMessage =>
        this.isAssistantChatMessage(message)
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
        ...(typeof message.createdAtISO === 'string'
          ? { createdAtISO: message.createdAtISO }
          : {})
      }));
  }

  private isAssistantChatMessage(value: unknown): value is AssistantChatMessage {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as AssistantChatMessage;
    const isValidRole = record.role === 'user' || record.role === 'assistant';

    return isValidRole && typeof record.content === 'string';
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
