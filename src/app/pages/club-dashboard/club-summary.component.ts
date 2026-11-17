import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

import { CLUB_WORKSPACE_ORCHESTRATOR } from './club-workspace-orchestrator';

@Component({
  selector: 'app-club-summary',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './club-summary.component.html',
  styleUrl: './club-workflow.component.scss'
})
export class ClubSummaryComponent {
  protected readonly vm = inject(CLUB_WORKSPACE_ORCHESTRATOR);
}
