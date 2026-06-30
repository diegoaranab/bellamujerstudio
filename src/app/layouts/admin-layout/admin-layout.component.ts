import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { NuevaCitaDialogComponent } from '../../shared/dialogs/nueva-cita-dialog/nueva-cita-dialog.component';

interface NavItem {
  path: string;
  label: string;
  icon: string;
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
    MatListModule
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent {
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);

  protected readonly navItems: NavItem[] = [
    { path: '/admin/inicio', label: 'Inicio', icon: 'dashboard' },
    { path: '/admin/servicios', label: 'Servicios', icon: 'spa' },
    { path: '/admin/clientes', label: 'Clientes', icon: 'groups' },
    { path: '/admin/inventario', label: 'Inventario', icon: 'inventory_2' },
    {
      path: '/admin/tarjetas-regalo',
      label: 'Tarjetas regalo',
      icon: 'card_giftcard'
    },
    { path: '/admin/asistente', label: 'Asistente', icon: 'chat' },
    { path: '/admin/configuracion', label: 'Configuración', icon: 'settings' }
  ];

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
}
