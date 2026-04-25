import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map } from 'rxjs';

import {
  GiftCard,
  GiftCardCreateInput,
  GiftCardStatus,
  GiftCardSummary
} from '../models';
import { LocalStateService } from './local-state.service';
import {
  calculateGiftCardSummary,
  generateGiftCardFolio
} from './gift-card.utils';

@Injectable({
  providedIn: 'root'
})
export class GiftCardService {
  private readonly localState = inject(LocalStateService);
  private readonly giftCardsSubject = new BehaviorSubject<GiftCard[]>(
    this.normalizeGiftCards(this.localState.loadState().giftCards)
  );

  readonly giftCards$: Observable<GiftCard[]> =
    this.giftCardsSubject.asObservable();
  readonly summary$: Observable<GiftCardSummary> = this.giftCards$.pipe(
    map((giftCards) => calculateGiftCardSummary(giftCards))
  );

  createGiftCard(input: GiftCardCreateInput): GiftCard {
    const now = new Date().toISOString();
    const status = input.status ?? 'pendiente';
    const giftCard: GiftCard = {
      ...input,
      ...this.buildStatusTimestampPatch(status, input, now),
      id: this.generateId(),
      folio: input.folio ?? generateGiftCardFolio(),
      createdAtISO: input.createdAtISO ?? now,
      status
    };

    this.saveCards([giftCard, ...this.giftCardsSubject.value]);
    return giftCard;
  }

  updateStatus(id: string, status: GiftCardStatus): GiftCard | null {
    return this.updateGiftCard(id, (giftCard) => {
      const now = new Date().toISOString();
      return {
        status,
        ...this.buildStatusTimestampPatch(status, giftCard, now)
      };
    });
  }

  updateNotes(id: string, notes: string): GiftCard | null {
    return this.updateGiftCard(id, () => ({ notes }));
  }

  getSummary(): GiftCardSummary {
    return calculateGiftCardSummary(this.giftCardsSubject.value);
  }

  getGiftCardById(id: string): GiftCard | null {
    return this.giftCardsSubject.value.find((giftCard) => giftCard.id === id) ?? null;
  }

  private updateGiftCard(
    id: string,
    patchFactory: (giftCard: GiftCard) => Partial<GiftCard>
  ): GiftCard | null {
    let updated: GiftCard | null = null;
    const nextCards = this.giftCardsSubject.value.map((giftCard) => {
      if (giftCard.id !== id) {
        return giftCard;
      }

      updated = {
        ...giftCard,
        ...patchFactory(giftCard),
        updatedAtISO: new Date().toISOString()
      };
      return updated;
    });

    if (!updated) {
      return null;
    }

    this.saveCards(nextCards);
    return updated;
  }

  private saveCards(giftCards: GiftCard[]): void {
    const state = this.localState.loadState();
    this.localState.saveState({
      ...state,
      giftCards
    });
    this.giftCardsSubject.next(giftCards);
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `gc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private normalizeGiftCards(giftCards: GiftCard[]): GiftCard[] {
    return giftCards.map((giftCard) => ({ ...giftCard }));
  }

  private buildStatusTimestampPatch(
    status: GiftCardStatus,
    giftCard: Partial<GiftCard>,
    timestampISO: string
  ): Partial<GiftCard> {
    return {
      ...(status === 'pagada' && !giftCard.confirmedAtISO
        ? { confirmedAtISO: timestampISO }
        : {}),
      ...(status === 'entregada' && !giftCard.deliveredAtISO
        ? { deliveredAtISO: timestampISO }
        : {}),
      ...(status === 'usada' && !giftCard.usedAtISO
        ? { usedAtISO: timestampISO }
        : {})
    };
  }
}
