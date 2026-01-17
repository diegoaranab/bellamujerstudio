import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly navItems: NavItem[] = [
    { path: '/inicio', label: 'Inicio', icon: 'dashboard' },
    { path: '/servicios', label: 'Servicios', icon: 'spa' },
    { path: '/clientes', label: 'Clientes', icon: 'groups' },
    { path: '/inventario', label: 'Inventario', icon: 'inventory_2' },
    { path: '/asistente', label: 'Asistente', icon: 'chat' },
    { path: '/configuracion', label: 'Configuración', icon: 'settings' }
  ];
}
