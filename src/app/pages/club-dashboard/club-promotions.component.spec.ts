import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AdminClubApiClient, AdminClubApiError } from '../../core/services/admin-club-api.client';
import { ClubPromotionsComponent, formatPromotionSchedule } from './club-promotions.component';

const promotion = { promotionId: 'private-id', title: 'Título '.repeat(20), description: 'Descripción '.repeat(40), status: 'active' as const, startsAtISO: '2026-11-21T19:05:00.000Z', endsAtISO: '2026-11-30T18:00:00.000Z', createdAtISO: '2026-01-01T00:00:00.000Z', updatedAtISO: '2026-01-02T00:00:00.000Z' };

describe('ClubPromotionsComponent', () => {
  const api = { isConfigured: true, listPromotions: vi.fn(), createPromotion: vi.fn(), updatePromotion: vi.fn(), deletePromotion: vi.fn() };
  function setup() {
    TestBed.configureTestingModule({ imports: [ClubPromotionsComponent], providers: [{ provide: AdminClubApiClient, useValue: api }] });
    const fixture = TestBed.createComponent(ClubPromotionsComponent);
    fixture.detectChanges();
    return fixture;
  }
  beforeEach(() => { api.isConfigured = true; vi.clearAllMocks(); });
  it('loads once, preserves server order and displays only useful fields', () => {
    api.listPromotions.mockReturnValue(of({ items: [promotion, { ...promotion, promotionId: 'other-id', title: 'Segunda', status: 'inactive' }] }));
    const fixture = setup(); const text = fixture.nativeElement.textContent as string;
    expect(api.listPromotions).toHaveBeenCalledTimes(1);
    expect(text.indexOf(promotion.title)).toBeLessThan(text.indexOf('Segunda'));
    expect(text).toContain(promotion.description); expect(text).toContain('Activa'); expect(text).toContain('Inactiva');
    expect(text).toContain(formatPromotionSchedule(promotion.startsAtISO)); expect(text).toContain(formatPromotionSchedule(promotion.endsAtISO));
    expect(text).not.toContain(promotion.promotionId); expect(text).not.toContain(promotion.createdAtISO); expect(text).not.toContain(promotion.updatedAtISO);
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
    expect(api.createPromotion).not.toHaveBeenCalled(); expect(api.updatePromotion).not.toHaveBeenCalled(); expect(api.deletePromotion).not.toHaveBeenCalled();
  });
  it('uses an explicit Mexico City timezone', () => {
    expect(formatPromotionSchedule(promotion.startsAtISO)).toBe(new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(promotion.startsAtISO)));
    expect(formatPromotionSchedule(promotion.startsAtISO)).toContain('13:05');
  });
  it('does not call the API if unconfigured', () => { api.isConfigured = false; setup(); expect(api.listPromotions).not.toHaveBeenCalled(); });
  it('shows loading then empty', () => {
    const response = new Subject<{ items: never[] }>(); api.listPromotions.mockReturnValue(response);
    const fixture = setup(); expect(fixture.nativeElement.textContent).toContain('Cargando promociones');
    response.next({ items: [] }); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Aún no hay promociones');
  });
  it('shows safe errors and retries', () => {
    api.listPromotions.mockReturnValueOnce(throwError(() => new AdminClubApiError('server', 'Error seguro'))).mockReturnValueOnce(of({ items: [promotion] }));
    const fixture = setup(); expect(fixture.nativeElement.textContent).toContain('Error seguro');
    fixture.nativeElement.querySelector('button').click(); fixture.detectChanges();
    expect(api.listPromotions).toHaveBeenCalledTimes(2); expect(fixture.nativeElement.textContent).toContain(promotion.title);
  });
});
