import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { RouteSeoMetadata } from '../constants/seo.constants';

@Injectable({
  providedIn: 'root'
})
export class RouteMetadataService {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private initialized = false;

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.applyRouteMetadata();
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.applyRouteMetadata());
  }

  private applyRouteMetadata(): void {
    const metadata = this.findDeepestRouteMetadata();

    if (!metadata) {
      return;
    }

    this.title.setTitle(metadata.title);
    this.meta.updateTag({ name: 'description', content: metadata.description });
  }

  private findDeepestRouteMetadata(): RouteSeoMetadata | undefined {
    let route = this.activatedRoute;

    while (route.firstChild) {
      route = route.firstChild;
    }

    return route.snapshot.data['seo'] as RouteSeoMetadata | undefined;
  }
}
