import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { NuevaCitaDialogComponent } from '../../shared/dialogs/nueva-cita-dialog/nueva-cita-dialog.component';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  mobileLabel?: string;
  mobilePlacement?: 'primary' | 'more';
}

@Component({
  selector: 'app-admin-layout',
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    MatMenuModule
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent {
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly navItems: NavItem[] = [
    {
      path: '/admin/inicio',
      label: 'Inicio',
      icon: 'dashboard',
      mobilePlacement: 'primary'
    },
    {
      path: '/admin/servicios',
      label: 'Servicios',
      icon: 'spa',
      mobilePlacement: 'more'
    },
    {
      path: '/admin/clientes',
      label: 'Clientes',
      icon: 'groups',
      mobilePlacement: 'primary'
    },
    {
      path: '/admin/inventario',
      label: 'Inventario',
      icon: 'inventory_2',
      mobilePlacement: 'more'
    },
    {
      path: '/admin/tarjetas-regalo',
      label: 'Tarjetas regalo',
      icon: 'card_giftcard',
      mobilePlacement: 'more'
    },
    {
      path: '/admin/club',
      label: 'Bella Mujer Club',
      icon: 'loyalty',
      mobileLabel: 'Club',
      mobilePlacement: 'primary'
    },
    {
      path: '/admin/asistente',
      label: 'Asistente',
      icon: 'chat',
      mobilePlacement: 'more'
    },
    {
      path: '/admin/configuracion',
      label: 'Configuración',
      icon: 'settings',
      mobilePlacement: 'more'
    }
  ];

  protected readonly mobilePrimaryNavItems = this.navItems.filter(
    (item) => item.mobilePlacement === 'primary'
  );

  protected readonly mobileMoreNavItems = this.navItems.filter(
    (item) => item.mobilePlacement === 'more'
  );

  protected isMoreActive(): boolean {
    const currentPath = this.router.url.split(/[?#]/, 1)[0];
    return this.mobileMoreNavItems.some(
      (item) => currentPath === item.path || currentPath.startsWith(`${item.path}/`)
    );
  }

  openNuevaCita(): void {
    const isHandset = this.breakpointObserver.isMatched(Breakpoints.Handset);
    this.dialog.open(NuevaCitaDialogComponent, {
      width: isHandset ? '100vw' : '720px',
      maxWidth: isHandset ? '100vw' : '95vw',
      height: isHandset ? '100vh' : undefined,
      maxHeight: isHandset ? '100vh' : '90vh',
      panelClass: isHandset ? 'bm-dialog-fullscreen' : undefined
    });
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    if (!this.auth.isCognitoMode || this.auth.errorMessage()) {
      await this.router.navigate(['/admin/login']);
    }
  }
}
