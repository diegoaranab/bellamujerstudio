import { TestBed } from '@angular/core/testing';
import { MemberClubPromotionComponent } from './member-club-promotion.component';

const promotion = {
  title: '<script>título plano</script>',
  description: 'Primera línea\nSegunda línea',
  startsAtISO: '2026-11-01T15:00:00.000Z',
  endsAtISO: '2026-12-01T15:00:00.000Z'
};

describe('MemberClubPromotionComponent', () => {
  async function create(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [MemberClubPromotionComponent] }).compileComponents();
    const fixture = TestBed.createComponent(MemberClubPromotionComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('shows a compact loading status and no fabricated empty copy', async () => {
    const fixture = await create({ loading: true });
    expect(fixture.nativeElement.textContent).toContain('Cargando promoción…');
    expect(fixture.nativeElement.querySelector('[role="status"]')?.getAttribute('aria-atomic')).toBe('true');
    expect(fixture.nativeElement.querySelector('[data-testid="member-promotion"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toMatch(/no hay promociones|próximamente|sin promociones/i);
  });

  it('renders safe text, semantic headings, exact validity meaning and no CTA', async () => {
    const fixture = await create({ promotion });
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h2')?.textContent).toBe('Promoción');
    expect(element.querySelector('h3')?.textContent).toBe(promotion.title);
    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('.member-promotion__description')?.textContent).toBe(promotion.description);
    expect(getComputedStyle(element.querySelector('.member-promotion__description')!).whiteSpace).toBe('pre-line');
    expect(element.querySelectorAll('time')).toHaveLength(2);
    expect(element.querySelector('time')?.getAttribute('datetime')).toBe(promotion.startsAtISO);
    expect(element.textContent).toContain('Antes de');
    expect(element.textContent).toContain('Hora de Ciudad de México');
    expect(element.textContent).not.toContain('.000');
    expect(element.querySelector('a, button')).toBeNull();
  });

  it('includes seconds only when they carry meaning and emits a local retry', async () => {
    const fixture = await create({
      error: 'No pudimos cargar la promoción. Intenta de nuevo.',
      retryPending: false
    });
    const emitted = vi.fn();
    fixture.componentInstance.retry.subscribe(emitted);
    fixture.detectChanges();
    const retry = fixture.nativeElement.querySelector('[data-testid="member-promotion-retry"]') as HTMLButtonElement;
    expect(retry.textContent).toContain('Intentar de nuevo');
    retry.click();
    expect(emitted).toHaveBeenCalledOnce();
    expect(retry.disabled).toBe(false);

    fixture.componentRef.setInput('retryPending', true);
    fixture.componentRef.setInput('error', '');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    const pendingRetry = fixture.nativeElement.querySelector('[data-testid="member-promotion-retry"]') as HTMLButtonElement;
    expect(pendingRetry).toBeTruthy();
    expect(pendingRetry.disabled).toBe(true);
  });

  it('formats explicitly in Mexico City and omits milliseconds', async () => {
    const fixture = await create({ promotion: { ...promotion, startsAtISO: '2026-11-01T15:00:09.000Z' } });
    const formatted = fixture.componentInstance.formatDate('2026-11-01T15:00:09.000Z');
    expect(formatted).toContain('09');
    expect(formatted).not.toContain('.000');
    expect(formatted).not.toContain('2026-11-01T15:00:09');
    expect(fixture.componentInstance.formatDate(promotion.startsAtISO)).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});
