import { DOCUMENT } from '@angular/common';
import { Component, Injector, afterNextRender, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, UrlTree } from '@angular/router';

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
  private readonly router = inject(Router);

  constructor(private readonly navigationFocus: NavigationFocusService) {}

  protected readonly isMenuOpen = signal(false);

  protected readonly homeUrl = this.router.createUrlTree(['/']);
  protected readonly servicesUrl = this.router.createUrlTree(['/servicios']);
  protected readonly galleryUrl = this.router.createUrlTree(['/galeria']);
  protected readonly contactUrl = this.router.createUrlTree(['/contacto']);
  protected readonly giftCardUrl = this.router.createUrlTree(['/tarjeta-regalo']);

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

  protected closeMenuForNavigation(targetUrl: UrlTree): void {
    this.closeMenu(this.router.serializeUrl(targetUrl) === this.router.url);
  }

  private focusFirstRouteLink(): void {
    this.document.querySelector<HTMLElement>('[data-testid="public-nav-home-link"]')?.focus();
  }

  private focusMenuToggle(): void {
    this.document.querySelector<HTMLElement>('[data-testid="public-menu-toggle"]')?.focus();
  }
}
