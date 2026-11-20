import { TestBed } from '@angular/core/testing';
import { MemberClubQrComponent } from './member-club-qr.component';

describe('MemberClubQrComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [MemberClubQrComponent] }));

  it('keeps a stable controlled disclosure hidden while closed', () => {
    const fixture = TestBed.createComponent(MemberClubQrComponent);
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector('[data-testid="member-qr-toggle"]') as HTMLButtonElement;
    const disclosure = fixture.nativeElement.querySelector('[data-testid="member-qr-disclosure"]') as HTMLElement;
    expect(fixture.nativeElement.textContent).toContain('Mi QR');
    expect(toggle.textContent).toContain('Ver mi QR');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(disclosure.id);
    expect(disclosure.hidden).toBe(true);
    expect(disclosure.textContent).not.toContain('Código QR');
  });

  it('announces loading and ready states and shows approved guidance without identifier text', () => {
    const fixture = TestBed.createComponent(MemberClubQrComponent);
    fixture.componentRef.setInput('state', 'loading');
    fixture.detectChanges();
    const disclosure = fixture.nativeElement.querySelector('[data-testid="member-qr-disclosure"]') as HTMLElement;
    expect(disclosure.getAttribute('aria-busy')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Cargando tu QR…');
    fixture.componentRef.setInput('state', 'open');
    fixture.componentRef.setInput('image', 'data:image/gif;base64,encoded');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Tu QR está listo.');
    expect(fixture.nativeElement.textContent).toContain('Muéstralo al equipo de Bella Mujer Studio para que identifique tu cuenta.');
    expect(fixture.nativeElement.textContent).toContain('Tu QR no incluye tu nombre ni tu teléfono. Tampoco inicia sesión ni registra una visita.');
    expect(fixture.nativeElement.querySelector('[data-testid="member-qr-image"]')?.getAttribute('alt')).toBe('Código QR para identificar tu cuenta de Bella Mujer Club.');
  });

  it('keeps the disclosure toggle available and exposes retry in the error state', () => {
    const fixture = TestBed.createComponent(MemberClubQrComponent);
    fixture.componentRef.setInput('state', 'error');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="member-qr-toggle"]')?.textContent).toContain('Ocultar mi QR');
    expect(fixture.nativeElement.querySelector('[data-testid="member-qr-retry"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('No pudimos mostrar tu QR.');
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    (fixture.nativeElement.querySelector('[data-testid="member-qr-retry"]') as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('[data-testid="member-qr-toggle"]')).toBe(document.activeElement);
  });
});
