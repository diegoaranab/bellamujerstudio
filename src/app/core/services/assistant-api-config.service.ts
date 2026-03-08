import { Injectable } from '@angular/core';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AssistantApiConfigService {
  readonly baseUrl = environment.assistantApiBaseUrl;
  readonly assistantEndpoint = this.buildUrl('/assistant');

  buildUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl.replace(/\/+$/, '')}${normalizedPath}`;
  }
}
