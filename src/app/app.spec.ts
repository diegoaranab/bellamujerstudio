import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';

@Component({
  template: '<p>Ruta de prueba</p>'
})
class TestRouteComponent {}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'inicio', component: TestRouteComponent },
          { path: 'tarjeta-regalo', component: TestRouteComponent },
          { path: 'tarjetas-regalo', component: TestRouteComponent }
        ]),
        provideNoopAnimations()
      ]
    }).compileComponents();
  });

  async function renderAt(path: string) {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(path);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    return fixture;
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the admin shell for an admin route', async () => {
    const fixture = await renderAt('/inicio');

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="admin-shell"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="public-shell"]')).toBeFalsy();
    expect(compiled.querySelector('.page-title')?.textContent).toContain('Panel Bella Mujer');
  });

  it('hides the admin shell for the public gift card route', async () => {
    const fixture = await renderAt('/tarjeta-regalo');

    const compiled = fixture.nativeElement as HTMLElement;
    const text = compiled.textContent ?? '';

    expect(compiled.querySelector('[data-testid="public-shell"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="admin-shell"]')).toBeFalsy();
    expect(text).not.toContain('Panel Bella Mujer');
    expect(text).not.toContain('Nueva cita');
    expect(text).not.toContain('Clientes');
    expect(text).not.toContain('Inventario');
    expect(text).not.toContain('Asistente');
    expect(text).not.toContain('Configuración');
  });

  it('should render the main navigation labels for admin routes', async () => {
    const fixture = await renderAt('/tarjetas-regalo');

    const compiled = fixture.nativeElement as HTMLElement;
    const navText = compiled.textContent ?? '';

    expect(navText).toContain('Inicio');
    expect(navText).toContain('Servicios');
    expect(navText).toContain('Clientes');
    expect(navText).toContain('Inventario');
    expect(navText).toContain('Tarjetas regalo');
    expect(navText).toContain('Asistente');
    expect(navText).toContain('Configuración');
  });

  it('should render the main shell header content', async () => {
    const fixture = await renderAt('/inicio');

    const compiled = fixture.nativeElement as HTMLElement;
    const pageTitle = compiled.querySelector('.page-title')?.textContent ?? '';
    const pageSubtitle = compiled.querySelector('.page-subtitle')?.textContent ?? '';
    const brandName = compiled.querySelector('.brand-name')?.textContent ?? '';

    expect(pageTitle).toContain('Panel Bella Mujer');
    expect(pageSubtitle).toContain('Operación diaria del estudio');
    expect(brandName).toContain('Bella Mujer Studio');
  });
});
