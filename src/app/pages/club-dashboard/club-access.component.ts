import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CLUB_WORKSPACE_ORCHESTRATOR } from './club-workspace-orchestrator';

@Component({
  selector: 'app-club-access',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './club-access.component.html',
  styleUrl: './club-workflow.component.scss'
})
export class ClubAccessComponent {
  protected readonly vm = inject(CLUB_WORKSPACE_ORCHESTRATOR);
}
