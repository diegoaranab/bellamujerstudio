import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

import { CLUB_WORKSPACE_ORCHESTRATOR } from './club-workspace-orchestrator';

@Component({
  selector: 'app-club-directory',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './club-directory.component.html',
  styleUrl: './club-workflow.component.scss'
})
export class ClubDirectoryComponent {
  protected readonly vm = inject(CLUB_WORKSPACE_ORCHESTRATOR);
}
