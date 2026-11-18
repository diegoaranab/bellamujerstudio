import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
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
  MemberClubSelfSummary,
  MemberClubSessionResponse
} from '../../core/services/member-club-api.client';
import { buildBellaMujerWhatsAppUrl } from '../../core/constants/contact.constants';
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
  private readonly api = inject(MemberClubApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  protected readonly session = inject(MemberClubSessionService);

  private readonly activationRoute = this.route.snapshot.routeConfig?.path === 'club/activar';
  private invitationToken: string | null = null;
  private pendingActivationScrubAccess: string | null | undefined;
  private activeRequest: Subscription | null = null;
  private summaryRequest: Subscription | null = null;
  private summaryRequestToken: string | null = null;
  private observedSessionToken: string | null | undefined = undefined;
  private throttleTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly accessHandle = signal('');
  protected readonly isEnrollment = signal(false);
  protected readonly hasInvalidActivation = signal(false);
  protected readonly needsPrivateLink = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly isLoadingSummary = signal(false);
  protected readonly hasSummaryLoadError = signal(false);
  protected readonly memberSummary = signal<MemberClubSelfSummary | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly loginRetryAfterSeconds = signal(0);
  protected readonly hasUsableLink = computed(() => this.accessHandle().length > 0);
  protected readonly isNipVisible = signal(false);
  protected readonly recoveryWhatsAppUrl = buildBellaMujerWhatsAppUrl(
    'Hola, Bella Mujer. Necesito ayuda para recuperar mi acceso a Bella Mujer Club. ¿Me pueden enviar un nuevo enlace privado?'
  );

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
    effect(
      () => this.handleSessionTransition(this.session.token()),
      { injector: this.injector }
    );
    this.destroyRef.onDestroy(() => {
      this.activeRequest?.unsubscribe();
      this.summaryRequest?.unsubscribe();
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
      this.focusFirstInvalidEnrollmentField();
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
      this.focusInput('member-login-pin');
      return;
    }

    this.isSubmitting.set(true);
    this.activeRequest = this.api.login(accessHandle, this.loginForm.getRawValue().pin).subscribe({
      next: (response) => this.establishSession(response, accessHandle),
      error: (error: unknown) => this.handleRequestError(error, 'login')
    });
  }

  protected retrySummary(): void {
    this.loadSummary();
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

  protected toggleNipVisibility(): void {
    this.isNipVisible.update((isVisible) => !isVisible);
  }

  private applyRouteParameters(params: ParamMap): void {
    this.concealNip();
    const access = params.get('access') ?? '';
    const hasValidAccess = isCanonicalMemberClubCredential(access);
    if (
      this.activationRoute &&
      !params.has('invite') &&
      this.pendingActivationScrubAccess !== undefined &&
      this.pendingActivationScrubAccess === (hasValidAccess ? access : null)
    ) {
      this.pendingActivationScrubAccess = undefined;
      return;
    }
    if (!this.activationRoute && params.has('invite')) {
      void this.scrubInvitation('/club', hasValidAccess ? access : null);
    }
    if (
      !this.activationRoute &&
      hasValidAccess &&
      access === this.accessHandle() &&
      this.isLoadingSummary()
    ) {
      return;
    }

    this.pendingActivationScrubAccess = undefined;
    this.activeRequest?.unsubscribe();
    this.activeRequest = null;
    this.clearSummaryState();
    this.resetLoginThrottle();
    this.invitationToken = null;
    this.isEnrollment.set(false);
    this.hasInvalidActivation.set(false);
    this.needsPrivateLink.set(false);
    this.isSubmitting.set(false);
    this.errorMessage.set('');
    this.enrollmentForm.reset();
    this.loginForm.reset();

    this.accessHandle.set(hasValidAccess ? access : '');

    if (this.activationRoute) {
      if (params.has('invite')) {
        const invitation = params.get('invite') ?? '';
        if (hasValidAccess && isCanonicalMemberClubCredential(invitation)) {
          this.invitationToken = invitation;
          this.isEnrollment.set(true);
          this.scrubActivationInvitation(access);
          return;
        }
        this.hasInvalidActivation.set(true);
        this.scrubActivationInvitation(hasValidAccess ? access : null);
        return;
      }

      if (hasValidAccess) {
        this.needsPrivateLink.set(true);
      } else {
        this.hasInvalidActivation.set(true);
      }
      return;
    }

    if (!hasValidAccess) {
      this.hasInvalidActivation.set(true);
      return;
    }
    this.loadSummary();
  }

  private scrubActivationInvitation(access: string | null): void {
    this.pendingActivationScrubAccess = access;
    const clearPendingScrub = () => {
      if (this.pendingActivationScrubAccess === access) {
        this.pendingActivationScrubAccess = undefined;
      }
    };
    void this.scrubInvitation('/club/activar', access).then(clearPendingScrub, clearPendingScrub);
  }

  private scrubInvitation(path: '/club' | '/club/activar', access: string | null): Promise<boolean> {
    return this.router.navigate([path], {
      queryParams: access ? { access } : undefined,
      replaceUrl: true
    });
  }

  private loadSummary(): void {
    const token = this.session.token();
    if (!token) {
      this.clearSummaryState();
      return;
    }
    if (this.session.isExpired()) {
      this.session.clear();
      return;
    }
    if (this.isLoadingSummary()) return;

    this.errorMessage.set('');
    this.hasSummaryLoadError.set(false);
    this.memberSummary.set(null);
    this.isLoadingSummary.set(true);
    this.summaryRequestToken = token;
    this.summaryRequest = this.api.getSelfSummary(token).subscribe({
      next: (summary) => {
        if (!this.isCurrentSummaryRequest(token)) return;
        this.memberSummary.set(summary);
        this.isLoadingSummary.set(false);
        this.summaryRequest = null;
      },
      error: (error: unknown) => {
        if (!this.isCurrentSummaryRequest(token)) return;
        this.isLoadingSummary.set(false);
        this.summaryRequest = null;
        if (error instanceof MemberClubApiError && error.kind === 'authentication') {
          this.session.clear();
          this.memberSummary.set(null);
          this.errorMessage.set('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
          return;
        }
        this.hasSummaryLoadError.set(true);
      }
    });
  }

  private establishSession(response: MemberClubSessionResponse, accessHandle: string): void {
    this.concealNip();
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
    this.loadSummary();
    void this.router.navigate(['/club'], {
      queryParams: { access: accessHandle },
      replaceUrl: true
    });
  }

  private finishLogout(): void {
    this.concealNip();
    this.session.clear();
    this.isSubmitting.set(false);
  }

  private handleSessionTransition(token: string | null): void {
    const previousToken = this.observedSessionToken;
    if (previousToken === token) return;
    this.observedSessionToken = token;

    if (!token) {
      this.clearSummaryState();
      this.isSubmitting.set(false);
      return;
    }

    if (previousToken && previousToken !== token) {
      this.clearSummaryState();
      if (this.hasUsableLink() && !this.activationRoute) this.loadSummary();
    }
  }

  private isCurrentSummaryRequest(token: string): boolean {
    return this.summaryRequestToken === token && this.session.token() === token;
  }

  private clearSummaryState(): void {
    this.summaryRequest?.unsubscribe();
    this.summaryRequest = null;
    this.summaryRequestToken = null;
    this.memberSummary.set(null);
    this.isLoadingSummary.set(false);
    this.hasSummaryLoadError.set(false);
  }

  private concealNip(): void {
    this.isNipVisible.set(false);
  }

  private handleRequestError(
    error: unknown,
    context: 'enrollment' | 'login' | 'session'
  ): void {
    if (error instanceof MemberClubApiError) {
      this.errorMessage.set(error.message);
      if (context === 'enrollment' && error.kind === 'invitation') {
        this.pendingActivationScrubAccess = undefined;
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

  private focusFirstInvalidEnrollmentField(): void {
    this.focusInput(
      this.enrollmentForm.controls.pin.invalid
        ? 'member-enrollment-pin'
        : 'member-enrollment-confirmation'
    );
  }

  private focusInput(testId: string): void {
    afterNextRender(
      () => {
        (this.hostElement.nativeElement as HTMLElement)
          .querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)
          ?.focus();
      },
      { injector: this.injector }
    );
  }
}
