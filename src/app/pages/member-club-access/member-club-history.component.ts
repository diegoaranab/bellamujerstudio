import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { MemberClubHistoryItem } from '../../core/services/member-club-api.client';

@Component({
  selector: 'app-member-club-history',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './member-club-history.component.html',
  styleUrl: './member-club-history.component.scss'
})
export class MemberClubHistoryComponent {
  @Input() items: MemberClubHistoryItem[] = [];
  @Input() isLoading = false;
  @Input() isLoadingMore = false;
  @Input() hasLoadError = false;
  @Input() hasPaginationError = false;
  @Input() hasMore = false;

  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly loadMore = new EventEmitter<void>();

  protected historyLabel(item: MemberClubHistoryItem): string {
    switch (item.type) {
      case 'STAMP_EARNED': return 'Sello ganado';
      case 'ADMIN_ADJUSTMENT': return 'Ajuste de sellos';
      default: return 'Actividad registrada';
    }
  }

  protected stampDeltaLabel(delta: number): string | null {
    if (delta === 0) return null;
    return `${delta > 0 ? '+' : ''}${delta} ${Math.abs(delta) === 1 ? 'sello' : 'sellos'}`;
  }

  protected stampCountLabel(count: number): string {
    return `Ahora tienes ${count} ${count === 1 ? 'sello.' : 'sellos.'}`;
  }

  protected historyDate(occurredAtISO: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(occurredAtISO)).replace('.', '');
  }
}
