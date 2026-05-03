import type { EstadoFollowUpType } from '../estado.ts';
import { createChildLogger } from '../../../lib/logger.ts';
import { config } from '../../../config.ts';

const log = createChildLogger({ no: 'extrair_payload_follow_up' });

export async function extrairPayloadFollowUp(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  const p = estado.payload_webhook;
  const evento = (p.event as string) as 'kanban_task_overdue' | 'kanban_task_updated';

  const tarefa = (p.task ?? p.kanban_task ?? {}) as Record<string, unknown>;
  const board = (tarefa.board ?? {}) as Record<string, unknown>;
  const boardStep = (tarefa.board_step ?? {}) as Record<string, unknown>;

  const id_tarefa = Number(tarefa.id ?? 0);
  const id_funil = Number(board.id ?? 0);
  const id_conta = Number((p.account as Record<string, unknown>)?.id ?? 0) || config.CHATWOOT_ACCOUNT_ID;
  const id_etapa_atual = String(boardStep.id ?? '');
  const nome_etapa_atual = String(boardStep.name ?? '');
  const titulo_tarefa = String(tarefa.title ?? '');
  const descricao_tarefa = String(tarefa.description ?? '');
  const due_date = tarefa.due_date ? String(tarefa.due_date) : null;

  let id_conversa = 0;
  let id_inbox = 0;
  let telefone = '';
  let nome_contato = '';

  const convs = (p.conversations as Record<string, unknown>[]) ?? [];
  const conv0 = convs[0] ?? (p.conversation as Record<string, unknown>) ?? {};
  id_conversa = Number(conv0.id ?? 0);
  id_inbox = Number(conv0.inbox_id ?? 0);
  const meta = (conv0.meta ?? {}) as Record<string, unknown>;
  const sender = (meta.sender ?? conv0.sender ?? {}) as Record<string, unknown>;
  telefone = String(sender.phone_number ?? sender.identifier ?? '');
  nome_contato = String(sender.name ?? '');

  // changed_attributes para kanban_task_updated
  let etapa_anterior: string | null = null;
  let etapa_atual_para_renovacao: string | null = null;
  if (evento === 'kanban_task_updated') {
    const changed = (p.changed_attributes as Record<string, unknown>[]) ?? [];
    const boardStepChange = changed.find((c) => 'board_step' in c) as Record<string, unknown> | undefined;
    if (boardStepChange) {
      const bs = boardStepChange.board_step as Record<string, unknown>;
      etapa_anterior = String((bs.previous_value as Record<string, unknown>)?.name ?? '');
      etapa_atual_para_renovacao = String((bs.current_value as Record<string, unknown>)?.name ?? '');
    }
  }

  log.debug({ evento, id_tarefa, nome_etapa_atual, telefone }, 'payload extraído');

  return {
    evento,
    id_tarefa,
    id_conta,
    id_funil,
    id_etapa_atual,
    nome_etapa_atual,
    titulo_tarefa,
    descricao_tarefa,
    due_date,
    id_conversa,
    id_inbox,
    telefone,
    nome_contato,
    etapa_anterior,
    etapa_atual_para_renovacao,
  };
}
