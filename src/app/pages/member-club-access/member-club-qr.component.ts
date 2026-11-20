import { Component, ElementRef, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

export type MemberClubQrState = 'closed' | 'loading' | 'open' | 'error';

@Component({
  selector: 'app-member-club-qr',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './member-club-qr.component.html',
  styleUrl: './member-club-qr.component.scss'
})
export class MemberClubQrComponent {
  readonly state = input<MemberClubQrState>('closed');
  readonly image = input<string | null>(null);
  readonly errorMessage = input('No pudimos mostrar tu QR.');
  readonly show = output<void>();
  readonly hide = output<void>();
  readonly retry = output<void>();
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly disclosureId = 'member-qr-disclosure';

  protected retryRequest(): void {
    (this.host.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="member-qr-toggle"]')?.focus();
    this.retry.emit();
  }
}
