import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AdminClubApiClient, AdminClubApiError } from '../../core/services/admin-club-api.client';
import { CLUB_PROMOTION_ADMIN_CAPABILITIES } from './club-promotion-admin.config';
import { ClubPromotionsComponent, formatPromotionSchedule } from './club-promotions.component';

const promotion = { promotionId: 'private-id', title: 'Título '.repeat(20), description: 'Descripción '.repeat(40), status: 'active' as const, startsAtISO: '2026-11-21T19:05:00.000Z', endsAtISO: '2026-11-30T18:00:00.000Z', createdAtISO: '2026-01-01T00:00:00.000Z', updatedAtISO: '2026-01-02T00:00:00.000Z' };

describe('ClubPromotionsComponent', () => {
  const api = { isConfigured: true, listPromotions: vi.fn(), createPromotion: vi.fn(), updatePromotion: vi.fn(), deletePromotion: vi.fn() };
  function setup(enabled = false) {
    TestBed.configureTestingModule({ imports: [ClubPromotionsComponent], providers: [{ provide: AdminClubApiClient, useValue: api }, { provide: CLUB_PROMOTION_ADMIN_CAPABILITIES, useValue: { mutationsEnabled: enabled } }] });
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


describe('promotion creation', () => {
  const api = { isConfigured: true, listPromotions: vi.fn(), createPromotion: vi.fn() };
  const uuid = '11111111-1111-4111-8111-111111111111';
  function setup(enabled = true) {
    api.listPromotions.mockReturnValue(of({ items: [] }));
    TestBed.configureTestingModule({ imports: [ClubPromotionsComponent], providers: [{ provide: AdminClubApiClient, useValue: api }, { provide: CLUB_PROMOTION_ADMIN_CAPABILITIES, useValue: { mutationsEnabled: enabled } }] });
    const fixture = TestBed.createComponent(ClubPromotionsComponent); fixture.detectChanges(); return fixture;
  }
  function open(fixture: ReturnType<typeof setup>) { fixture.nativeElement.querySelector('button').click(); fixture.detectChanges(); }
  function fill(fixture: ReturnType<typeof setup>) {
    const form = (fixture.componentInstance as any).form;
    form.setValue({ title: 'Título', description: 'Descripción', status: 'active', startsAtLocal: '2026-12-01T10:00', endsAtLocal: '2026-12-02T10:00' });
    return form;
  }
  beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); api.isConfigured = true; });
  it('keeps controls and mutations absent without capability or configuration', () => {
    const fixture = setup(false); expect(fixture.nativeElement.textContent).not.toContain('Nueva promoción'); expect(api.createPromotion).not.toHaveBeenCalled();
  });
  it('hides controls when unconfigured', () => { api.isConfigured = false; const fixture = setup(); expect(fixture.nativeElement.textContent).not.toContain('Nueva promoción'); });
  it('requires explicit status, valid bounded trimmed text and an ordered interval', () => {
    const fixture = setup(); open(fixture); const form = (fixture.componentInstance as any).form;
    expect(form.value.status).toBe(''); expect(form.invalid).toBe(true);
    fill(fixture); expect(form.valid).toBe(true);
    for (const [field, values] of Object.entries({ title: ['', ' x', 'x'.repeat(101)], description: ['', 'x ', 'x'.repeat(501)], startsAtLocal: [''], endsAtLocal: ['', '2026-12-01T10:00'] })) {
      for (const value of values) { fill(fixture); form.controls[field].setValue(value); expect(form.invalid).toBe(true); }
    }
    form.reset(); fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Revisa'); expect(api.createPromotion).not.toHaveBeenCalled();
  });
  for (const kind of ['network', 'server'] as const) it(`retries ${kind} with the same frozen attempt`, () => {
    const response = new Subject<any>(); api.createPromotion.mockReturnValueOnce(response).mockReturnValueOnce(of({}));
    const random = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(uuid);
    const fixture = setup(); open(fixture); fill(fixture); const component = fixture.componentInstance as any;
    component.submit(); component.submit(); expect(api.createPromotion).toHaveBeenCalledTimes(1);
    expect(api.createPromotion).toHaveBeenCalledWith({ title: 'Título', description: 'Descripción', status: 'active', startsAtLocal: '2026-12-01T10:00', endsAtLocal: '2026-12-02T10:00' }, uuid);
    response.error(new AdminClubApiError(kind, 'Error seguro')); fixture.detectChanges();
    expect(component.form.disabled).toBe(true); component.retryCreate();
    expect(api.createPromotion.mock.calls[1]).toEqual(api.createPromotion.mock.calls[0]); expect(random).toHaveBeenCalledTimes(1);
    expect(component.pending()).toBeNull(); expect(component.editorOpen()).toBe(false); expect(api.listPromotions).toHaveBeenCalledTimes(2);
  });
  for (const code of ['VALIDATION_ERROR', 'PROMOTION_CATALOG_FULL', 'IDEMPOTENCY_CONFLICT'] as const) it(`shows safe ${code} error`, () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(uuid);
    api.createPromotion.mockReturnValue(throwError(() => new AdminClubApiError('validation', 'Mensaje seguro', code)));
    const fixture = setup(); open(fixture); fill(fixture); (fixture.componentInstance as any).submit(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Mensaje seguro'); expect((fixture.componentInstance as any).form.enabled).toBe(true);
  });
});
