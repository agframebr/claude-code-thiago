/**
 * Grafo principal Maria — 29 nós encadeados.
 *
 * Fluxo (Plano §4.29):
 *   START → extrair_info → verificar_reset
 *     ├─ reset           → resetar_conversa → END
 *     ├─ habilitar_teste → habilitar_teste  → END
 *     └─ processar       → verificar_agente_ativo
 *           ├─ ignorar  → END
 *           └─ ativo    → processar_tipo_mensagem → extrair_mensagem
 *                         → salvar_transcricao? → verificar_mensagem_referenciada
 *                         → enfileirar_mensagem → esperar_debounce (16s)
 *                         → verificar_mensagem_encavalada
 *                              ├─ encavalada → END
 *                              └─ não → verificar_lock
 *                                       ├─ lock → END
 *                                       └─ livre → bloquear_lock → limpar_fila
 *                                                  → marcar_como_lida → coletar_mensagens
 *                                                  → invocar_agente
 *                                                      ├─ vazio → liberar_lock → END
 *                                                      └─ ok → salvar_tool_calls? → formatar_texto
 *                                                              ├─ áudio → formatar_ssml → gerar_audio
 *                                                              │           → marcar_recording → enviar_audio
 *                                                              │           → salvar_audio_meta → verificar_msg_durante_resposta
 *                                                              └─ texto → enviar_texto → verificar_msg_durante_resposta
 *                                                              → liberar_lock → END
 */
import { StateGraph, END } from '@langchain/langgraph';
import { EstadoPrincipal, type EstadoPrincipalType } from './estado.ts';
import { extrairInfo } from './nos/extrairInfo.ts';
import { verificarReset, verificarAgenteAtivo } from './nos/roteamento.ts';
import { resetarConversa, habilitarTeste } from './nos/resetarConversa.ts';
import {
  processarTipoMensagem,
  extrairMensagem,
  salvarTranscricao,
  verificarMensagemReferenciada,
} from './nos/processarTipoMensagem.ts';
import {
  enfileirarMensagem,
  esperarDebounce,
  verificarMensagemEncavalada,
  verificarLock,
  bloquearLock,
  liberarLock,
  limparFila,
  marcarComoLidaNo,
  coletarMensagens,
  verificarMsgDuranteResposta,
} from './nos/debounceLock.ts';
import { invocarAgente, salvarToolCallsNo } from './nos/invocarAgente.ts';
import {
  formatarTexto,
  formatarSsml,
  gerarAudioNo,
  marcarRecording,
  enviarTexto,
  enviarAudio,
  salvarAudioMeta,
} from './nos/formatarEEnviar.ts';
import { getCheckpointer } from '../../lib/checkpointer.ts';
import { createLangfuseHandler, flushLangfuseHandler } from '../../lib/langfuse.ts';
import { createChildLogger } from '../../lib/logger.ts';
import type { PayloadWebhook } from '../../tipos.ts';

const log = createChildLogger({ grafo: 'principal' });

// ---- Funções de roteamento condicional ----
function rotaPorReset(e: EstadoPrincipalType): string {
  if (e.acao === 'reset') return 'resetar_conversa';
  if (e.acao === 'habilitar_teste') return 'habilitar_teste';
  return 'verificar_agente_ativo';
}

function rotaPorAgenteAtivo(e: EstadoPrincipalType): string {
  if (e.acao === 'ignorar') return END;
  return 'processar_tipo_mensagem';
}

function rotaPorEncavalada(e: EstadoPrincipalType): string {
  return e.encavalada ? END : 'verificar_lock';
}

function rotaPorLock(e: EstadoPrincipalType): string {
  return e.acao === 'ignorar' ? END : 'bloquear_lock';
}

function rotaPorOutputAgente(e: EstadoPrincipalType): string {
  if (!e.output_agente || e.output_agente.trim() === '') return 'liberar_lock';
  return e.steps_intermediarios?.length ? 'salvar_tool_calls' : 'formatar_texto';
}

function rotaPorAudio(e: EstadoPrincipalType): string {
  return e.mensagem_de_audio ? 'formatar_ssml' : 'enviar_texto';
}

let _grafo: Awaited<ReturnType<typeof buildGrafo>> | null = null;

