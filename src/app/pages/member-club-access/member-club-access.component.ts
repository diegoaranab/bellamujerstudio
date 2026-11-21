import {
  Component,
  DOCUMENT,
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
  MemberClubHistoryItem,
  MemberClubPromotion,
  MemberClubQrIdentification,
  MemberClubSelfSummary,
  MemberClubSessionResponse
} from '../../core/services/member-club-api.client';
import { buildBellaMujerWhatsAppUrl } from '../../core/constants/contact.constants';
import { isCanonicalMemberClubCredential } from '../../core/services/member-club-credential';
import { MemberClubSessionService } from '../../core/services/member-club-session.service';
import { MemberClubHistoryComponent } from './member-club-history.component';
import { MemberClubPromotionComponent } from './member-club-promotion.component';
import { MemberClubQrComponent, MemberClubQrState } from './member-club-qr.component';
import { buildMemberClubAdminQrTarget, generateMemberClubQrDataUrl } from '../../core/services/member-club-qr';

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
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MemberClubHistoryComponent,
    MemberClubPromotionComponent,
    MemberClubQrComponent
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
  private historyRequest: Subscription | null = null;
  private historyRequestToken: string | null = null;
  private qrRequest: Subscription | null = null;
  private qrRequestToken: string | null = null;
  private qrAttempt = 0;
  private promotionRequest: Subscription | null = null;
  private promotionRequestToken: string | null = null;
  private promotionAttempt = 0;
  private promotionAttemptedToken: string | null = null;
  private promotionRetryPending = false;
  private promotionRouteValid = false;
  private logoutPending = false;
  private readonly document = inject(DOCUMENT);
  private observedSessionToken: string | null | undefined = undefined;
  private throttleTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly accessHandle = signal('');
  protected readonly isEnrollment = signal(false);
  protected readonly hasInvalidActivation = signal(false);
  protected readonly needsPrivateLink = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly isLoadingSummary = signal(false);
  protected readonly qrState = signal<MemberClubQrState>('closed');
  protected readonly qrImage = signal<string | null>(null);
  protected readonly qrErrorMessage = signal('No pudimos mostrar tu QR.');
  protected readonly hasSummaryLoadError = signal(false);
  protected readonly memberSummary = signal<MemberClubSelfSummary | null>(null);
  protected readonly memberHistory = signal<MemberClubHistoryItem[]>([]);
  protected readonly historyNextToken = signal<string | null>(null);
  protected readonly isLoadingHistory = signal(false);
  protected readonly isLoadingMoreHistory = signal(false);
  protected readonly hasHistoryLoadError = signal(false);
  protected readonly hasHistoryPaginationError = signal(false);
  protected readonly memberPromotion = signal<MemberClubPromotion | null>(null);
  protected readonly isLoadingPromotion = signal(false);
  protected readonly hasPromotionLoadError = signal(false);
  protected readonly promotionErrorMessage = signal('');
  protected readonly isRetryingPromotion = signal(false);
  protected readonly earnedStampMarkers = computed(() => {
    const stampCount = this.memberSummary()?.loyalty.stampCount ?? 0;
    return Array.from({ length: Math.min(stampCount, 8) });
  });
  protected readonly earnedStampOverflow = computed(() =>
    Math.max((this.memberSummary()?.loyalty.stampCount ?? 0) - 8, 0)
  );
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
      this.historyRequest?.unsubscribe();
      this.invalidatePromotion();
      this.clearQrState();
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

  protected showQr(): void {
    if (this.isSubmitting() || this.qrState() !== 'closed') return;
    const token = this.session.token();
    if (!token) return;
    if (this.clearExpiredQrSession()) return;
    this.loadQr(token);
  }

  protected hideQr(): void {
    this.clearQrState();
    this.qrState.set('closed');
  }

  protected retryQr(): void {
    if (this.qrState() !== 'error') return;
    const token = this.session.token();
    if (!token || this.clearExpiredQrSession()) return;
    this.loadQr(token);
  }

  protected retryHistory(): void {
    this.loadHistory();
  }

  protected retryPromotion(): void {
    const token = this.session.token();
    if (
      !token || !this.promotionRouteValid || this.logoutPending || this.session.isExpired() ||
      !this.hasPromotionLoadError() || this.isRetryingPromotion()
    ) return;
    this.startPromotionRead(token, true);
  }

  protected loadMoreHistory(): void {
    const nextToken = this.historyNextToken();
    const token = this.session.token();
    if (!token || !nextToken || this.isLoadingHistory() || this.isLoadingMoreHistory()) return;

    this.hasHistoryPaginationError.set(false);
    this.isLoadingMoreHistory.set(true);
    this.historyRequestToken = token;
    this.historyRequest = this.api.getHistory(token, { limit: 5, nextToken }).subscribe({
      next: (page) => {
        if (!this.isCurrentHistoryRequest(token)) return;
        this.memberHistory.set([...this.memberHistory(), ...page.items]);
        this.historyNextToken.set(page.nextToken ?? null);
        this.isLoadingMoreHistory.set(false);
        this.historyRequest = null;
      },
      error: (error: unknown) => this.handleHistoryError(error, token, true)
    });
  }

  protected logout(): void {
    if (this.isSubmitting()) return;
    const token = this.session.token();
    if (!token) return;

    this.clearQrState();
    this.qrState.set('closed');
    this.logoutPending = true;
    this.invalidatePromotion();

    this.errorMessage.set('');
    this.isSubmitting.set(true);
    this.activeRequest = this.api.logout(token).subscribe({
      next: () => {
        if (!this.isCurrentLogout(token)) return;
        this.finishLogout();
      },
      error: (error: unknown) => {
        if (!this.isCurrentLogout(token)) return;
        if (error instanceof MemberClubApiError && error.kind === 'authentication') {
          this.finishLogout();
          this.errorMessage.set('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
          return;
        }
        this.logoutPending = false;
        this.isSubmitting.set(false);
        this.errorMessage.set('No pudimos confirmar el cierre de sesión. Intenta nuevamente.');
        if (this.session.token() === token && !this.session.isExpired() && this.promotionRouteValid) {
          this.startPromotionRead(token);
        }
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
    this.promotionRouteValid = !this.activationRoute && hasValidAccess;
    if (!this.promotionRouteValid) this.invalidatePromotion();
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
    this.clearHistoryState();
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
    if (this.promotionRouteValid && !this.logoutPending) this.startPromotionRead(token);
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
        this.loadHistory();
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
    this.logoutPending = false;
    this.invalidatePromotion();
    this.session.clear();
    this.isSubmitting.set(false);
  }

  private handleSessionTransition(token: string | null): void {
    const previousToken = this.observedSessionToken;
    if (previousToken === token) return;
    this.observedSessionToken = token;
    this.logoutPending = false;
    this.isSubmitting.set(false);
    // Effects can observe a just-established session after route processing already started its
    // first read. Preserve that current-token attempt; invalidate every request from another token.
    if (this.promotionAttemptedToken !== token) this.invalidatePromotion();
    this.clearQrState();
    this.qrState.set('closed');

    if (!token) {
      this.clearSummaryState();
      this.clearHistoryState();
      this.isSubmitting.set(false);
      return;
    }

    if (previousToken && previousToken !== token) {
      this.clearSummaryState();
      this.clearHistoryState();
      if (this.hasUsableLink() && !this.activationRoute) this.loadSummary();
    }
  }

  private startPromotionRead(token: string, force = false): void {
    if (
      this.destroyRef.destroyed || !this.promotionRouteValid || this.logoutPending ||
      this.session.token() !== token || this.session.isExpired()
    ) return;
    if (!force && this.promotionAttemptedToken === token) return;
    this.promotionRequest?.unsubscribe();
    const attempt = ++this.promotionAttempt;
    this.promotionAttemptedToken = token;
    this.promotionRequestToken = token;
    this.promotionRetryPending = force;
    this.isRetryingPromotion.set(force);
    this.memberPromotion.set(null);
    this.hasPromotionLoadError.set(false);
    this.promotionErrorMessage.set('');
    this.isLoadingPromotion.set(true);
    this.promotionRequest = this.api.getPromotion(token).subscribe({
      next: (promotion) => {
        if (!this.isCurrentPromotionRequest(token, attempt)) return;
        this.memberPromotion.set(promotion);
        this.finishPromotionAttempt();
      },
      error: (error: unknown) => {
        if (!this.isCurrentPromotionRequest(token, attempt)) return;
        this.finishPromotionAttempt();
        if (error instanceof MemberClubApiError && error.kind === 'authentication') {
          this.invalidatePromotion();
          this.session.clear();
          this.errorMessage.set('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
          afterNextRender(
            () => (this.hostElement.nativeElement as HTMLElement)
              .querySelector<HTMLElement>('[data-testid="member-login-heading"]')?.focus(),
            { injector: this.injector }
          );
          return;
        }
        this.hasPromotionLoadError.set(true);
        this.promotionErrorMessage.set(
          error instanceof MemberClubApiError && error.kind === 'network'
            ? 'No pudimos cargar la promoción. Revisa tu conexión.'
            : 'No pudimos cargar la promoción. Intenta de nuevo.'
        );
      }
    });
  }

  private isCurrentPromotionRequest(token: string, attempt: number): boolean {
    return !this.destroyRef.destroyed && !this.logoutPending && this.promotionRouteValid &&
      this.promotionRequestToken === token && this.promotionAttempt === attempt &&
      this.session.token() === token && !this.session.isExpired();
  }

  private finishPromotionAttempt(): void {
    this.promotionRequest = null;
    this.promotionRequestToken = null;
    this.promotionRetryPending = false;
    this.isRetryingPromotion.set(false);
    this.isLoadingPromotion.set(false);
  }

  private invalidatePromotion(): void {
    this.promotionAttempt += 1;
    this.promotionRequest?.unsubscribe();
    this.promotionRequest = null;
    this.promotionRequestToken = null;
    this.promotionAttemptedToken = null;
    this.promotionRetryPending = false;
    this.memberPromotion.set(null);
    this.isLoadingPromotion.set(false);
    this.isRetryingPromotion.set(false);
    this.hasPromotionLoadError.set(false);
    this.promotionErrorMessage.set('');
  }

  private loadQr(token: string): void {
    if (!token || this.qrState() === 'loading') return;
    this.qrRequest?.unsubscribe();
    this.qrImage.set(null);
    this.qrErrorMessage.set('No pudimos mostrar tu QR.');
    this.qrState.set('loading');
    const attempt = ++this.qrAttempt;
    this.qrRequestToken = token;
    this.qrRequest = this.api.getQr(token).subscribe({
      next: (qr: MemberClubQrIdentification) => {
        if (!this.isCurrentQrRequest(token, attempt)) return;
        try {
          const target = buildMemberClubAdminQrTarget(this.document.baseURI, qr.identifier);
          const dataUrl = generateMemberClubQrDataUrl(target);
          if (!this.isCurrentQrRequest(token, attempt)) return;
          this.qrImage.set(dataUrl);
          this.qrState.set('open');
          this.qrRequest = null;
        } catch {
          this.qrState.set('error');
          this.qrErrorMessage.set('No pudimos mostrar tu QR.');
          this.qrRequest = null;
        }
      },
      error: (error: unknown) => {
        if (!this.isCurrentQrRequest(token, attempt)) return;
        this.qrRequest = null;
        if (error instanceof MemberClubApiError && error.kind === 'authentication') {
          this.clearQrState();
          this.session.clear();
          this.errorMessage.set('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
          afterNextRender(() => (this.hostElement.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="member-login-heading"]')?.focus(), { injector: this.injector });
          return;
        }
        this.qrErrorMessage.set(error instanceof MemberClubApiError && error.kind === 'network'
          ? 'No pudimos cargar tu QR. Revisa tu conexión.'
          : 'No pudimos mostrar tu QR.');
        this.qrState.set('error');
      }
    });
  }

  private isCurrentQrRequest(token: string, attempt: number): boolean {
    return this.qrRequestToken === token && this.session.token() === token && this.qrAttempt === attempt;
  }

  private clearQrState(): void {
    this.qrAttempt += 1;
    this.qrRequest?.unsubscribe();
    this.qrRequest = null;
    this.qrRequestToken = null;
    this.qrImage.set(null);
  }

  private clearExpiredQrSession(): boolean {
    if (!this.session.isExpired()) return false;
    this.clearQrState();
    this.qrState.set('closed');
    this.session.clear();
    this.errorMessage.set('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
    afterNextRender(() => (this.hostElement.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('[data-testid="member-login-heading"]')?.focus(), { injector: this.injector });
    return true;
  }

  private isCurrentSummaryRequest(token: string): boolean {
    return this.summaryRequestToken === token && this.session.token() === token;
  }

  private isCurrentLogout(token: string): boolean {
    return this.session.token() === token;
  }

  private clearSummaryState(): void {
    this.summaryRequest?.unsubscribe();
    this.summaryRequest = null;
    this.summaryRequestToken = null;
    this.memberSummary.set(null);
    this.isLoadingSummary.set(false);
    this.hasSummaryLoadError.set(false);
  }

  private loadHistory(): void {
    const token = this.session.token();
    if (!token || this.isLoadingHistory() || this.isLoadingMoreHistory()) return;
    this.clearHistoryState();
    this.isLoadingHistory.set(true);
    this.historyRequestToken = token;
    this.historyRequest = this.api.getHistory(token, { limit: 5 }).subscribe({
      next: (page) => {
        if (!this.isCurrentHistoryRequest(token)) return;
        this.memberHistory.set(page.items);
        this.historyNextToken.set(page.nextToken ?? null);
        this.isLoadingHistory.set(false);
        this.historyRequest = null;
      },
      error: (error: unknown) => this.handleHistoryError(error, token, false)
    });
  }

  private handleHistoryError(error: unknown, token: string, isPagination: boolean): void {
    if (!this.isCurrentHistoryRequest(token)) return;
    this.historyRequest = null;
    this.isLoadingHistory.set(false);
    this.isLoadingMoreHistory.set(false);
    if (error instanceof MemberClubApiError && error.kind === 'authentication') {
      this.session.clear();
      this.errorMessage.set('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
      return;
    }
    if (isPagination) this.hasHistoryPaginationError.set(true);
    else this.hasHistoryLoadError.set(true);
  }

  private isCurrentHistoryRequest(token: string): boolean {
    return this.historyRequestToken === token && this.session.token() === token;
  }

  private clearHistoryState(): void {
    this.historyRequest?.unsubscribe();
    this.historyRequest = null;
    this.historyRequestToken = null;
    this.memberHistory.set([]);
    this.historyNextToken.set(null);
    this.isLoadingHistory.set(false);
    this.isLoadingMoreHistory.set(false);
    this.hasHistoryLoadError.set(false);
    this.hasHistoryPaginationError.set(false);
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
