import { Annotation } from '@langchain/langgraph';
import type { EtapaKanban } from '../../tipos.ts';

export const EstadoFollowUp = Annotation.Root({
  payload_webhook: Annotation<Record<string, unknown>>(),
  evento: Annotation<'kanban_task_overdue' | 'kanban_task_updated'>(),

  // Dados da tarefa
  id_tarefa: Annotation<number>(),
  id_conta: Annotation<number>(),
  id_funil: Annotation<number>(),
  id_etapa_atual: Annotation<string>(),
  nome_etapa_atual: Annotation<string>(),
  titulo_tarefa: Annotation<string>(),
  descricao_tarefa: Annotation<string>(),
  due_date: Annotation<string | null>(),

  // Dados do contato/conversa associada
  id_conversa: Annotation<number>(),
  id_inbox: Annotation<number>(),
  telefone: Annotation<string>(),
  nome_contato: Annotation<string>(),

  // Funil completo (com IDs de etapa)
  etapas_funil: Annotation<EtapaKanban[]>(),

  // Roteamento
  tipo_follow_up: Annotation<'sem_resposta' | 'pos_call' | 'ignorar'>(),

  // Resposta gerada
  mensagem_gerada: Annotation<string>(),

  // Para kanban_task_updated (renovação de prazo)
  etapa_anterior: Annotation<string | null>(),
  etapa_atual_para_renovacao: Annotation<string | null>(),

  // ID da etapa para mover o card após envio (usado no fluxo "Entrar em Contato")
  mover_apos_envio: Annotation<string | null>(),
});

export type EstadoFollowUpType = typeof EstadoFollowUp.State;
