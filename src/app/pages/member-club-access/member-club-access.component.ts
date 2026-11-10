import { DatePipe, Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute } from '@angular/router';

import {
  MemberClubApiClient,
  MemberClubApiError,
  MemberClubSessionResponse
} from '../../core/services/member-club-api.client';
import { MemberClubSessionService } from '../../core/services/member-club-session.service';

@Component({
  selector: 'app-member-club-access',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule
  ],
  templateUrl: './member-club-access.component.html',
  styleUrl: './member-club-access.component.scss'
})
export class MemberClubAccessComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly api = inject(MemberClubApiClient);
  protected readonly session = inject(MemberClubSessionService);

  private invitationToken: string | null = this.route.snapshot.queryParamMap.get('invite');
  protected readonly accessHandle = this.route.snapshot.queryParamMap.get('access')?.trim() ?? '';
  protected readonly isEnrollment = signal(
    this.invitationToken !== null && this.invitationToken.length > 0
  );
  protected readonly hasInvalidActivation = signal(
    this.invitationToken !== null && this.invitationToken.length === 0
  );
  protected readonly isSubmitting = signal(false);
  protected readonly isCheckingSession = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly hasUsableLink = computed(() => this.accessHandle.length > 0);

  protected readonly enrollmentForm = new FormGroup({
    pin: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d{6}$/)]
    }),
    confirmation: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d{6}$/)]
    })
  });

  protected readonly loginForm = new FormGroup({
    pin: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d{6}$/)]
    })
  });

  constructor() {
    if (this.invitationToken !== null) {
      const query = this.accessHandle ? `access=${encodeURIComponent(this.accessHandle)}` : '';
      this.location.replaceState('/club/activar', query);
    }
  }

  ngOnInit(): void {
    const token = this.session.token();
    if (!token) return;
    if (this.session.isExpired()) {
      this.session.clear();
      return;
    }

    this.isCheckingSession.set(true);
    this.api.checkSession(token).subscribe({
      next: () => this.isCheckingSession.set(false),
      error: () => {
        this.session.clear();
        this.isCheckingSession.set(false);
        this.errorMessage.set('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
      }
    });
  }

  protected enroll(): void {
    if (this.isSubmitting() || !this.hasUsableLink() || !this.invitationToken) return;
    this.errorMessage.set('');
    if (this.enrollmentForm.invalid) {
      this.enrollmentForm.markAllAsTouched();
      return;
    }
    const { pin, confirmation } = this.enrollmentForm.getRawValue();
    if (pin !== confirmation) {
      this.enrollmentForm.controls.confirmation.setErrors({ mismatch: true });
      return;
    }

    this.isSubmitting.set(true);
    this.api.enroll(this.accessHandle, this.invitationToken, pin).subscribe({
      next: (response) => this.establishSession(response),
      error: (error: unknown) => this.handleError(error)
    });
  }

  protected login(): void {
    if (this.isSubmitting() || !this.hasUsableLink()) return;
    this.errorMessage.set('');
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.api.login(this.accessHandle, this.loginForm.getRawValue().pin).subscribe({
      next: (response) => this.establishSession(response),
      error: (error: unknown) => this.handleError(error)
    });
  }

  protected logout(): void {
    if (this.isSubmitting()) return;
    const token = this.session.token();
    if (!token) return;

    this.errorMessage.set('');
    this.isSubmitting.set(true);
    this.api.logout(token).subscribe({
      next: () => this.finishLogout(),
      error: () => {
        this.finishLogout();
        this.errorMessage.set(
          'La sesión se cerró en este dispositivo, pero no pudimos confirmarlo con el servidor.'
        );
      }
    });
  }

  private establishSession(response: MemberClubSessionResponse): void {
    this.session.establish(response.session);
    this.invitationToken = null;
    this.isEnrollment.set(false);
    this.hasInvalidActivation.set(false);
    this.enrollmentForm.reset();
    this.loginForm.reset();
    this.isSubmitting.set(false);
  }

  private finishLogout(): void {
    this.session.clear();
    this.isSubmitting.set(false);
  }

  private handleError(error: unknown): void {
    this.errorMessage.set(
      error instanceof MemberClubApiError
        ? error.message
        : 'No fue posible procesar la solicitud del Club. Intenta de nuevo.'
    );
    this.isSubmitting.set(false);
  }
}
