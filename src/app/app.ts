import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { RouteMetadataService } from './core/services/route-metadata.service';
import { NavigationFocusService } from './core/services/navigation-focus.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly routeMetadataService = inject(RouteMetadataService);
  private readonly navigationFocusService = inject(NavigationFocusService);

  constructor() {
    this.routeMetadataService.initialize();
    this.navigationFocusService.initialize();
  }
}
