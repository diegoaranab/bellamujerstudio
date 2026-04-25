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
    this.localState.loadState().giftCards
  );

  readonly giftCards$: Observable<GiftCard[]> =
    this.giftCardsSubject.asObservable();
  readonly summary$: Observable<GiftCardSummary> = this.giftCards$.pipe(
    map((giftCards) => calculateGiftCardSummary(giftCards))
  );

  createGiftCard(input: GiftCardCreateInput): GiftCard {
    const now = new Date().toISOString();
    const giftCard: GiftCard = {
      ...input,
      id: this.generateId(),
      folio: input.folio ?? generateGiftCardFolio(),
      createdAtISO: input.createdAtISO ?? now,
      status: input.status ?? 'pendiente'
    };

    this.saveCards([giftCard, ...this.giftCardsSubject.value]);
    return giftCard;
  }

  updateStatus(id: string, status: GiftCardStatus): GiftCard | null {
    return this.updateGiftCard(id, { status });
  }

  updateNotes(id: string, notes: string): GiftCard | null {
    return this.updateGiftCard(id, { notes });
  }

  getSummary(): GiftCardSummary {
    return calculateGiftCardSummary(this.giftCardsSubject.value);
  }

  private updateGiftCard(
    id: string,
    patch: Partial<Pick<GiftCard, 'status' | 'notes'>>
  ): GiftCard | null {
    let updated: GiftCard | null = null;
    const nextCards = this.giftCardsSubject.value.map((giftCard) => {
      if (giftCard.id !== id) {
        return giftCard;
      }

      updated = {
        ...giftCard,
        ...patch,
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
}
