/**
 * Smoke test M2 — valida services com credenciais reais (somente leitura).
 *
 * Uso: bun run scripts/smoke-services.ts
 *      bun run scripts/smoke-services.ts --tts   (inclui ElevenLabs — usa créditos)
 *      bun run scripts/smoke-services.ts --send  (inclui envio Chatwoot — escreve)
 */
import { config } from '../src/config.ts';
import { createChildLogger } from '../src/lib/logger.ts';
import { listarFunis, listarEtiquetas, enviarMensagem } from '../src/lib/chatwoot.ts';
import { listarEventos } from '../src/lib/google-calendar.ts';
import { llmFormatter, transcreverAudio } from '../src/lib/openai.ts';
import { gerarAudioTTS } from '../src/lib/elevenlabs.ts';
import { carregarHistorico } from '../src/lib/memoria-chat.ts';
import { fecharPool } from '../src/lib/db.ts';
import { agora } from '../src/lib/datas.ts';
import { HumanMessage } from '@langchain/core/messages';

const log = createChildLogger({ teste: 'smoke-services' });
let falhas = 0;
const incluirTTS = process.argv.includes('--tts');
const incluirEnvio = process.argv.includes('--send');

const ok = (n: string, d?: Record<string, unknown>) => log.info({ nome: n, ...d }, '✓ ok');
const fail = (n: string, e: unknown) => {
  falhas++;
  log.error({ nome: n, err: e instanceof Error ? e.message : e }, '✗ falhou');
};

// 1) Chatwoot — listar funis kanban (read-only)
try {
  const funis = await listarFunis(config.CHATWOOT_ACCOUNT_ID);
  ok('chatwoot.listarFunis', { qtd: funis.length, nomes: funis.map((f) => f.name).slice(0, 5) });
} catch (err) {
  fail('chatwoot.listarFunis', err);
}

// 2) Chatwoot — listar etiquetas da conversa de alerta (read-only)
try {
  const labels = await listarEtiquetas(config.CHATWOOT_ALERT_ACCOUNT_ID, config.CHATWOOT_ALERT_CONVERSATION_ID);
  ok('chatwoot.listarEtiquetas', { qtd: labels.length, labels });
} catch (err) {
  fail('chatwoot.listarEtiquetas', err);
}

// 3) Google Calendar — listar próximos eventos (read-only)
try {
  const dt = agora();
  const eventos = await listarEventos({
    calendarId: config.CALENDAR_ID_THIAGO_FIGUEREDO,
    timeMin: dt.toISO()!,
    timeMax: dt.plus({ days: 30 }).toISO()!,
    maxResults: 10,
  });
  ok('calendar.listarEventos', { qtd: eventos.length, primeiros: eventos.slice(0, 3).map((e) => ({ inicio: e.start?.dateTime, titulo: e.summary })) });
} catch (err) {
  fail('calendar.listarEventos', err);
}

// 4) OpenAI — chat trivial via formatter (modelo barato)
try {
  const llm = llmFormatter();
  const resp = await llm.invoke([new HumanMessage('Responda apenas com a palavra: OK')]);
  const texto = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
  if (!texto.toUpperCase().includes('OK')) throw new Error(`resposta inesperada: ${texto.slice(0, 80)}`);
  ok('openai.chat', { modelo: config.OPENAI_MODEL_FORMATTER, resposta: texto.slice(0, 80) });
} catch (err) {
  fail('openai.chat', err);
}

// 5) memoria-chat — carregar (mesmo que vazio) telefone fictício
try {
  const hist = await carregarHistorico('+55-smoke-test-0000', 10);
  ok('memoria-chat.carregarHistorico', { qtd: hist.length });
} catch (err) {
  fail('memoria-chat.carregarHistorico', err);
}

// 6) ElevenLabs TTS (opcional — usa créditos)
if (incluirTTS) {
  try {
    const buffer = await gerarAudioTTS({ texto: 'Olá, este é um teste.' });
    if (buffer.length < 1000) throw new Error(`buffer suspeito: ${buffer.length} bytes`);
    ok('elevenlabs.gerarAudioTTS', { bytes: buffer.length });

    // bonus: round-trip pelo Whisper
    try {
      const transcricao = await transcreverAudio(buffer, { mimeType: 'audio/mpeg', nomeArquivo: 'tts.mp3' });
      ok('openai.transcreverAudio', { transcricao });
    } catch (err) {
      fail('openai.transcreverAudio', err);
    }
  } catch (err) {
    fail('elevenlabs.gerarAudioTTS', err);
  }
} else {
  log.warn('elevenlabs/whisper pulado — passe --tts para incluir');
}

// 7) Envio Chatwoot (opcional)
if (incluirEnvio) {
  try {
    const msg = await enviarMensagem(config.CHATWOOT_ALERT_ACCOUNT_ID, config.CHATWOOT_ALERT_CONVERSATION_ID, {
      content: `[smoke ${agora().toISO()}] teste de envio do agente vetrik`,
    });
    ok('chatwoot.enviarMensagem', { msgIds: Array.isArray(msg) ? msg.map((m) => m.id) : msg.id });
  } catch (err) {
    fail('chatwoot.enviarMensagem', err);
  }
} else {
  log.warn('chatwoot.enviarMensagem pulado — passe --send para incluir');
}

await fecharPool();

if (falhas > 0) {
  log.error({ falhas }, 'smoke services FALHOU');
  process.exit(1);
}
log.info('smoke services PASSOU');
process.exit(0);
