import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CLUB_WORKSPACE_ORCHESTRATOR } from './club-workspace-orchestrator';

@Component({
  selector: 'app-club-visit',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule
  ],
  templateUrl: './club-visit.component.html',
  styleUrl: './club-workflow.component.scss'
})
export class ClubVisitComponent {
  protected readonly vm = inject(CLUB_WORKSPACE_ORCHESTRATOR);
}
