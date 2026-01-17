import { AsyncPipe, CommonModule, CurrencyPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  ViewEncapsulation
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { combineLatest, firstValueFrom, map, startWith } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  Client,
  PaymentMethod,
  Transaction,
  TransactionItem,
  TransactionStatus
} from '../../../core/models';
import { DbFacadeService } from '../../../core/services/db-facade.service';

@Component({
  selector: 'app-nueva-cita-dialog',
  standalone: true,
  imports: [
    AsyncPipe,
    CommonModule,
    CurrencyPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatSnackBarModule
  ],
  templateUrl: './nueva-cita-dialog.component.html',
  styleUrl: './nueva-cita-dialog.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class NuevaCitaDialogComponent {
  private readonly dbFacade = inject(DbFacadeService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<NuevaCitaDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = this.fb.group(
    {
      clienteSeleccion: this.fb.control<Client | string | null>(null),
      clienteNuevo: this.fb.control(false),
      clienteNombre: this.fb.control('', { nonNullable: true }),
      clienteTelefono: this.fb.control('', { nonNullable: true }),
      servicioId: this.fb.control('', { validators: [Validators.required] }),
      fecha: this.fb.control<Date | null>(null, {
        validators: [Validators.required]
      }),
      hora: this.fb.control('', { validators: [Validators.required] }),
      estado: this.fb.control<TransactionStatus>('programada', {
        validators: [Validators.required],
        nonNullable: true
      }),
      metodoPago: this.fb.control<PaymentMethod | null>(null),
      notas: this.fb.control('', { nonNullable: true })
    },
    { validators: [this.buildClienteValidator()] }
  );

  readonly servicesDb$ = this.dbFacade.services$;
  readonly services$ = this.servicesDb$.pipe(map((seed) => seed.services));
  readonly clients$ = this.dbFacade.clients$.pipe(map((seed) => seed.clients));
  readonly materials$ = this.dbFacade.inventory$.pipe(
    map((seed) => seed.materials)
  );

  readonly filteredClients$ = combineLatest([
    this.clients$,
    this.form.controls.clienteSeleccion.valueChanges.pipe(startWith(''))
  ]).pipe(
    map(([clients, value]) => {
      const search =
        typeof value === 'string'
          ? value.toLowerCase()
          : value?.nombre.toLowerCase() ?? '';
      return clients.filter((client) =>
        client.nombre.toLowerCase().includes(search)
      );
    })
  );

  readonly selectedService$ = combineLatest([
    this.services$,
    this.form.controls.servicioId.valueChanges.pipe(
      startWith(this.form.controls.servicioId.value)
    )
  ]).pipe(
    map(([services, serviceId]) =>
      services.find((service) => service.id === serviceId) ?? null
    )
  );

  readonly bomSnapshot$ = combineLatest([
    this.servicesDb$,
    this.materials$,
    this.form.controls.servicioId.valueChanges.pipe(
      startWith(this.form.controls.servicioId.value)
    )
  ]).pipe(
    map(([servicesDb, materials, serviceId]) => {
      if (!serviceId) {
        return [];
      }

      const materialMap = new Map(
        materials.map((material) => [material.id, material])
      );

      return servicesDb.bom
        .filter((item) => item.serviceId === serviceId)
        .map((item) => {
          const material = materialMap.get(item.materialId);
          return {
            materialId: item.materialId,
            nombre: material?.nombre ?? item.materialId,
            cantidad: item.cantidad,
            unidad: item.unidad
          };
        });
    })
  );

  readonly estado$ = this.form.controls.estado.valueChanges.pipe(
    startWith(this.form.controls.estado.value)
  );

  constructor() {
    this.form.controls.estado.valueChanges
      .pipe(
        startWith(this.form.controls.estado.value),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((estado) => {
        if (estado === 'completada') {
          this.form.controls.metodoPago.setValidators([Validators.required]);
        } else {
          this.form.controls.metodoPago.clearValidators();
          this.form.controls.metodoPago.setValue(null);
        }
        this.form.controls.metodoPago.updateValueAndValidity({
          emitEvent: false
        });
      });

    this.form.controls.clienteNuevo.valueChanges
      .pipe(
        startWith(this.form.controls.clienteNuevo.value),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((clienteNuevo) => {
        if (clienteNuevo) {
          this.form.controls.clienteSeleccion.reset();
          this.form.controls.clienteSeleccion.disable({ emitEvent: false });
        } else {
          this.form.controls.clienteSeleccion.enable({ emitEvent: false });
        }
      });
  }

  displayClient(client: Client | string | null): string {
    if (!client || typeof client === 'string') {
      return client ?? '';
    }
    return client.nombre;
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const servicioId = this.form.controls.servicioId.value;
    const [servicesDb, materials] = await Promise.all([
      firstValueFrom(this.servicesDb$),
      firstValueFrom(this.materials$)
    ]);
    const servicio =
      servicesDb.services.find((service) => service.id === servicioId) ?? null;
    const materialMap = new Map(
      materials.map((material) => [material.id, material])
    );
    const bomSnapshot = servicesDb.bom
      .filter((item) => item.serviceId === servicioId)
      .map((item) => {
        const material = materialMap.get(item.materialId);
        return {
          materialId: item.materialId,
          nombre: material?.nombre ?? item.materialId,
          cantidad: item.cantidad,
          unidad: item.unidad
        };
      });

    if (!servicio) {
      return;
    }

    const estado = this.form.controls.estado.value;
    const notas = this.form.controls.notas.value.trim();
    const telefono = this.form.controls.clienteTelefono.value.trim();
    const notasFinal = [notas, telefono ? `Teléfono: ${telefono}` : '']
      .filter(Boolean)
      .join('\n');

    const clientNuevo = this.form.controls.clienteNuevo.value;
    const clienteSeleccion = this.form.controls.clienteSeleccion.value;

    const clientId = clientNuevo
      ? this.dbFacade.generateId()
      : (clienteSeleccion as Client).id;
    const clientNombre = clientNuevo
      ? this.form.controls.clienteNombre.value.trim()
      : (clienteSeleccion as Client).nombre;

    const fecha = this.form.controls.fecha.value as Date;
    const hora = this.form.controls.hora.value || '00:00';
    const [horaNum, minutoNum] = hora.split(':').map((part) => Number(part));
    const startAt = new Date(fecha);
    startAt.setHours(horaNum, minutoNum, 0, 0);

    const item: TransactionItem = {
      serviceId: servicio.id,
      serviceNombre: servicio.nombre,
      precioBaseMXN: servicio.precioBaseMXN,
      duracionMin: servicio.duracionMinBase,
      bomSnapshot: bomSnapshot.length > 0 ? bomSnapshot : undefined
    };

    const tx: Transaction = {
      id: this.dbFacade.generateId(),
      createdAtISO: new Date().toISOString(),
      startAtISO: startAt.toISOString(),
      status: estado,
      clientId,
      clientNombre,
      items: [item],
      totalMXN: servicio.precioBaseMXN,
      paymentMethod:
        estado === 'completada'
          ? (this.form.controls.metodoPago.value as PaymentMethod)
          : undefined,
      notas: notasFinal || undefined
    };

    this.dbFacade.addTransaction(tx);
    this.snackBar.open('Cita guardada', 'Cerrar', { duration: 2500 });
    this.dialogRef.close();
  }

  cancelar(): void {
    this.dialogRef.close();
  }

  private buildClienteValidator(): ValidatorFn {
    return (control: AbstractControl): Record<string, boolean> | null => {
      const formGroup = control as FormGroup;
      const clienteNuevo = formGroup.get('clienteNuevo')?.value;
      const clienteNombre = formGroup.get('clienteNombre')?.value?.trim();
      const clienteSeleccion = formGroup.get('clienteSeleccion')?.value;
      if (clienteNuevo) {
        return clienteNombre ? null : { clienteRequerido: true };
      }

      return clienteSeleccion && typeof clienteSeleccion === 'object'
        ? null
        : { clienteRequerido: true };
    };
  }
}
