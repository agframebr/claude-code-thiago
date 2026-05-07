import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { EstadoFollowUpType } from '../estado.ts';
import { llmPrincipal } from '../../../lib/openai.ts';
import { carregarHistorico } from '../../../lib/memoria-chat.ts';
import { createLangfuseHandler, flushLangfuseHandler } from '../../../lib/langfuse.ts';
import { criarAtualizarTarefa } from '../../../ferramentas/atualizarTarefa.ts';
import { PROMPT_FOLLOW_UP_SEM_RESPOSTA, buildPromptFollowUpSemResposta } from '../prompts/follow-up-sem-resposta.ts';
import { PROMPT_POS_CALL } from '../prompts/pos-call.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'agentes_follow_up' });

// ---- Follow-up sem resposta (ReAct com Atualizar_tarefa) ----
export async function agenteFollowUpSemResposta(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  const historico = await carregarHistorico(estado.telefone, 30);

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

  const agente = createReactAgent({
    llm: llmPrincipal(),
    tools: [tool],
    stateModifier: buildPromptFollowUpSemResposta({
      etapasFunil: estado.etapas_funil,
      idEtapaAtual: estado.id_etapa_atual,
      nomeEtapaAtual: estado.nome_etapa_atual,
      tituleTarefa: estado.titulo_tarefa,
      descricaoTarefa: estado.descricao_tarefa,
      dueDade: estado.due_date,
    }),
  });

  const handler = createLangfuseHandler('agente-follow-up-sem-resposta', {
    sessionId: estado.telefone,
    tags: ['follow-up', 'sem-resposta', 'sdr'],
  });
  try {
    const resp = await agente.invoke(
      { messages: [...historico, new HumanMessage('<lead sem resposta — fazer follow-up>')]  },
      { callbacks: handler ? [handler] : undefined },
    );
    const msgs = resp.messages ?? [];
    const ultima = msgs[msgs.length - 1];
    const mensagem = ultima ? (typeof ultima.content === 'string' ? ultima.content : JSON.stringify(ultima.content)) : '';
    log.debug({ len: mensagem.length }, 'follow-up sem resposta gerado');
    return { mensagem_gerada: mensagem };
  } finally {
    await flushLangfuseHandler(handler);
  }
}

// ---- Pós-call (chain simples) ----
export async function agenteFollowUpPosCall(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  const historico = await carregarHistorico(estado.telefone, 30);
  const llm = llmPrincipal();
  const handler = createLangfuseHandler('agente-pos-call', {
    sessionId: estado.telefone,
    tags: ['follow-up', 'pos-call', 'sdr'],
  });
  try {
    const resp = await llm.invoke(
      [new SystemMessage(PROMPT_POS_CALL), ...historico, new HumanMessage('<sessão estratégica realizada — enviar follow-up>')],
      { callbacks: handler ? [handler] : undefined },
    );
    const mensagem = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
    log.debug({ len: mensagem.length }, 'pós-call gerado');
    return { mensagem_gerada: mensagem };
  } finally {
    await flushLangfuseHandler(handler);
  }
}
