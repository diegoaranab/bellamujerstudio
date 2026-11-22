import { Component, DestroyRef, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { CLUB_PROMOTION_ADMIN_CAPABILITIES } from './club-promotion-admin.config';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminClubApiClient, AdminClubApiError, AdminClubPromotion, AdminClubPromotionCreateRequest } from '../../core/services/admin-club-api.client';

const scheduleFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export function formatPromotionSchedule(utcISO: string): string {
  return scheduleFormatter.format(new Date(utcISO));
}

@Component({
  selector: 'app-club-promotions',
  imports: [ReactiveFormsModule],
  templateUrl: './club-promotions.component.html',
  styleUrl: './club-promotions.component.scss'
})
export class ClubPromotionsComponent {
  private readonly api = inject(AdminClubApiClient);
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('validationSummary') private validationSummary?: ElementRef<HTMLElement>;
  protected readonly mutationsEnabled = inject(CLUB_PROMOTION_ADMIN_CAPABILITIES).mutationsEnabled;
  protected readonly editorOpen = signal(false);
  protected readonly creating = signal(false);
  protected readonly pending = signal<{ request: AdminClubPromotionCreateRequest; idempotencyKey: string; uncertain: boolean } | null>(null);
  protected readonly createError = signal('');
  protected readonly success = signal('');
  protected readonly submitted = signal(false);
  private readonly textValidator = (max: number, description = false): ValidatorFn => control => {
    const value = control.value as string;
    return value && value.trim() === value && Array.from(value).length <= max &&
      !(description ? /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/ : /[\u0000-\u001f\u007f-\u009f]/).test(value) ? null : { invalidText: true };
  };
  private readonly minute = Validators.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  protected readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [this.textValidator(100)] }),
    description: new FormControl('', { nonNullable: true, validators: [this.textValidator(500, true)] }),
    status: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^(active|inactive)$/)] }),
    startsAtLocal: new FormControl('', { nonNullable: true, validators: [Validators.required, this.minute] }),
    endsAtLocal: new FormControl('', { nonNullable: true, validators: [Validators.required, this.minute] })
  }, { validators: group => group.get('startsAtLocal')?.valid && group.get('endsAtLocal')?.valid && group.value.startsAtLocal >= group.value.endsAtLocal ? { interval: true } : null });
  protected readonly configured = this.api.isConfigured;
  protected readonly state = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  protected readonly items = signal<AdminClubPromotion[]>([]);
  protected readonly errorMessage = signal('');
  protected readonly formatSchedule = formatPromotionSchedule;

  constructor() {
    if (this.configured) this.load();
  }

  protected load(): void {
    if (!this.configured || (this.state() === 'loading' && this.inFlight)) return;
    this.inFlight = true;
    this.state.set('loading');
    this.items.set([]);
    this.api.listPromotions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ items }) => {
        this.inFlight = false;
        this.items.set(items);
        this.state.set(items.length ? 'ready' : 'empty');
        if (this.refreshQueued) { this.refreshQueued = false; this.load(); }
      },
      error: (error: unknown) => {
        this.inFlight = false;
        this.items.set([]);
        this.errorMessage.set(error instanceof AdminClubApiError ? error.message : 'No fue posible cargar las promociones. Intenta de nuevo.');
        this.state.set('error');
        if (this.refreshQueued) { this.refreshQueued = false; this.load(); }
      }
    });
  }
  protected openEditor(): void {
    if (!this.configured || !this.mutationsEnabled || this.creating() || this.pending()) return;
    this.success.set(''); this.editorOpen.set(true);
  }
  protected cancel(): void {
    if (this.creating() || this.pending()) return;
    this.resetEditor();
  }
  private resetEditor(): void {
    this.form.reset(); this.submitted.set(false); this.createError.set(''); this.editorOpen.set(false);
  }
  protected submit(): void {
    if (!this.configured || !this.mutationsEnabled || !this.editorOpen() || this.creating() || this.pending()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      setTimeout(() => this.validationSummary?.nativeElement.focus());
      return;
    }
    let key: string;
    try { key = globalThis.crypto.randomUUID(); } catch { this.createError.set('No fue posible preparar la creación. Intenta de nuevo.'); return; }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      this.createError.set('No fue posible preparar la creación. Intenta de nuevo.'); return;
    }
    const value = this.form.getRawValue();
    const request: AdminClubPromotionCreateRequest = { ...value, status: value.status as 'active' | 'inactive' };
    this.pending.set({ request: Object.freeze(request), idempotencyKey: key, uncertain: false });
    this.sendAttempt();
  }
  protected retryCreate(): void { if (this.pending() && !this.creating()) this.sendAttempt(); }
  private sendAttempt(): void {
    const attempt = this.pending();
    if (!this.configured || !this.mutationsEnabled || !attempt || this.creating()) return;
    this.creating.set(true); this.createError.set(''); this.form.disable();
    this.api.createPromotion(attempt.request, attempt.idempotencyKey).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.creating.set(false); this.pending.set(null); this.form.enable(); this.resetEditor();
        this.success.set('Promoción creada.'); if (this.inFlight) this.refreshQueued = true; else this.load();
      },
      error: (error: unknown) => {
        this.creating.set(false);
        const uncertainFailure = !(error instanceof AdminClubApiError) || error.kind === 'network' || error.kind === 'server';
        if (uncertainFailure && !attempt.uncertain) this.pending.set({ ...attempt, uncertain: true });
        this.createError.set(error instanceof AdminClubApiError ? error.message : 'No fue posible confirmar la creación. Reintenta para comprobarla.');
        if (!uncertainFailure && !attempt.uncertain) { this.pending.set(null); this.form.enable(); }
      }
    });
  }
  private refreshQueued = false;
  private inFlight = false;
}
