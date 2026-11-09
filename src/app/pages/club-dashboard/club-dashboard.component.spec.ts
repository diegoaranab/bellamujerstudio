import { TestBed } from '@angular/core/testing';

import { ClubDashboardComponent } from './club-dashboard.component';

describe('ClubDashboardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClubDashboardComponent]
    }).compileComponents();
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(ClubDashboardComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the Bella Mujer Club preview heading and demonstration warning', () => {
    const element = render();
    const h1 = element.querySelector('h1');
    const notice = element.querySelector('[data-testid="club-preview-notice"]');

    expect(h1?.textContent).toContain('Bella Mujer Club');
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(notice?.textContent).toContain('Datos de demostración');
    expect(notice?.textContent).toContain('no registra ni modifica información real');
  });

  it('renders clearly labeled demonstration metrics', () => {
    const metrics = render().querySelector('[data-testid="club-demo-metrics"]');

    expect(metrics?.textContent).toContain('Clientas Club');
    expect(metrics?.textContent).toContain('Visitas del mes');
    expect(metrics?.textContent).toContain('Sellos otorgados');
    expect(metrics?.textContent).toContain('Saldo elegible acumulado');
    expect(metrics?.querySelectorAll('.metric-card')).toHaveLength(4);
    expect(metrics?.querySelectorAll('.metric-card__detail')[0]?.textContent).toContain(
      'Dato de demostración'
    );
  });

  it('shows accumulated stamps without presenting a four-stamp reward target', () => {
    const text = render().textContent ?? '';

    expect(text).toContain('3 sellos acumulados');
    expect(text).not.toContain('3 de 4');
    expect(text).not.toContain('4 sellos');
    expect(text).not.toContain('$80');
    expect(text).not.toContain('$120');
  });

  it('uses fictional demonstration identities without contact PII', () => {
    const clients = render().querySelector('[data-testid="club-demo-clients"]');
    const text = clients?.textContent ?? '';

    expect(text).toContain('Clienta demo A');
    expect(text).toContain('Clienta demo B');
    expect(text).toContain('Clienta demo C');
    expect(text).not.toMatch(/\b\d{10}\b/);
    expect(text).not.toContain('@');
  });

  it('renders future areas as noninteractive cards', () => {
    const futureAreas = render().querySelector('[data-testid="club-future-areas"]');

    expect(futureAreas?.textContent).toContain('Clientas');
    expect(futureAreas?.textContent).toContain('Visitas');
    expect(futureAreas?.textContent).toContain('Promociones');
    expect(futureAreas?.textContent).toContain('Recompensas');
    expect(futureAreas?.textContent).toContain('Próxima fase');
    expect(futureAreas?.querySelectorAll('button, a')).toHaveLength(0);
  });
});
