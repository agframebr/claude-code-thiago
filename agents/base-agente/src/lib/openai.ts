/**
 * OpenAI — ChatOpenAI principal/formatter + Whisper.
 */
import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config.ts';
import { createChildLogger } from './logger.ts';

const log = createChildLogger({ modulo: 'openai' });

let _principal: ChatOpenAI | null = null;
let _formatter: ChatOpenAI | null = null;

/** LLM principal (Maria, follow-up, lembrete). */
export function llmPrincipal(): ChatOpenAI {
  if (_principal) return _principal;
  _principal = new ChatOpenAI({
    model: config.OPENAI_MODEL,
    apiKey: config.OPENAI_API_KEY,
  });
  return _principal;
}

/** LLM formatadores (formatar texto, formatar SSML) — modelo barato. */
export function llmFormatter(): ChatOpenAI {
  if (_formatter) return _formatter;
  _formatter = new ChatOpenAI({
    model: config.OPENAI_MODEL_FORMATTER,
    apiKey: config.OPENAI_API_KEY,
  });
  return _formatter;
}

/** Transcreve áudio via Whisper. */
export async function transcreverAudio(buffer: Buffer, opts: { mimeType?: string; nomeArquivo?: string; idioma?: string } = {}): Promise<string> {
  const mimeType = opts.mimeType ?? 'audio/ogg';
  const nomeArquivo = opts.nomeArquivo ?? `audio.${mimeType.split('/')[1] ?? 'ogg'}`;
  const idioma = opts.idioma ?? 'pt';

  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), nomeArquivo);
  fd.append('model', 'whisper-1');
  fd.append('language', idioma);

  const inicio = Date.now();
  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` },
    body: fd,
  });
  const duracaoMs = Date.now() - inicio;

  if (!resp.ok) {
    const erro = await resp.text().catch(() => '');
    log.error({ status: resp.status, duracaoMs, erro: erro.slice(0, 300) }, 'whisper falhou');
    throw new Error(`Whisper ${resp.status}: ${erro.slice(0, 200)}`);
  }
  const j = (await resp.json()) as { text?: string };
  log.debug({ duracaoMs, bytes: buffer.length, len: j.text?.length ?? 0 }, 'whisper ok');
  return j.text ?? '';
}
