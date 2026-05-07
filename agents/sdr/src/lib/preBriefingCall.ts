/**
 * Pré-briefing de call — 1h antes de cada Sessão Estratégica, manda dossier
 * pro Thiago no WhatsApp com:
 * - Resumo da conversa com o lead até agora
 * - Notas do card Kanban
 * - Link Meet
 * - Sugestões de pontos a explorar na call
 */
import { DateTime } from 'luxon';
import { config } from '../config.ts';
import { TELEFONE_THIAGO } from '../dominio/vetrik.ts';
import { listarEventos } from './google-calendar.ts';
import { listarTarefasKanban, buscarConversaPorTelefone, enviarMensagem } from './chatwoot.ts';
import { carregarHistorico } from './memoria-chat.ts';
import { llmFormatter } from './openai.ts';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { createChildLogger } from './logger.ts';

const log = createChildLogger({ modulo: 'preBriefingCall' });

const PROMPT_DOSSIER = `Você é a Ísys, assistente da Vetrik. Vai gerar um dossier curto e direto pro Thiago antes de uma Sessão Estratégica com lead.

Formato:
- Tom direto, executivo, listas curtas
- Máximo 8 linhas
- Destaque o que importa: contexto do lead, dor principal, sinais de fit, perguntas pra fazer

Estruture assim:
*Lead*: [nome]
*Contexto*: [1 frase sobre o negócio]
*Dor*: [principal queixa identificada]
*Fit*: [sinais — alto/médio/baixo, com 1 razão]
*Pergunte*: [2-3 perguntas táticas pra explorar]

NÃO use emojis no texto (só no início se for o título).
NÃO use travessão (—) no meio de frases.`;

interface CallProxima {
  eventId: string;
  inicio: DateTime;
  inicioISO: string;
  titulo: string;
  descricao: string;
  attendeeEmails: string[];
  linkMeet: string | null;
}

export async function listarCallsProximas1h(): Promise<CallProxima[]> {
  const agora = DateTime.now();
  const em1h = agora.plus({ hours: 1, minutes: 5 });
  const em10min = agora.plus({ minutes: 55 });

  const eventos = await listarEventos({
    calendarId: 'primary',
    timeMin: em10min.toISO()!,
    timeMax: em1h.toISO()!,
    maxResults: 20,
  });

  const calls: CallProxima[] = [];
  for (const e of eventos) {
    const ini = e.start?.dateTime;
    if (!ini || !e.id) continue;
    const dt = DateTime.fromISO(ini);
    calls.push({
      eventId: e.id,
      inicio: dt,
      inicioISO: ini,
      titulo: e.summary ?? '',
      descricao: e.description ?? '',
      attendeeEmails: (e.attendees ?? []).map((a) => a.email).filter(Boolean) as string[],
      linkMeet: e.hangoutLink ?? null,
    });
  }
  return calls;
}

async function gerarDossier(call: CallProxima): Promise<string> {
  // Tenta encontrar o card Kanban pelo email do attendee
  const tarefas = await listarTarefasKanban(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID).catch(() => []);
  const emailLead = call.attendeeEmails.find((e) => !e.includes('@vetrik') && !e.includes('@gmail.com')) ?? call.attendeeEmails[0] ?? '';

  let cardInfo = '';
  let telefoneLead = '';
  for (const t of tarefas) {
    const desc = t.description ?? '';
    if (emailLead && desc.includes(emailLead)) {
      cardInfo = desc;
      const matchTel = desc.match(/Telefone:\s*(\+\d+)/);
      if (matchTel) telefoneLead = matchTel[1] ?? '';
      break;
    }
  }

  // Histórico de conversa via memoria-chat
  let historicoTexto = '';
  if (telefoneLead) {
    try {
      const hist = await carregarHistorico(telefoneLead, 30);
      historicoTexto = hist.map((m) => {
        const tipo = m._getType?.() === 'human' ? 'Lead' : 'Ísys';
        const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${tipo}: ${c.slice(0, 200)}`;
      }).join('\n');
    } catch {
      // ignora
    }
  }

  const contextoBruto = [
    `Título da call: ${call.titulo}`,
    `Email do lead: ${emailLead}`,
    telefoneLead ? `Telefone: ${telefoneLead}` : '',
    cardInfo ? `\nNotas do card Kanban:\n${cardInfo}` : '',
    historicoTexto ? `\nHistórico da conversa (últimas mensagens):\n${historicoTexto}` : '(sem histórico de conversa)',
  ].filter(Boolean).join('\n');

  const llm = llmFormatter();
  const resp = await llm.invoke([
    new SystemMessage(PROMPT_DOSSIER),
    new HumanMessage(contextoBruto),
  ]);
  return typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
}

const _briefingsEnviados = new Set<string>();

export async function processarCallsProximas(): Promise<void> {
  try {
    const calls = await listarCallsProximas1h();
    for (const call of calls) {
      // chave única: eventId + dia (evita reenvio)
      const chave = `${call.eventId}-${call.inicio.toFormat('yyyy-MM-dd')}`;
      if (_briefingsEnviados.has(chave)) continue;

      const dossier = await gerarDossier(call);
      const inicioFmt = call.inicio.setZone('America/Sao_Paulo').toFormat("HH:mm 'de' EEEE", { locale: 'pt-BR' });

      const mensagem = [
        `🎯 *Pré-briefing pra call de ${inicioFmt}*`,
        ``,
        dossier,
        ``,
        call.linkMeet ? `🔗 ${call.linkMeet}` : '',
      ].filter(Boolean).join('\n');

      const conversa = await buscarConversaPorTelefone(config.CHATWOOT_ACCOUNT_ID, TELEFONE_THIAGO);
      if (conversa) {
        await enviarMensagem(config.CHATWOOT_ACCOUNT_ID, conversa.id, { content: mensagem });
        _briefingsEnviados.add(chave);
        log.info({ eventId: call.eventId, inicioFmt }, 'pré-briefing enviado');
      }
    }
  } catch (err) {
    log.error({ err }, 'erro no scheduler de pré-briefing');
  }
}

export function iniciarPreBriefingScheduler(): void {
  log.info('pré-briefing scheduler iniciado — verifica calls próximas a cada 5min');
  // Roda imediato na primeira vez (com delay) e depois a cada 5min
  setTimeout(processarCallsProximas, 30_000);
  setInterval(processarCallsProximas, 5 * 60_000);
}
