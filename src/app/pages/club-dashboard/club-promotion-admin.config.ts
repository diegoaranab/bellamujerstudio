import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface ClubPromotionAdminCapabilities { mutationsEnabled: boolean; }
export const CLUB_PROMOTION_ADMIN_CAPABILITIES = new InjectionToken<ClubPromotionAdminCapabilities>(
  'Club promotion admin capabilities',
  { providedIn: 'root', factory: () => ({ mutationsEnabled: environment.clubPromotionMutationsEnabled }) }
);
