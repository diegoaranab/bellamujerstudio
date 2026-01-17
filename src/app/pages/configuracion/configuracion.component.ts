import { NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

import { DbFacadeService } from '../../core/services/db-facade.service';
import { LocalStateService } from '../../core/services/local-state.service';

@Component({
  selector: 'app-configuracion',
  imports: [MatButtonModule, MatCardModule, NgIf],
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.scss'
})
export class ConfiguracionComponent {
  private readonly dbFacade = inject(DbFacadeService);
  private readonly localState = inject(LocalStateService);

  statusMessage = '';
  statusTone: 'success' | 'error' | null = null;

  onResetDemo(): void {
    const confirmed = window.confirm(
      '¿Quieres reiniciar la demo? Se eliminarán los cambios locales.'
    );

    if (!confirmed) {
      return;
    }

    this.dbFacade.resetDemo();
    this.statusMessage = 'Demo reiniciada. Recargando datos de ejemplo...';
    this.statusTone = 'success';
    window.location.reload();
  }

  onExportDemo(): void {
    const payload = this.localState.exportState();
    const blob = new Blob([payload], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bm_state_v1.json';
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);

    this.statusMessage = 'El archivo de la demo se descargó correctamente.';
    this.statusTone = 'success';
  }

  async onImportDemo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    const text = await file.text();
    const imported = this.localState.importState(text);

    if (!imported) {
      this.statusMessage =
        'El archivo no es válido. Verifica que sea un JSON de demo.';
      this.statusTone = 'error';
      return;
    }

    this.statusMessage = 'Demo importada. Recargando datos...';
    this.statusTone = 'success';
    window.location.reload();
  }
}
