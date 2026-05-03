import { StateGraph, END } from '@langchain/langgraph';
import { EstadoFollowUp, type EstadoFollowUpType } from './estado.ts';
import { extrairPayloadFollowUp } from './nos/extrairPayload.ts';
import { buscarInfoFunil } from './nos/buscarInfoFunil.ts';
import { atualizarDataTarefa } from './nos/atualizarDataTarefa.ts';
import {
  agenteLembreteAgendamento,
  agenteFollowUpQualificadoNoshow,
  agenteFollowUpPosConsulta,
} from './nos/agentes.ts';
import { enviarMensagemFollowUp } from './nos/enviarMensagem.ts';
import { moverParaPosVenda } from './nos/moverParaPosVenda.ts';
import { getCheckpointer } from '../../lib/checkpointer.ts';
import { createLangfuseHandler, flushLangfuseHandler } from '../../lib/langfuse.ts';
import { createChildLogger } from '../../lib/logger.ts';
import type { PayloadWebhook } from '../../tipos.ts';

const log = createChildLogger({ grafo: 'follow-up' });

function roteadorEvento(estado: EstadoFollowUpType): string {
  if (estado.evento === 'kanban_task_updated') return 'verificar_compareceu_ou_noshow';
  return 'buscar_info_funil';
}

function verificarCompareceuOuNoshow(estado: EstadoFollowUpType): string {
  const nomeAtual = estado.etapa_atual_para_renovacao ?? '';
  if (['Diagnóstico Feito', 'No-show'].includes(nomeAtual)) return 'atualizar_data_tarefa';
  return END;
}

function classificarTipoFollowUp(estado: EstadoFollowUpType): string {
  const nome = estado.nome_etapa_atual;
  if (['Qualificado', 'No-show'].includes(nome)) return 'agente_qualificado_noshow';
  if (nome === 'Diagnóstico Agendado') return 'agente_lembrete';
  if (nome === 'Diagnóstico Feito') return 'agente_pos_consulta';
  return END;
}

let _grafo: Awaited<ReturnType<typeof buildGrafo>> | null = null;

async function buildGrafo() {
  const checkpointer = await getCheckpointer();

  const builder = new StateGraph(EstadoFollowUp)
    .addNode('extrair_payload', extrairPayloadFollowUp)
    .addNode('verificar_compareceu_ou_noshow', async (e) => {
      // nó de roteamento puro — só retorna vazio, a lógica está no edge
      return {};
    })
    .addNode('atualizar_data_tarefa', atualizarDataTarefa)
    .addNode('buscar_info_funil', buscarInfoFunil)
    .addNode('classificar_tipo', async (e: EstadoFollowUpType) => {
      const nome = e.nome_etapa_atual;
      let tipo: EstadoFollowUpType['tipo_follow_up'] = 'ignorar';
      if (['Qualificado', 'No-show'].includes(nome)) tipo = 'qualificado_noshow';
      else if (nome === 'Diagnóstico Agendado') tipo = 'lembrete_agendamento';
      else if (nome === 'Diagnóstico Feito') tipo = 'pos_consulta';
      return { tipo_follow_up: tipo };
    })
    .addNode('agente_lembrete', agenteLembreteAgendamento)
    .addNode('agente_qualificado_noshow', agenteFollowUpQualificadoNoshow)
    .addNode('agente_pos_consulta', agenteFollowUpPosConsulta)
    .addNode('enviar_mensagem', enviarMensagemFollowUp)
    .addNode('mover_para_pos_venda', moverParaPosVenda)

    .addEdge('__start__', 'extrair_payload')
    .addConditionalEdges('extrair_payload', roteadorEvento, {
      verificar_compareceu_ou_noshow: 'verificar_compareceu_ou_noshow',
      buscar_info_funil: 'buscar_info_funil',
    })
    // kanban_task_updated
    .addConditionalEdges('verificar_compareceu_ou_noshow', verificarCompareceuOuNoshow, {
      atualizar_data_tarefa: 'atualizar_data_tarefa',
      [END]: END,
    })
    .addEdge('atualizar_data_tarefa', END)
    // kanban_task_overdue
    .addEdge('buscar_info_funil', 'classificar_tipo')
    .addConditionalEdges('classificar_tipo', classificarTipoFollowUp, {
      agente_lembrete: 'agente_lembrete',
      agente_qualificado_noshow: 'agente_qualificado_noshow',
      agente_pos_consulta: 'agente_pos_consulta',
      [END]: END,
    })
    .addEdge('agente_lembrete', 'enviar_mensagem')
    .addEdge('agente_qualificado_noshow', 'enviar_mensagem')
    .addEdge('agente_pos_consulta', 'enviar_mensagem')
    .addConditionalEdges('enviar_mensagem', (e) => {
      return e.tipo_follow_up === 'pos_consulta' ? 'mover_para_pos_venda' : END;
    }, {
      mover_para_pos_venda: 'mover_para_pos_venda',
      [END]: END,
    })
    .addEdge('mover_para_pos_venda', END);

  return builder.compile({ checkpointer });
}

export async function invocarGrafoFollowUp(payload: PayloadWebhook): Promise<void> {
  if (!_grafo) _grafo = await buildGrafo();

  const handler = createLangfuseHandler('grafo-follow-up', {
    tags: ['follow-up', payload.event],
  });

  const inicio = Date.now();
  try {
    await _grafo.invoke(
      { payload_webhook: payload as unknown as Record<string, unknown> },
      {
        configurable: { thread_id: `followup-evento-${Date.now()}` },
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
