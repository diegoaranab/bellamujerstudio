import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  firstValueFrom,
  map,
  take
} from 'rxjs';

import {
  AssistantBusinessSnapshot,
  AssistantChatMessage,
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantRecentTransaction,
  AssistantTopServiceItem,
  Transaction,
  TransactionStatus
} from '../models';
import { AssistantApiConfigService } from './assistant-api-config.service';
import { DbFacadeService } from './db-facade.service';
import { LocalStateService } from './local-state.service';

export interface AssistantConversationState {
  history: AssistantChatMessage[];
  isSending: boolean;
  lastError: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AssistantService {
  readonly state$: Observable<AssistantConversationState>;
  readonly chatHistory$: Observable<AssistantChatMessage[]>;
  readonly isSending$: Observable<boolean>;
  readonly lastError$: Observable<string | null>;

  private readonly stateSubject: BehaviorSubject<AssistantConversationState>;
  private readonly maxMessagesForRequest = 20;
  private readonly maxCriticalStockItems = 6;
  private readonly maxTopServices = 5;
  private readonly maxRecentTransactions = 8;
  private readonly rollingWindowDays = 30;

  constructor(
    private readonly http: HttpClient,
    private readonly dbFacade: DbFacadeService,
    private readonly localState: LocalStateService,
    private readonly assistantApiConfig: AssistantApiConfigService
  ) {
    this.stateSubject = new BehaviorSubject(this.buildInitialState());
    this.state$ = this.stateSubject.asObservable();
    this.chatHistory$ = this.state$.pipe(map((state) => state.history));
    this.isSending$ = this.state$.pipe(map((state) => state.isSending));
    this.lastError$ = this.state$.pipe(map((state) => state.lastError));
  }

  async sendUserMessage(content: string): Promise<AssistantChatMessage> {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      const emptyMessage = this.createAssistantMessage(
        'Escribe un mensaje para poder ayudarte.'
      );
      this.appendMessage(emptyMessage);
      this.patchState({ lastError: emptyMessage.content });
      return emptyMessage;
    }

    this.appendMessage(this.createUserMessage(trimmedContent));
    this.patchState({ isSending: true, lastError: null });

    try {
      const timezone = this.resolveTimezone();
      const snapshot = await this.buildBusinessSnapshot(timezone);
      const requestPayload: AssistantChatRequest = {
        messages: this.buildRequestMessages(this.stateSubject.value.history),
        snapshot,
        timezone
      };
      const response = await firstValueFrom(
        this.http
          .post<AssistantChatResponse>(
            this.assistantApiConfig.assistantEndpoint,
            requestPayload
          )
          .pipe(take(1))
      );
      const reply = this.resolveReply(response);
      const assistantMessage = this.createAssistantMessage(reply);

      this.appendMessage(assistantMessage);
      this.patchState({ isSending: false, lastError: null });

      return assistantMessage;
    } catch (error) {
      const fallbackMessage = this.createFriendlyFallback(error);
      const assistantErrorMessage = this.createAssistantMessage(fallbackMessage);

      this.appendMessage(assistantErrorMessage);
      this.patchState({ isSending: false, lastError: fallbackMessage });

      return assistantErrorMessage;
    }
  }

  clearChatHistory(): void {
    this.replaceHistory([]);
    this.patchState({ lastError: null });
  }

  private buildInitialState(): AssistantConversationState {
    const initialHistory = this.localState.loadState().assistantChatHistory;
    return {
      history: [...initialHistory],
      isSending: false,
      lastError: null
    };
  }

