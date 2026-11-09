import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { DbFacadeService } from '../../core/services/db-facade.service';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: DbFacadeService,
          useValue: {
            services$: of({ services: [] }),
            inventory$: of({ materials: [] }),
            clients$: of({ clients: [] }),
            overhead$: of({ gastosFijosPorHoraMXN: 0 }),
            transactions$: of([]),
            updateTransactionStatus: vi.fn()
          }
        }
      ]
    }).compileComponents();
  });

  it('renders the Club preview entry with a link to the admin Club route', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const card = element.querySelector('[data-testid="club-preview-card"]');
    const link = card?.querySelector('a');

    expect(card?.textContent).toContain('Bella Mujer Club');
    expect(card?.textContent).toContain('Programa de fidelidad');
    expect(card?.textContent).toContain('Vista previa');
    expect(link?.textContent).toContain('Explorar Club');
    expect(link?.getAttribute('href')).toBe('/admin/club');
  });
});
