import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

interface ClubMetric {
  icon: string;
  label: string;
  value: string;
  detail: string;
}

interface DemoClient {
  name: string;
  stamps: number;
  eligibleBalance: string;
  note: string;
}

interface ClubActivity {
  icon: string;
  title: string;
  detail: string;
  value: string;
}

interface ClubArea {
  icon: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-club-dashboard',
  imports: [MatIconModule],
  templateUrl: './club-dashboard.component.html',
  styleUrl: './club-dashboard.component.scss'
})
export class ClubDashboardComponent {
  protected readonly metrics: ClubMetric[] = [
    { icon: 'groups', label: 'Clientas Club', value: '24', detail: 'Dato de demostración' },
    { icon: 'event_available', label: 'Visitas del mes', value: '39', detail: 'Dato de demostración' },
    { icon: 'loyalty', label: 'Sellos otorgados', value: '18', detail: 'Dato de demostración' },
    {
      icon: 'savings',
      label: 'Saldo elegible acumulado',
      value: '$2,480',
      detail: 'Dato de demostración'
    }
  ];

  protected readonly demoClients: DemoClient[] = [
    { name: 'Clienta demo A', stamps: 3, eligibleBalance: '$130', note: 'Visita reciente' },
    { name: 'Clienta demo B', stamps: 1, eligibleBalance: '$40', note: 'Actividad este mes' },
    { name: 'Clienta demo C', stamps: 2, eligibleBalance: '$210', note: 'Actividad reciente' }
  ];

  protected readonly activities: ClubActivity[] = [
    { icon: 'receipt_long', title: 'Visita registrada', detail: 'Consumo elegible', value: '+ $430' },
    { icon: 'loyalty', title: 'Sello otorgado', detail: 'Movimiento de fidelidad', value: '+1 sello' },
    { icon: 'savings', title: 'Saldo elegible', detail: 'Disponible para una visita futura', value: '$130 restante' }
  ];

  protected readonly clubAreas: ClubArea[] = [
    { icon: 'groups', title: 'Clientas', description: 'Perfiles y posición de fidelidad.' },
    { icon: 'event_available', title: 'Visitas', description: 'Registro y seguimiento auditable.' },
    { icon: 'campaign', title: 'Promociones', description: 'Beneficios vigentes y programados.' },
    { icon: 'redeem', title: 'Recompensas', description: 'Opciones configurables y canjes.' }
  ];

  protected stampLabel(stamps: number): string {
    return `${stamps} ${stamps === 1 ? 'sello acumulado' : 'sellos acumulados'}`;
  }
}
