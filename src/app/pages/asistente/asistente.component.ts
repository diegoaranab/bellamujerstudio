import {
  AsyncPipe,
  DatePipe,
  NgClass,
  NgFor,
  NgIf
} from '@angular/common';
import { TextFieldModule } from '@angular/cdk/text-field';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { combineLatest, map } from 'rxjs';

import { AssistantChatMessage } from '../../core/models';
import { AssistantService } from '../../core/services/assistant.service';

@Component({
  selector: 'app-asistente',
  imports: [
    AsyncPipe,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    NgClass,
    NgFor,
    NgIf,
    TextFieldModule
  ],
  templateUrl: './asistente.component.html',
  styleUrl: './asistente.component.scss'
})
export class AsistenteComponent {
  private readonly assistantService = inject(AssistantService);

  readonly quickPrompts = [
    '¿Qué servicio deja más ganancia?',
    '¿Qué debo reponer hoy?',
    'Dame un resumen de esta semana',
    'Sugiéreme una promoción de belleza para esta semana'
  ];

  readonly vm$ = combineLatest({
    history: this.assistantService.chatHistory$,
    isSending: this.assistantService.isSending$,
    lastError: this.assistantService.lastError$
  }).pipe(
    map((vm) => ({
      ...vm,
      hasConversation: vm.history.length > 0
    }))
  );

  draftMessage = '';

  async sendMessage(isSending: boolean): Promise<void> {
    if (isSending) {
      return;
    }

    const message = this.draftMessage.trim();
    if (!message) {
      return;
    }

    this.draftMessage = '';
    await this.assistantService.sendUserMessage(message);
  }

  async sendQuickPrompt(prompt: string, isSending: boolean): Promise<void> {
    if (isSending) {
      return;
    }

    this.draftMessage = prompt;
    await this.sendMessage(isSending);
  }

  onComposerKeydown(event: KeyboardEvent, isSending: boolean): void {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void this.sendMessage(isSending);
  }

  clearConversation(isSending: boolean): void {
    if (isSending) {
      return;
    }

    this.assistantService.clearChatHistory();
  }

  trackByMessage(index: number, message: AssistantChatMessage): string {
    return `${message.role}-${message.createdAtISO ?? index}-${message.content}`;
  }
}
