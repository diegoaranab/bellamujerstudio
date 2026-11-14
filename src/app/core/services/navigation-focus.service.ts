import { DOCUMENT } from '@angular/common';
import { Injectable, Injector, afterNextRender, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NavigationFocusService {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private hasCompletedInitialNavigation = false;

  initialize(): void {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        if (!this.hasCompletedInitialNavigation) {
          this.hasCompletedInitialNavigation = true;
          return;
        }

        afterNextRender(() => this.focusActiveRouteTarget(), { injector: this.injector });
      });
  }

  focusMain(mainId: string): void {
    this.document.getElementById(mainId)?.focus();
  }

  private focusActiveRouteTarget(): void {
    const main = this.document.querySelector<HTMLElement>('main[data-navigation-focus-main]');
    if (!main) {
      return;
    }

    const heading = main.querySelector<HTMLElement>('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.classList.add('route-focus-target');
      heading.focus();
      return;
    }

    main.focus();
  }
}
