/**
 * Nós de agente do grafo follow-up:
 * - lembreteAgendamento (chain simples)
 * - followUpQualificadoNoshow (createReactAgent com Atualizar_tarefa)
 * - followUpPosConsulta (chain simples)
 */
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { EstadoFollowUpType } from '../estado.ts';
import { llmPrincipal } from '../../../lib/openai.ts';
import { carregarHistorico } from '../../../lib/memoria-chat.ts';
import { getCheckpointer } from '../../../lib/checkpointer.ts';
import { createLangfuseHandler, flushLangfuseHandler } from '../../../lib/langfuse.ts';
import { criarAtualizarTarefa } from '../../../ferramentas/atualizarTarefa.ts';
import { PROMPT_LEMBRETE_AGENDAMENTO } from '../prompts/lembrete-agendamento.ts';
import { buildPromptFollowUp } from '../prompts/follow-up.ts';
import { PROMPT_POS_CONSULTA } from '../prompts/pos-consulta.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'agentes_follow_up' });

const INPUT_QUALIFICADO = '<lead qualificado aguardando follow-up>';
const INPUT_NOSHOW = '<paciente com agendamento não compareceu>';
const INPUT_LEMBRETE = '<lead qualificado aguardando follow-up>';
const INPUT_POS_CONSULTA = '<paciente compareceu, enviar acompanhamento pós-consulta>';

// ---- Lembrete de agendamento (chain simples) ----
export async function agenteLembreteAgendamento(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  const historico = await carregarHistorico(estado.telefone, 50);
  const llm = llmPrincipal();
  const handler = createLangfuseHandler('agente-lembrete', {
    sessionId: estado.telefone,
    tags: ['follow-up', 'lembrete'],
  });
  try {
    const resp = await llm.invoke(
      [new SystemMessage(PROMPT_LEMBRETE_AGENDAMENTO), ...historico, new HumanMessage(INPUT_LEMBRETE)],
      { callbacks: handler ? [handler] : undefined },
    );
    const mensagem = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
    log.debug({ len: mensagem.length }, 'lembrete gerado');
    return { mensagem_gerada: mensagem };
  } finally {
    await flushLangfuseHandler(handler);
  }
}

// ---- Follow-up qualificado / no-show (ReAct com Atualizar_tarefa) ----
export async function agenteFollowUpQualificadoNoshow(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  const historico = await carregarHistorico(estado.telefone, 50);

  const tarefaCtx = {
    id: estado.id_tarefa,
    board: { id: estado.id_funil, steps: estado.etapas_funil },
    board_step: { id: estado.id_etapa_atual, name: estado.nome_etapa_atual },
  };

  const tool = criarAtualizarTarefa({
    idConta: estado.id_conta,
    tarefa: tarefaCtx,
    funil: { id: estado.id_funil, steps: estado.etapas_funil },
  });

  const checkpointer = await getCheckpointer();
  const agente = createReactAgent({
    llm: llmPrincipal(),
    tools: [tool],
    checkpointSaver: checkpointer,
    stateModifier: buildPromptFollowUp({
      etapasFunil: estado.etapas_funil,
      idEtapaAtual: estado.id_etapa_atual,
      nomeEtapaAtual: estado.nome_etapa_atual,
      tituleTarefa: estado.titulo_tarefa,
      descricaoTarefa: estado.descricao_tarefa,
      dueDade: estado.due_date,
    }),
  });

  const input = estado.nome_etapa_atual === 'Qualificado' ? INPUT_QUALIFICADO : INPUT_NOSHOW;

  const handler = createLangfuseHandler('agente-follow-up', {
    sessionId: estado.telefone,
    tags: ['follow-up', estado.nome_etapa_atual.toLowerCase()],
  });
  try {
    const resp = await agente.invoke(
      { messages: [...historico, new HumanMessage(input)] },
      {
        configurable: { thread_id: `followup-${estado.telefone}` },
        callbacks: handler ? [handler] : undefined,
      },
    );
    const msgs = resp.messages ?? [];
    const ultima = msgs[msgs.length - 1];
    const mensagem = ultima ? (typeof ultima.content === 'string' ? ultima.content : JSON.stringify(ultima.content)) : '';
    log.debug({ len: mensagem.length }, 'follow-up qualificado/noshow gerado');
    return { mensagem_gerada: mensagem };
  } finally {
    await flushLangfuseHandler(handler);
  }
}

// ---- Pós-consulta (chain simples) ----
export async function agenteFollowUpPosConsulta(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  const historico = await carregarHistorico(estado.telefone, 50);
  const llm = llmPrincipal();
  const handler = createLangfuseHandler('agente-pos-consulta', {
    sessionId: estado.telefone,
    tags: ['follow-up', 'pos-consulta'],
  });
  try {
    const resp = await llm.invoke(
      [new SystemMessage(PROMPT_POS_CONSULTA), ...historico, new HumanMessage(INPUT_POS_CONSULTA)],
      { callbacks: handler ? [handler] : undefined },
    );
    const mensagem = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
    log.debug({ len: mensagem.length }, 'pós-consulta gerado');
    return { mensagem_gerada: mensagem };
  } finally {
    await flushLangfuseHandler(handler);
  }
}
