import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminClubApiClient, AdminClubApiError, AdminClubPromotion } from '../../core/services/admin-club-api.client';

const scheduleFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function formatPromotionSchedule(utcISO: string): string {
  return scheduleFormatter.format(new Date(utcISO));
}

@Component({
  selector: 'app-club-promotions',
  templateUrl: './club-promotions.component.html',
  styleUrl: './club-promotions.component.scss'
})
export class ClubPromotionsComponent {
  private readonly api = inject(AdminClubApiClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly configured = this.api.isConfigured;
  protected readonly state = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  protected readonly items = signal<AdminClubPromotion[]>([]);
  protected readonly errorMessage = signal('');
  protected readonly formatSchedule = formatPromotionSchedule;

  constructor() {
    if (this.configured) this.load();
  }

  protected load(): void {
    if (!this.configured || (this.state() === 'loading' && this.inFlight)) return;
    this.inFlight = true;
    this.state.set('loading');
    this.items.set([]);
    this.api.listPromotions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ items }) => {
        this.inFlight = false;
        this.items.set(items);
        this.state.set(items.length ? 'ready' : 'empty');
      },
      error: (error: unknown) => {
        this.inFlight = false;
        this.items.set([]);
        this.errorMessage.set(error instanceof AdminClubApiError ? error.message : 'No fue posible cargar las promociones. Intenta de nuevo.');
        this.state.set('error');
      }
    });
  }
  private inFlight = false;
}