  private replaceHistory(history: AssistantChatMessage[]): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      history
    });
    this.persistHistory(history);
  }

  private appendMessage(message: AssistantChatMessage): void {
    this.replaceHistory([...this.stateSubject.value.history, message]);
  }

  private persistHistory(history: AssistantChatMessage[]): void {
    const currentState = this.localState.loadState();
    const saved = this.localState.saveState({
      ...currentState,
      assistantChatHistory: history
    });

    if (!saved) {
      this.patchState({
        lastError:
          'No se pudo guardar el historial del asistente en este dispositivo.'
      });
    }
  }

  private patchState(
    patch: Partial<Pick<AssistantConversationState, 'isSending' | 'lastError'>>
  ): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...patch
    });
  }

  private buildRequestMessages(
    history: AssistantChatMessage[]
  ): Array<Pick<AssistantChatMessage, 'role' | 'content'>> {
    return history
      .slice(-this.maxMessagesForRequest)
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({
        role: message.role,
        content: message.content.trim()
      }));
  }

  private async buildBusinessSnapshot(
    timezone: string
  ): Promise<AssistantBusinessSnapshot> {
    const [categoriesSeed, servicesSeed, inventorySeed, overheadSeed, transactions] =
      await firstValueFrom(
        combineLatest([
          this.dbFacade.categories$,
          this.dbFacade.services$,
          this.dbFacade.inventory$,
          this.dbFacade.overhead$,
          this.dbFacade.transactions$
        ]).pipe(take(1))
      );

    const now = new Date();
    const localDateISO = this.toLocalDateISO(now);
    const weekday = now.toLocaleDateString('es-MX', { weekday: 'long' });

    const todayTransactions = transactions.filter((tx) =>
      this.isSameLocalDay(new Date(tx.startAtISO), now)
    );
    const todayStatusCounts: Record<TransactionStatus, number> = {
      programada: 0,
      completada: 0,
      cancelada: 0
    };
    let ingresosHoyMXN = 0;
    let completadasHoy = 0;

    todayTransactions.forEach((tx) => {
      todayStatusCounts[tx.status] += 1;
      if (tx.status === 'completada') {
        ingresosHoyMXN += tx.totalMXN;
        completadasHoy += 1;
      }
    });

    const ticketPromedioHoyMXN =
      completadasHoy > 0 ? ingresosHoyMXN / completadasHoy : 0;

    const lowStockMaterials = inventorySeed.materials
      .filter((material) => material.stockActual <= material.stockMinimo)
      .sort(
        (a, b) =>
          b.stockMinimo -
          b.stockActual -
          (a.stockMinimo - a.stockActual)
      );

    const startWindowDate = new Date(now);
    startWindowDate.setHours(0, 0, 0, 0);
    startWindowDate.setDate(
      startWindowDate.getDate() - (this.rollingWindowDays - 1)
    );

    const transactions30d = transactions.filter(
      (tx) => new Date(tx.startAtISO).getTime() >= startWindowDate.getTime()
    );
    const transactionsSummary30d: AssistantBusinessSnapshot['transactions']['resumen30d'] =
      {
        total: transactions30d.length,
        completadas: 0,
        programadas: 0,
        canceladas: 0,
        ingresosMXN: 0
      };
    const summaryKeyByStatus: Record<
      TransactionStatus,
      keyof Pick<
        AssistantBusinessSnapshot['transactions']['resumen30d'],
        'programadas' | 'completadas' | 'canceladas'
      >
    > = {
      programada: 'programadas',
      completada: 'completadas',
      cancelada: 'canceladas'
    };

    transactions30d.forEach((tx) => {
      transactionsSummary30d[summaryKeyByStatus[tx.status]] += 1;
      if (tx.status === 'completada') {
        transactionsSummary30d.ingresosMXN += tx.totalMXN;
      }
    });

    const topServices30d = this.buildTopServicesSummary(transactions30d);
    const recentTransactions = this.buildRecentTransactionsSummary(transactions);

    const snapshot: AssistantBusinessSnapshot = {
      locale: 'es-MX',
      currency: 'MXN',
      timezone,
      generatedAtISO: now.toISOString(),
      today: {
        localDateISO,
        weekday
      },
      kpis: {
        citasHoy: todayTransactions.length,
        ingresosHoyMXN,
        ticketPromedioHoyMXN,
        statusHoy: {
          programada: todayStatusCounts.programada,
          completada: todayStatusCounts.completada,
          cancelada: todayStatusCounts.cancelada
        }
      },
      inventory: {
        insumosCriticosTotal: lowStockMaterials.length,
        insumosCriticosTop: lowStockMaterials
          .slice(0, this.maxCriticalStockItems)
          .map((material) => ({
            nombre: material.nombre,
            stockActual: material.stockActual,
            stockMinimo: material.stockMinimo,
            unidad: material.unidad
          }))
      },
      services: {
        activosTotal: servicesSeed.services.filter((service) => service.activo)
          .length,
        categoriasActivasTotal: categoriesSeed.categories.filter(
          (category) => category.activo
        ).length,
        topServicios30d: topServices30d
      },
      transactions: {
        resumen30d: transactionsSummary30d,
        recientes: recentTransactions
      }
    };

    if (Number.isFinite(overheadSeed.gastosFijosPorHoraMXN)) {
      snapshot.overhead = {
        gastosFijosPorHoraMXN: overheadSeed.gastosFijosPorHoraMXN
      };
    }

    return snapshot;
  }

  private buildTopServicesSummary(
    transactions: Transaction[]
  ): AssistantTopServiceItem[] {
    const accumulator = new Map<
      string,
      {
        nombre: string;
        usos: number;
        ingresosMXN: number;
      }
    >();

    transactions.forEach((tx) => {
      tx.items.forEach((item) => {
        const serviceName = item.serviceNombre?.trim() || 'Servicio';
        const current = accumulator.get(serviceName) ?? {
          nombre: serviceName,
          usos: 0,
          ingresosMXN: 0
        };
        current.usos += 1;
        if (tx.status === 'completada') {
          current.ingresosMXN += item.precioBaseMXN;
        }
        accumulator.set(serviceName, current);
      });
    });

    return Array.from(accumulator.values())
      .sort((a, b) => b.usos - a.usos || b.ingresosMXN - a.ingresosMXN)
      .slice(0, this.maxTopServices)
      .map((entry) => ({
        nombre: entry.nombre,
        usos: entry.usos,
        ingresosMXN: entry.ingresosMXN
      }));
  }

  private buildRecentTransactionsSummary(
    transactions: Transaction[]
  ): AssistantRecentTransaction[] {
    return [...transactions]
      .sort(
        (a, b) =>
          new Date(b.startAtISO).getTime() - new Date(a.startAtISO).getTime()
      )
      .slice(0, this.maxRecentTransactions)
      .map((tx) => ({
        startAtISO: tx.startAtISO,
        status: tx.status,
        totalMXN: tx.totalMXN,
        ...(tx.paymentMethod ? { paymentMethod: tx.paymentMethod } : {}),
        services: Array.from(
          new Set(
            tx.items
              .map((item) => item.serviceNombre?.trim())
              .filter((name): name is string => Boolean(name))
          )
        )
      }));
  }

  private createUserMessage(content: string): AssistantChatMessage {
    return {
      role: 'user',
      content,
      createdAtISO: new Date().toISOString()
    };
  }

  private createAssistantMessage(content: string): AssistantChatMessage {
    return {
      role: 'assistant',
      content,
      createdAtISO: new Date().toISOString()
    };
  }

  private resolveReply(response: AssistantChatResponse): string {
    if (response.ok && response.reply.trim().length > 0) {
      return response.reply.trim();
    }

    if (!response.ok && response.error.trim().length > 0) {
      throw new Error(response.error.trim());
    }

    throw new Error('No se recibió una respuesta válida del asistente.');
  }

  private createFriendlyFallback(error: unknown): string {
    const detail = this.extractErrorDetail(error);
    if (detail) {
      return `No pude completar la consulta al asistente. ${detail}`;
    }

    return 'No pude conectar con el asistente por ahora. Intenta de nuevo en unos minutos.';
  }

  private extractErrorDetail(error: unknown): string | null {
    if (error instanceof HttpErrorResponse) {
      const backendError = this.extractBackendError(error.error);
      if (backendError) {
        return backendError;
      }

      if (error.status === 0) {
        return 'Revisa tu conexión o la disponibilidad del backend.';
      }

      if (typeof error.message === 'string' && error.message.trim().length > 0) {
        return error.message.trim();
      }
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }

    return null;
  }

  private extractBackendError(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const record = payload as {
      error?: unknown;
      message?: unknown;
    };

    if (typeof record.error === 'string' && record.error.trim().length > 0) {
      return record.error.trim();
    }

    if (typeof record.message === 'string' && record.message.trim().length > 0) {
      return record.message.trim();
    }

    return null;
  }

  private resolveTimezone(): string {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof timezone === 'string' && timezone.trim().length > 0) {
      return timezone;
    }

    return 'America/Mexico_City';
  }

  private toLocalDateISO(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isSameLocalDay(date: Date, reference: Date): boolean {
    return (
      date.getFullYear() === reference.getFullYear() &&
      date.getMonth() === reference.getMonth() &&
      date.getDate() === reference.getDate()
    );
  }
}
