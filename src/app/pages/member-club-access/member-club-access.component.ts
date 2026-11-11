import { DatePipe, Location } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  MemberClubApiClient,
  MemberClubApiError,
  MemberClubSessionResponse
} from '../../core/services/member-club-api.client';
import { isCanonicalMemberClubCredential } from '../../core/services/member-club-credential';
import { MemberClubSessionService } from '../../core/services/member-club-session.service';

const matchingPinsValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const pin = control.get('pin')?.value;
  const confirmation = control.get('confirmation')?.value;
  return pin && confirmation && pin !== confirmation ? { mismatch: true } : null;
};

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
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(MemberClubApiClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly session = inject(MemberClubSessionService);

  private readonly activationRoute = this.route.snapshot.routeConfig?.path === 'club/activar';
  private invitationToken: string | null = null;
  private activeRequest: Subscription | null = null;
  private throttleTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly accessHandle = signal('');
  protected readonly isEnrollment = signal(false);
  protected readonly hasInvalidActivation = signal(false);
  protected readonly needsPrivateLink = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly isCheckingSession = signal(false);
  protected readonly hasSessionVerificationError = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly loginRetryAfterSeconds = signal(0);
  protected readonly hasUsableLink = computed(() => this.accessHandle().length > 0);

  protected readonly enrollmentForm = new FormGroup(
    {
      pin: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(/^\d{6}$/)]
      }),
      confirmation: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(/^\d{6}$/)]
      })
    },
    { validators: matchingPinsValidator }
  );

  protected readonly loginForm = new FormGroup({
    pin: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d{6}$/)]
    })
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.activeRequest?.unsubscribe();
      this.resetLoginThrottle();
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.applyRouteParameters(params));
  }

  protected enroll(): void {
    const accessHandle = this.accessHandle();
    const invitationToken = this.invitationToken;
    if (this.isSubmitting() || !accessHandle || !invitationToken) return;
    this.errorMessage.set('');
    if (this.enrollmentForm.invalid) {
      this.enrollmentForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.activeRequest = this.api
      .enroll(accessHandle, invitationToken, this.enrollmentForm.getRawValue().pin)
      .subscribe({
        next: (response) => this.establishSession(response, accessHandle),
        error: (error: unknown) => this.handleRequestError(error, 'enrollment')
      });
  }

  protected login(): void {
    const accessHandle = this.accessHandle();
    if (this.isSubmitting() || this.loginRetryAfterSeconds() > 0 || !accessHandle) return;
    this.errorMessage.set('');
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.activeRequest = this.api.login(accessHandle, this.loginForm.getRawValue().pin).subscribe({
      next: (response) => this.establishSession(response, accessHandle),
      error: (error: unknown) => this.handleRequestError(error, 'login')
    });
  }

  protected retrySessionProbe(): void {
    this.probeSession();
  }

  protected logout(): void {
    if (this.isSubmitting()) return;
    const token = this.session.token();
    if (!token) return;

    this.errorMessage.set('');
    this.isSubmitting.set(true);
    this.activeRequest = this.api.logout(token).subscribe({
      next: () => this.finishLogout(),
      error: (error: unknown) => {
        if (error instanceof MemberClubApiError && error.kind === 'authentication') {
          this.finishLogout();
          this.errorMessage.set('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
          return;
        }
        this.isSubmitting.set(false);
        this.errorMessage.set('No pudimos confirmar el cierre de sesión. Intenta nuevamente.');
      }
    });
  }

  private applyRouteParameters(params: ParamMap): void {
    this.activeRequest?.unsubscribe();
    this.activeRequest = null;
    this.resetLoginThrottle();
    this.invitationToken = null;
    this.isEnrollment.set(false);
    this.hasInvalidActivation.set(false);
    this.needsPrivateLink.set(false);
    this.isSubmitting.set(false);
    this.isCheckingSession.set(false);
    this.hasSessionVerificationError.set(false);
    this.errorMessage.set('');
    this.enrollmentForm.reset();
    this.loginForm.reset();

    const access = params.get('access') ?? '';
    const hasValidAccess = isCanonicalMemberClubCredential(access);
    this.accessHandle.set(hasValidAccess ? access : '');

    if (this.activationRoute) {
      if (params.has('invite')) {
        const invitation = params.get('invite') ?? '';
        this.scrubInvitation('/club/activar', hasValidAccess ? access : null);
        if (hasValidAccess && isCanonicalMemberClubCredential(invitation)) {
          this.invitationToken = invitation;
          this.isEnrollment.set(true);
          return;
        }
        this.hasInvalidActivation.set(true);
        return;
      }

      if (hasValidAccess) {
        this.needsPrivateLink.set(true);
      } else {
        this.hasInvalidActivation.set(true);
      }
      return;
    }

    if (params.has('invite')) this.scrubInvitation('/club', hasValidAccess ? access : null);
    if (!hasValidAccess) {
      this.hasInvalidActivation.set(true);
      return;
    }
    this.probeSession();
  }

  private scrubInvitation(path: '/club' | '/club/activar', access: string | null): void {
    this.location.replaceState(path, access ? `access=${encodeURIComponent(access)}` : '');
  }

  private probeSession(): void {
    const token = this.session.token();
    if (!token) {
      this.isCheckingSession.set(false);
      this.hasSessionVerificationError.set(false);
      return;
    }
    if (this.session.isExpired()) {
      this.session.clear();
      this.isCheckingSession.set(false);
      return;
    }

    this.errorMessage.set('');
    this.hasSessionVerificationError.set(false);
    this.isCheckingSession.set(true);
    this.activeRequest = this.api.checkSession(token).subscribe({
      next: () => this.isCheckingSession.set(false),
      error: (error: unknown) => {
        this.isCheckingSession.set(false);
        if (error instanceof MemberClubApiError && error.kind === 'authentication') {
          this.session.clear();
          this.errorMessage.set('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
          return;
        }
        this.hasSessionVerificationError.set(true);
        this.errorMessage.set('No pudimos verificar tu sesión.');
      }
    });
  }

  private establishSession(response: MemberClubSessionResponse, accessHandle: string): void {
    if (!this.session.establish(response.session)) {
      this.handleRequestError(
        new MemberClubApiError(
          'server',
          'No fue posible procesar la solicitud del Club. Intenta de nuevo.'
        ),
        'session'
      );
      return;
    }

    this.resetLoginThrottle();
    this.invitationToken = null;
    this.isEnrollment.set(false);
    this.hasInvalidActivation.set(false);
    this.needsPrivateLink.set(false);
    this.enrollmentForm.reset();
    this.loginForm.reset();
    this.isSubmitting.set(false);
    void this.router.navigate(['/club'], {
      queryParams: { access: accessHandle },
      replaceUrl: true
    });
  }

  private finishLogout(): void {
    this.session.clear();
    this.isSubmitting.set(false);
  }

  private handleRequestError(
    error: unknown,
    context: 'enrollment' | 'login' | 'session'
  ): void {
    if (error instanceof MemberClubApiError) {
      this.errorMessage.set(error.message);
      if (context === 'enrollment' && error.kind === 'invitation') {
        this.invitationToken = null;
        this.isEnrollment.set(false);
        this.hasInvalidActivation.set(true);
      }
      if (context === 'login' && error.kind === 'authentication') {
        this.loginForm.controls.pin.reset();
      }
      if (context === 'login' && error.kind === 'throttled') {
        this.startLoginThrottle(error.retryAfterSeconds ?? 60);
        this.errorMessage.set('');
      }
    } else {
      this.errorMessage.set('No fue posible procesar la solicitud del Club. Intenta de nuevo.');
    }
    this.isSubmitting.set(false);
  }

  private startLoginThrottle(seconds: number): void {
    this.resetLoginThrottle();
    this.loginRetryAfterSeconds.set(seconds);
    this.throttleTimer = setInterval(() => {
      const remaining = this.loginRetryAfterSeconds() - 1;
      this.loginRetryAfterSeconds.set(Math.max(0, remaining));
      if (remaining <= 0) this.resetLoginThrottle();
    }, 1000);
  }

  private resetLoginThrottle(): void {
    if (this.throttleTimer !== null) {
      clearInterval(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.loginRetryAfterSeconds.set(0);
  }
}
