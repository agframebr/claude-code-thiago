export interface EtapaKanban {
  id: number | string;
  name: string;
  color?: string;
  order?: number;
  cancelled?: boolean;
}

export interface FunilKanban {
  id: number;
  name?: string;
  steps?: EtapaKanban[];
}

export interface TarefaKanban {
  id: number;
  title?: string;
  description?: string;
  due_date?: string | null;
  board_step?: EtapaKanban | null;
  board?: FunilKanban | null;
}

export interface AnexoChatwoot {
  id: number | string;
  message_id?: number;
  file_type?: 'audio' | 'image' | 'video' | 'file' | string;
  data_url?: string;
  thumb_url?: string;
}

export interface SenderChatwoot {
  id?: number;
  name?: string;
  phone_number?: string | null;
  identifier?: string | null;
  additional_attributes?: Record<string, unknown> & {
    social_profiles?: { instagram?: string; [k: string]: string | undefined };
  };
  custom_attributes?: Record<string, unknown>;
}

export interface MensagemChatwoot {
  id: number;
  content?: string | null;
  message_type?: number | 'incoming' | 'outgoing' | 'activity' | 'template';
  created_at?: number | string;
  content_attributes?: Record<string, unknown> & {
    in_reply_to?: number;
  };
  attachments?: AnexoChatwoot[];
  sender?: SenderChatwoot;
}

export interface ConversaChatwoot {
  id: number;
  account_id?: number;
  inbox_id?: number;
  contact_inbox?: { contact_id?: number };
  meta?: { sender?: SenderChatwoot };
  labels?: string[];
  custom_attributes?: Record<string, unknown>;
  additional_attributes?: Record<string, unknown>;
  kanban_task?: TarefaKanban | null;
}

export interface PayloadWebhook {
  event: string;
  account?: { id: number; name?: string };
  conversation?: ConversaChatwoot;
  sender?: SenderChatwoot;
  contact?: SenderChatwoot;
  // message_created
  id?: number;
  content?: string | null;
  message_type?: 'incoming' | 'outgoing' | string;
  created_at?: number | string;
  attachments?: AnexoChatwoot[];
  content_attributes?: Record<string, unknown> & { in_reply_to?: number };
  // kanban_task_*
  task?: TarefaKanban;
  kanban_task?: TarefaKanban;
  changed_attributes?: Array<Record<string, { current_value: unknown; previous_value: unknown }>>;
  conversations?: ConversaChatwoot[];
}

export interface OpcoesEnvioMensagem {
  content: string;
  replyToMessageId?: number;
  isReaction?: boolean;
  splitMessage?: boolean;
  waitBeforeSending?: 'dynamic' | number;
  contentType?: 'text' | 'input_email' | 'cards' | 'form';
}

export interface MetadadosAnexo {
  transcribed_text?: string;
  [k: string]: unknown;
}

export interface JanelaDisponivel {
  inicio_janela: string;
  fim_janela: string;
  id_agenda: string;
}

export interface ContextoAgente {
  telefone: string;
  idConta: number;
  idContato: number;
  idConversa: number;
  idInbox: number;
  idMensagem: number;
  nome: string;
  tarefa: TarefaKanban | null;
  funil: FunilKanban | null;
  mensagensColetadas: string;
}

// Payload do webhook Calendly (invitee.created / invitee.canceled)
export interface PayloadCalendly {
  event: 'invitee.created' | 'invitee.canceled';
  payload: {
    email: string;
    name: string;
    // Em Calendly v2, payload.event é uma URI string; os detalhes ficam em scheduled_event
    event?: string | {
      start_time?: string;
      end_time?: string;
      name?: string;
      uri?: string;
      location?: {
        type?: string;
        join_url?: string;
        location?: string;
      };
    };
    scheduled_event?: {
      start_time: string;
      end_time: string;
      name?: string;
      uri?: string;
      location?: {
        type?: string;
        join_url?: string;
        location?: string;
      };
    };
    questions_and_answers?: Array<{
      question: string;
      answer: string;
      position?: number;
    }>;
    text_reminder_number?: string;  // Calendly captura número se evento tem SMS reminder
    cancel_url?: string;
    reschedule_url?: string;
  };
  created_at: string;
}
