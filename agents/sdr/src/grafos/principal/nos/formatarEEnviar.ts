/**
 * Nós de formatação e envio:
 * - formatar_texto: chain LLM (gpt-4.1-mini) que aplica regras WhatsApp
 * - formatar_ssml: chain LLM (gpt-4.1-mini) — só se modo áudio
 * - gerar_audio: ElevenLabs TTS
 * - marcar_recording: Chatwoot toggle_typing_status
 * - enviar_texto: Chatwoot sendMessage com split + delay dinâmico
 * - enviar_audio: Chatwoot sendFile com buffer mp3
 * - salvar_audio_meta: anota transcribed_text no anexo enviado
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { EstadoPrincipalType } from '../estado.ts';
import { llmFormatter } from '../../../lib/openai.ts';
import { gerarAudioTTS } from '../../../lib/elevenlabs.ts';
import {
  enviarMensagem,
  enviarArquivo,
  atualizarPresenca,
  atualizarMetadadosAnexo,
} from '../../../lib/chatwoot.ts';
import { PROMPT_FORMATAR_TEXTO } from '../prompts/formatar-texto.ts';
import { PROMPT_FORMATAR_SSML } from '../prompts/formatar-ssml.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'formatar_enviar' });

export async function formatarTexto(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  if (!estado.output_agente) return { texto_formatado: '' };
  const llm = llmFormatter();
  const resp = await llm.invoke([
    new SystemMessage(PROMPT_FORMATAR_TEXTO),
    new HumanMessage(estado.output_agente),
  ]);
  const texto = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
  log.debug({ entrada: estado.output_agente.length, saida: texto.length }, 'texto formatado');
  return { texto_formatado: texto };
}

export async function formatarSsml(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  if (!estado.output_agente) return { texto_ssml: '' };
  const llm = llmFormatter();
  const resp = await llm.invoke([
    new SystemMessage(PROMPT_FORMATAR_SSML),
    new HumanMessage(estado.output_agente),
  ]);
  const texto = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
  log.debug({ saida: texto.length }, 'ssml gerado');
  return { texto_ssml: texto };
}

export async function gerarAudioNo(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  if (!estado.texto_ssml) return { audio_buffer: null };
  const buffer = await gerarAudioTTS({ texto: estado.texto_ssml });
  log.debug({ bytes: buffer.length }, 'áudio gerado');
  return { audio_buffer: buffer };
}

export async function marcarRecording(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  try {
    await atualizarPresenca(estado.id_conta, estado.id_conversa, 'recording');
  } catch (err) {
    log.warn({ err }, 'falha ao marcar recording — ignorando');
  }
  return {};
}

export async function enviarTexto(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  if (!estado.texto_formatado) {
    log.warn('texto_formatado vazio — pulando envio');
    return {};
  }
  await enviarMensagem(estado.id_conta, estado.id_conversa, {
    content: estado.texto_formatado,
    splitMessage: true,
    waitBeforeSending: 'dynamic',
  });
  log.debug({ idConversa: estado.id_conversa }, 'texto enviado');
  return {};
}

export async function enviarAudio(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  if (!estado.audio_buffer) {
    log.warn('audio_buffer vazio — pulando envio');
    return {};
  }
  await enviarArquivo(estado.id_conta, estado.id_conversa, estado.audio_buffer, {
    nomeArquivo: 'mensagem.mp3',
    mimeType: 'audio/mpeg',
    isRecordedAudio: true,
    metadadosAnexo: { transcribed_text: estado.output_agente },
  });
  log.debug({ bytes: estado.audio_buffer.length }, 'áudio enviado');
  return {};
}

export async function salvarAudioMeta(
  _estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  // No-op: o transcribed_text já foi enviado junto via metadadosAnexo no enviarArquivo.
  // Mantido como nó separado para fidelidade ao grafo n8n; pode ser estendido se Chatwoot
  // exigir um PATCH adicional após o upload.
  return {};
}
