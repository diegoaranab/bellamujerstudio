import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideNoopAnimations()]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the main navigation labels', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

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
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const pageTitle = compiled.querySelector('.page-title')?.textContent ?? '';
    const pageSubtitle = compiled.querySelector('.page-subtitle')?.textContent ?? '';
    const brandName = compiled.querySelector('.brand-name')?.textContent ?? '';

    expect(pageTitle).toContain('Panel Bella Mujer');
    expect(pageSubtitle).toContain('Operación diaria del estudio');
    expect(brandName).toContain('Bella Mujer Studio');
  });
});
