import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { CLUB_WORKSPACE_ORCHESTRATOR } from './club-workspace-orchestrator';

@Component({
  selector: 'app-club-history',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './club-history.component.html',
  styleUrl: './club-workflow.component.scss'
})
export class ClubHistoryComponent {
  protected readonly vm = inject(CLUB_WORKSPACE_ORCHESTRATOR);
}
