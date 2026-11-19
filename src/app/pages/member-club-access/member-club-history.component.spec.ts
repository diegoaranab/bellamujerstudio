import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { MemberClubHistoryItem } from '../../core/services/member-club-api.client';
import { MemberClubHistoryComponent } from './member-club-history.component';

describe('MemberClubHistoryComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberClubHistoryComponent],
      providers: [provideNoopAnimations()]
    }).compileComponents();
  });

  it('formats member-safe history, signed deltas, singular counts, and dates', () => {
    const fixture = TestBed.createComponent(MemberClubHistoryComponent);
    fixture.componentInstance.items = [
      { occurredAtISO: '2026-11-16T18:30:00.000Z', type: 'STAMP_EARNED', stampDelta: 1, stampCountAfter: 1 },
      { occurredAtISO: '2026-10-22T17:15:00.000Z', type: 'ADMIN_ADJUSTMENT', stampDelta: -2, stampCountAfter: 0 },
      { occurredAtISO: '2026-09-10T12:00:00.000Z', type: 'ELIGIBLE_SPEND_ADDED', stampDelta: 0, stampCountAfter: 2 }
    ];
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Sello ganado');
    expect(element.textContent).toContain('Ajuste de sellos');
    expect(element.textContent).toContain('Actividad registrada');
    expect(element.textContent).toContain('+1 sello');
    expect(element.textContent).toContain('-2 sellos');
    expect(element.textContent).toContain('Ahora tienes 1 sello.');
    expect(element.textContent).toContain('16 nov 2026');
    expect(element.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-16T18:30:00.000Z');
    expect(element.textContent).not.toContain('STAMP_EARNED');
    expect(element.textContent).not.toContain('ELIGIBLE_SPEND_ADDED');
  });

  it('renders loading, empty, initial recovery, and pagination recovery states', () => {
    const assertState = (configure: (component: MemberClubHistoryComponent) => void) => {
      const fixture = TestBed.createComponent(MemberClubHistoryComponent);
      configure(fixture.componentInstance);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };

    expect(assertState((component) => component.isLoading = true)
      .querySelector('[data-testid="member-history-loading"]')).toBeTruthy();
    expect(assertState(() => {})
      .querySelector('[data-testid="member-history-empty"]')).toBeTruthy();
    const recovery = assertState((component) => component.hasLoadError = true);
    expect(recovery.querySelector('[data-testid="member-history-error"]')).toBeTruthy();
    expect(recovery.querySelector('[data-testid="member-history-retry"]')).toBeTruthy();
    expect(assertState((component) => {
      component.hasPaginationError = true;
      component.hasMore = true;
    }).textContent).toContain('No pudimos cargar más movimientos.');
  });

  it('emits narrow retry and load-more intents and announces loading more', () => {
    const item: MemberClubHistoryItem = {
      occurredAtISO: '2026-11-16T18:30:00.000Z', type: 'STAMP_EARNED', stampDelta: 1, stampCountAfter: 1
    };
    const retryFixture = TestBed.createComponent(MemberClubHistoryComponent);
    retryFixture.componentInstance.hasLoadError = true;
    const retry = vi.fn();
    retryFixture.componentInstance.retry.subscribe(retry);
    retryFixture.detectChanges();
    (retryFixture.nativeElement.querySelector('[data-testid="member-history-retry"]') as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalledOnce();

    const loadFixture = TestBed.createComponent(MemberClubHistoryComponent);
    loadFixture.componentInstance.items = [item];
    loadFixture.componentInstance.hasMore = true;
    loadFixture.componentInstance.isLoadingMore = true;
    const loadMore = vi.fn();
    loadFixture.componentInstance.loadMore.subscribe(loadMore);
    loadFixture.detectChanges();
    const button = loadFixture.nativeElement.querySelector('[data-testid="member-history-load-more"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Cargando…');
    const readyFixture = TestBed.createComponent(MemberClubHistoryComponent);
    readyFixture.componentInstance.items = [item];
    readyFixture.componentInstance.hasMore = true;
    readyFixture.componentInstance.loadMore.subscribe(loadMore);
    readyFixture.detectChanges();
    (readyFixture.nativeElement.querySelector('[data-testid="member-history-load-more"]') as HTMLButtonElement).click();
    expect(loadMore).toHaveBeenCalledOnce();
  });
});
