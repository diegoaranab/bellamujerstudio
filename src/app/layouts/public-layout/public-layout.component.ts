import { DOCUMENT } from '@angular/common';
import { Component, Injector, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { buildBellaMujerWhatsAppUrl } from '../../core/constants/contact.constants';
import { NavigationFocusService } from '../../core/services/navigation-focus.service';

@Component({
  selector: 'app-public-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss'
})
export class PublicLayoutComponent {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  constructor(private readonly navigationFocus: NavigationFocusService) {}

  protected readonly isMenuOpen = signal(false);

  protected readonly whatsappUrl = buildBellaMujerWhatsAppUrl(
    'Hola Bella Mujer Studio, quiero pedir información para agendar una cita.'
  );

  protected skipToMain(): void {
    this.navigationFocus.focusMain('public-main');
  }

  protected toggleMenu(): void {
    if (this.isMenuOpen()) {
      this.closeMenu(true);
      return;
    }

    this.isMenuOpen.set(true);
    afterNextRender(() => this.focusFirstRouteLink(), { injector: this.injector });
  }

  protected closeMenu(returnFocusToToggle = false): void {
    this.isMenuOpen.set(false);

    if (returnFocusToToggle) {
      afterNextRender(() => this.focusMenuToggle(), { injector: this.injector });
    }
  }

  private focusFirstRouteLink(): void {
    this.document.querySelector<HTMLElement>('[data-testid="public-nav-home-link"]')?.focus();
  }

  private focusMenuToggle(): void {
    this.document.querySelector<HTMLElement>('[data-testid="public-menu-toggle"]')?.focus();
  }
}
