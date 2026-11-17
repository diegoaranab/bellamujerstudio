import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

export const CLUB_WORKSPACE_SUBVIEWS = [
  'resumen',
  'visita',
  'historial',
  'acceso'
] as const;

export type ClubWorkspaceSubview = (typeof CLUB_WORKSPACE_SUBVIEWS)[number];

/**
 * The small, route-scoped seam between Club route containers and its shared
 * orchestration component.  It deliberately stores identifiers only: a
 * directory filter can contain PII and must never be reflected into a URL.
 *
 * It is provided by the `/admin/club` route, giving a fresh instance for each
 * Club visit and releasing it as soon as that route is left.
 */
@Injectable()
export class ClubRouteContext {
  private readonly router = inject(Router, { optional: true });

  readonly selectedClientId = signal<string | null>(null);
  readonly workspaceSubview = signal<ClubWorkspaceSubview>('resumen');

  sync(clientId: string | null, subview: ClubWorkspaceSubview = 'resumen'): void {
    this.selectedClientId.set(clientId);
    this.workspaceSubview.set(subview);
  }

  navigateToClient(clientId: string, subview: ClubWorkspaceSubview = 'resumen'): void {
    void this.router?.navigate(['/admin/club/clientas', clientId, subview]);
  }

  navigateToDirectory(): void {
    void this.router?.navigate(['/admin/club/clientas']);
  }
}
