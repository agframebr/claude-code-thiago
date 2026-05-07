import { StateGraph, END } from '@langchain/langgraph';
import { EstadoFollowUp, type EstadoFollowUpType } from './estado.ts';
import { extrairPayloadFollowUp } from './nos/extrairPayload.ts';
import { buscarInfoFunil } from './nos/buscarInfoFunil.ts';
import { atualizarDataTarefa } from './nos/atualizarDataTarefa.ts';
import { agenteFollowUpSemResposta, agenteFollowUpPosCall } from './nos/agentes.ts';
import { enviarMensagemFollowUp } from './nos/enviarMensagem.ts';
import { getCheckpointer } from '../../lib/checkpointer.ts';
import { createLangfuseHandler, flushLangfuseHandler } from '../../lib/langfuse.ts';
import { createChildLogger } from '../../lib/logger.ts';
import type { PayloadWebhook } from '../../tipos.ts';

const log = createChildLogger({ grafo: 'follow-up' });

// kanban_task_updated — só processa quando stage muda para "Call Realizada"
function roteadorEvento(estado: EstadoFollowUpType): string {
  if (estado.evento === 'kanban_task_updated') return 'verificar_call_realizada';
  return 'buscar_info_funil';
}

function verificarCallRealizada(estado: EstadoFollowUpType): string {
  const nomeAtual = estado.etapa_atual_para_renovacao ?? '';
  if (nomeAtual === 'Call Realizada') return 'atualizar_data_tarefa';
  return END;
}

// kanban_task_overdue — classifica pelo nome da etapa atual
function classificarTipoFollowUp(estado: EstadoFollowUpType): string {
  const nome = estado.nome_etapa_atual;
  if (['Mapeado', 'Contato Feito', 'Respondeu'].includes(nome)) return 'agente_sem_resposta';
  if (nome === 'Call Realizada') return 'agente_pos_call';
  return END;
}

let _grafo: Awaited<ReturnType<typeof buildGrafo>> | null = null;

async function buildGrafo() {
  const checkpointer = await getCheckpointer();

  const builder = new StateGraph(EstadoFollowUp)
    .addNode('extrair_payload', extrairPayloadFollowUp)
    .addNode('verificar_call_realizada', async (_e) => ({}))
    .addNode('atualizar_data_tarefa', atualizarDataTarefa)
    .addNode('buscar_info_funil', buscarInfoFunil)
    .addNode('classificar_tipo', async (e: EstadoFollowUpType) => {
      const nome = e.nome_etapa_atual;
      let tipo: EstadoFollowUpType['tipo_follow_up'] = 'ignorar';
      if (['Mapeado', 'Contato Feito', 'Respondeu'].includes(nome)) tipo = 'sem_resposta';
      else if (nome === 'Call Realizada') tipo = 'pos_call';
      return { tipo_follow_up: tipo };
    })
    .addNode('agente_sem_resposta', agenteFollowUpSemResposta)
    .addNode('agente_pos_call', agenteFollowUpPosCall)
    .addNode('enviar_mensagem', enviarMensagemFollowUp)

    .addEdge('__start__', 'extrair_payload')
    .addConditionalEdges('extrair_payload', roteadorEvento, {
      verificar_call_realizada: 'verificar_call_realizada',
      buscar_info_funil: 'buscar_info_funil',
    })
    .addConditionalEdges('verificar_call_realizada', verificarCallRealizada, {
      atualizar_data_tarefa: 'atualizar_data_tarefa',
      [END]: END,
    })
    .addEdge('atualizar_data_tarefa', 'buscar_info_funil')
    .addEdge('buscar_info_funil', 'classificar_tipo')
    .addConditionalEdges('classificar_tipo', classificarTipoFollowUp, {
      agente_sem_resposta: 'agente_sem_resposta',
      agente_pos_call: 'agente_pos_call',
      [END]: END,
    })
    .addEdge('agente_sem_resposta', 'enviar_mensagem')
    .addEdge('agente_pos_call', 'enviar_mensagem')
    .addEdge('enviar_mensagem', END);

  return builder.compile({ checkpointer });
}

export async function invocarGrafoFollowUp(payload: PayloadWebhook): Promise<void> {
  if (!_grafo) _grafo = await buildGrafo();

  const handler = createLangfuseHandler('grafo-follow-up', {
    tags: ['follow-up', 'sdr', payload.event],
  });

  const inicio = Date.now();
  try {
    await _grafo.invoke(
      { payload_webhook: payload as unknown as Record<string, unknown> },
      {
        configurable: { thread_id: `followup-${Date.now()}` },
        callbacks: handler ? [handler] : undefined,
      },
    );
    log.info({ evento: payload.event, duracaoMs: Date.now() - inicio }, 'grafo follow-up concluído');
  } catch (err) {
    log.error({ err, evento: payload.event }, 'erro no grafo follow-up');
    throw err;
  } finally {
    await flushLangfuseHandler(handler);
  }
}
