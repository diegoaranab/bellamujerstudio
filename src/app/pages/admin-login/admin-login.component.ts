import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService, normalizeAdminReturnUrl } from '../../core/auth/auth.service';

@Component({
  selector: 'app-admin-login',
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.scss'
})
export class AdminLoginComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly returnUrl = normalizeAdminReturnUrl(
    this.route.snapshot.queryParamMap.get('returnUrl')
  );

  async continue(): Promise<void> {
    if (this.auth.mode === 'local' || this.auth.isAuthenticated()) {
      await this.router.navigateByUrl(this.returnUrl);
      return;
    }

    await this.auth.login(this.returnUrl);
  }
}
