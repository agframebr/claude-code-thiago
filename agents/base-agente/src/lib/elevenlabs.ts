/**
 * ElevenLabs TTS — voz Keren (eleven_flash_v2_5).
 */
import { config } from '../config.ts';
import { createChildLogger } from './logger.ts';

const log = createChildLogger({ modulo: 'elevenlabs' });

export interface OpcoesTTS {
  texto: string;
  voiceId?: string;
  modelId?: string;
  estabilidade?: number;
  similaridade?: number;
  velocidade?: number;
  outputFormat?: string;
  languageCode?: string;
}

export async function gerarAudioTTS(opts: OpcoesTTS): Promise<Buffer> {
  const voiceId = opts.voiceId ?? config.ELEVENLABS_VOICE_ID;
  const modelId = opts.modelId ?? 'eleven_flash_v2_5';
  const outputFormat = opts.outputFormat ?? 'mp3_44100_32';
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${outputFormat}&language_code=${opts.languageCode ?? 'pt-BR'}`;

  const inicio = Date.now();
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': config.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: opts.texto,
      model_id: modelId,
      voice_settings: {
        stability: opts.estabilidade ?? 0.35,
        similarity_boost: opts.similaridade ?? 0.44,
        speed: opts.velocidade ?? 1.1,
      },
    }),
  });

  const duracaoMs = Date.now() - inicio;
  if (!resp.ok) {
    const erro = await resp.text().catch(() => '');
    log.error({ status: resp.status, duracaoMs, erro: erro.slice(0, 300) }, 'tts falhou');
    throw new Error(`ElevenLabs TTS ${resp.status}: ${erro.slice(0, 200)}`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  log.debug({ duracaoMs, bytes: buffer.length, voiceId, modelId }, 'tts ok');
  return buffer;
}
