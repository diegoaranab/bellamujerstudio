import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { map } from 'rxjs';

import { DbFacadeService } from '../../../core/services/db-facade.service';

@Component({
  selector: 'app-registrar-entrada-dialog',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  templateUrl: './registrar-entrada-dialog.component.html',
  styleUrl: './registrar-entrada-dialog.component.scss'
})
export class RegistrarEntradaDialogComponent {
  private readonly dbFacade = inject(DbFacadeService);
  private readonly dialogRef = inject(
    MatDialogRef<RegistrarEntradaDialogComponent>
  );
  private readonly fb = inject(FormBuilder);

  readonly materials$ = this.dbFacade.inventory$.pipe(
    map((seed) => seed.materials)
  );

  readonly form = this.fb.group({
    materialId: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    cantidad: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(0.01)]
    }),
    motivo: this.fb.control('Entrada manual', { nonNullable: true })
  });

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const materialId = this.form.controls.materialId.value;
    const cantidad = this.form.controls.cantidad.value ?? 0;
    const motivoInput = this.form.controls.motivo.value.trim();
    const motivo = motivoInput || 'Entrada manual';

    this.dbFacade.addInventoryAdjustment(materialId, cantidad, motivo);
    this.dialogRef.close();
  }

  cancelar(): void {
    this.dialogRef.close();
  }
}