async function buildGrafo() {
  const checkpointer = await getCheckpointer();

  const builder = new StateGraph(EstadoPrincipal)
    // Nós de extração e roteamento inicial
    .addNode('extrair_info', extrairInfo)
    .addNode('verificar_reset', verificarReset)
    .addNode('resetar_conversa', resetarConversa)
    .addNode('habilitar_teste', habilitarTeste)
    .addNode('verificar_agente_ativo', verificarAgenteAtivo)

    // Processamento da mensagem
    .addNode('processar_tipo_mensagem', processarTipoMensagem)
    .addNode('extrair_mensagem', extrairMensagem)
    .addNode('salvar_transcricao', salvarTranscricao)
    .addNode('verificar_mensagem_referenciada', verificarMensagemReferenciada)

    // Debounce + lock
    .addNode('enfileirar_mensagem', enfileirarMensagem)
    .addNode('esperar_debounce', esperarDebounce)
    .addNode('verificar_mensagem_encavalada', verificarMensagemEncavalada)
    .addNode('verificar_lock', verificarLock)
    .addNode('bloquear_lock', bloquearLock)
    .addNode('limpar_fila', limparFila)
    .addNode('marcar_como_lida', marcarComoLidaNo)
    .addNode('coletar_mensagens', coletarMensagens)

    // Agente Maria
    .addNode('invocar_agente', invocarAgente)
    .addNode('salvar_tool_calls', salvarToolCallsNo)

    // Formatação e envio
    .addNode('formatar_texto', formatarTexto)
    .addNode('formatar_ssml', formatarSsml)
    .addNode('gerar_audio', gerarAudioNo)
    .addNode('marcar_recording', marcarRecording)
    .addNode('enviar_texto', enviarTexto)
    .addNode('enviar_audio', enviarAudio)
    .addNode('salvar_audio_meta', salvarAudioMeta)

    // Encerramento
    .addNode('verificar_msg_durante_resposta', verificarMsgDuranteResposta)
    .addNode('liberar_lock', liberarLock)

    // ---- Edges ----
    .addEdge('__start__', 'extrair_info')
    .addEdge('extrair_info', 'verificar_reset')

    .addConditionalEdges('verificar_reset', rotaPorReset, {
      resetar_conversa: 'resetar_conversa',
      habilitar_teste: 'habilitar_teste',
      verificar_agente_ativo: 'verificar_agente_ativo',
    })
    .addEdge('resetar_conversa', END)
    .addEdge('habilitar_teste', END)

    .addConditionalEdges('verificar_agente_ativo', rotaPorAgenteAtivo, {
      processar_tipo_mensagem: 'processar_tipo_mensagem',
      [END]: END,
    })

    .addEdge('processar_tipo_mensagem', 'extrair_mensagem')
    .addEdge('extrair_mensagem', 'salvar_transcricao')
    .addEdge('salvar_transcricao', 'verificar_mensagem_referenciada')
    .addEdge('verificar_mensagem_referenciada', 'enfileirar_mensagem')
    .addEdge('enfileirar_mensagem', 'esperar_debounce')
    .addEdge('esperar_debounce', 'verificar_mensagem_encavalada')

    .addConditionalEdges('verificar_mensagem_encavalada', rotaPorEncavalada, {
      verificar_lock: 'verificar_lock',
      [END]: END,
    })

    .addConditionalEdges('verificar_lock', rotaPorLock, {
      bloquear_lock: 'bloquear_lock',
      [END]: END,
    })

    .addEdge('bloquear_lock', 'limpar_fila')
    .addEdge('limpar_fila', 'marcar_como_lida')
    .addEdge('marcar_como_lida', 'coletar_mensagens')
    .addEdge('coletar_mensagens', 'invocar_agente')

    .addConditionalEdges('invocar_agente', rotaPorOutputAgente, {
      liberar_lock: 'liberar_lock',
      salvar_tool_calls: 'salvar_tool_calls',
      formatar_texto: 'formatar_texto',
    })

    .addEdge('salvar_tool_calls', 'formatar_texto')

    .addConditionalEdges('formatar_texto', rotaPorAudio, {
      formatar_ssml: 'formatar_ssml',
      enviar_texto: 'enviar_texto',
    })

    // Fluxo áudio
    .addEdge('formatar_ssml', 'gerar_audio')
    .addEdge('gerar_audio', 'marcar_recording')
    .addEdge('marcar_recording', 'enviar_audio')
    .addEdge('enviar_audio', 'salvar_audio_meta')
    .addEdge('salvar_audio_meta', 'verificar_msg_durante_resposta')

    // Fluxo texto
    .addEdge('enviar_texto', 'verificar_msg_durante_resposta')

    // Encerramento comum
    .addEdge('verificar_msg_durante_resposta', 'liberar_lock')
    .addEdge('liberar_lock', END);

  return builder.compile({ checkpointer });
}

export async function invocarGrafoPrincipal(payload: PayloadWebhook): Promise<void> {
  if (!_grafo) _grafo = await buildGrafo();

  // sessionId = telefone (extraído após o nó extrair_info — mas precisamos antes para langfuse)
  const sender = (payload as unknown as Record<string, unknown>).sender as Record<string, unknown> ?? {};
  const additional = (sender.additional_attributes as Record<string, unknown>) ?? {};
  const social = (additional.social_profiles as Record<string, string>) ?? {};
  const telefoneAprox = String(sender.phone_number ?? social.instagram ?? sender.identifier ?? '');
  const idContato = Number(
    ((payload.conversation as unknown as Record<string, unknown>)?.contact_inbox as Record<string, unknown>)?.contact_id ?? 0,
  );

  const handler = createLangfuseHandler('grafo-principal', {
    sessionId: telefoneAprox || `msg-${payload.id}`,
    userId: idContato ? `chatwoot-${idContato}` : undefined,
    tags: ['atendimento', 'clinica-moreira'],
  });

  const inicio = Date.now();
  try {
    await _grafo.invoke(
      { payload_webhook: payload as unknown as Record<string, unknown> },
      {
        configurable: { thread_id: telefoneAprox || `msg-${payload.id}` },
        callbacks: handler ? [handler] : undefined,
        recursionLimit: 50,
      },
    );
    log.info({ telefone: telefoneAprox, idMsg: payload.id, duracaoMs: Date.now() - inicio }, 'grafo principal concluído');
  } catch (err) {
    log.error({ err, idMsg: payload.id, telefone: telefoneAprox }, 'erro no grafo principal');
    throw err;
  } finally {
    await flushLangfuseHandler(handler);
  }
}
