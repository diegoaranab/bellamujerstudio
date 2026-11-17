import { InjectionToken } from '@angular/core';

/**
 * Route-scoped presentation boundary for the Club workbench.
 *
 * The dashboard remains the only state/API owner. Focused workflow components
 * consume its signals and commands through this token; they never fetch or
 * retain a second copy of Club state.
 */
export const CLUB_WORKSPACE_ORCHESTRATOR = new InjectionToken<any>(
  'CLUB_WORKSPACE_ORCHESTRATOR'
);
