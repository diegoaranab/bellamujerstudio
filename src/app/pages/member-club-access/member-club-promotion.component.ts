import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MemberClubPromotion } from '../../core/services/member-club-api.client';

@Component({
  selector: 'app-member-club-promotion',
  standalone: true,
  templateUrl: './member-club-promotion.component.html',
  styleUrl: './member-club-promotion.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MemberClubPromotionComponent {
  readonly promotion = input<MemberClubPromotion | null>(null);
  readonly loading = input(false);
  readonly error = input('');
  readonly retryPending = input(false);
  readonly retry = output<void>();

  formatDate(iso: string): string {
    const hasSeconds = new Date(iso).getUTCSeconds() !== 0;
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      dateStyle: 'long',
      timeStyle: hasSeconds ? 'medium' : 'short'
    }).format(new Date(iso));
  }
}
