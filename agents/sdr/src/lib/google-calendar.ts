/**
 * Google Calendar — wrapper sobre googleapis com Service Account.
 */
import { google, type calendar_v3 } from 'googleapis';
import { getGoogleAuth, SCOPES_CALENDAR } from './google-auth.ts';
import { createChildLogger } from './logger.ts';
import { TZ } from './datas.ts';

const log = createChildLogger({ modulo: 'google-calendar' });

let _cliente: calendar_v3.Calendar | null = null;

function cliente(): calendar_v3.Calendar {
  if (_cliente) return _cliente;
  const auth = getGoogleAuth(SCOPES_CALENDAR);
  _cliente = google.calendar({ version: 'v3', auth });
  return _cliente;
}

export interface OpcoesListarEventos {
  calendarId: string;
  timeMin?: string;
  timeMax?: string;
  q?: string;
  maxResults?: number;
}

export async function listarEventos(opts: OpcoesListarEventos): Promise<calendar_v3.Schema$Event[]> {
  const inicio = Date.now();
  try {
    const r = await cliente().events.list({
      calendarId: opts.calendarId,
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      q: opts.q,
      maxResults: opts.maxResults ?? 250,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: TZ,
    });
    log.debug({ duracaoMs: Date.now() - inicio, qtd: r.data.items?.length ?? 0 }, 'listarEventos ok');
    return r.data.items ?? [];
  } catch (err) {
    log.error({ err, calendarId: opts.calendarId, duracaoMs: Date.now() - inicio }, 'listarEventos falhou');
    throw err;
  }
}

export interface OpcoesCriarEvento {
  calendarId: string;
  inicio: string; // ISO 8601 com TZ
  fim: string;
  titulo: string;
  descricao?: string;
  emailsParticipantes?: string[];
  criarLinkMeet?: boolean;
}

export async function criarEvento(opts: OpcoesCriarEvento): Promise<calendar_v3.Schema$Event> {
  const requestBody: calendar_v3.Schema$Event = {
    summary: opts.titulo,
    description: opts.descricao,
    start: { dateTime: opts.inicio, timeZone: TZ },
    end: { dateTime: opts.fim, timeZone: TZ },
  };

  if (opts.emailsParticipantes?.length) {
    requestBody.attendees = opts.emailsParticipantes.map((email) => ({ email }));
  }

  if (opts.criarLinkMeet) {
    requestBody.conferenceData = {
      createRequest: { requestId: crypto.randomUUID() },
    };
  }

  try {
    const r = await cliente().events.insert({
      calendarId: opts.calendarId,
      conferenceDataVersion: opts.criarLinkMeet ? 1 : undefined,
      sendUpdates: opts.emailsParticipantes?.length ? 'all' : undefined,
      requestBody,
    });
    log.debug({ id: r.data.id }, 'criarEvento ok');
    return r.data;
  } catch (err: unknown) {
    // Service Account sem DWD não suporta attendees/Meet — retry sem eles
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('attendees') || msg.includes('Domain-Wide') || msg.includes('conference')) {
      log.warn({ motivo: msg.slice(0, 120) }, 'criarEvento sem attendees/meet (service account sem DWD)');
      delete requestBody.attendees;
      delete requestBody.conferenceData;
      const r2 = await cliente().events.insert({ calendarId: opts.calendarId, requestBody });
      log.debug({ id: r2.data.id }, 'criarEvento ok (fallback sem attendees)');
      return r2.data;
    }
    throw err;
  }
}

export interface OpcoesAtualizarEvento {
  calendarId: string;
  eventId: string;
  titulo?: string;
  descricao?: string;
  inicio?: string;
  fim?: string;
}

export async function atualizarEvento(opts: OpcoesAtualizarEvento): Promise<calendar_v3.Schema$Event> {
  const requestBody: calendar_v3.Schema$Event = {};
  if (opts.titulo !== undefined) requestBody.summary = opts.titulo;
  if (opts.descricao !== undefined) requestBody.description = opts.descricao;
  if (opts.inicio !== undefined) requestBody.start = { dateTime: opts.inicio, timeZone: TZ };
  if (opts.fim !== undefined) requestBody.end = { dateTime: opts.fim, timeZone: TZ };
  const r = await cliente().events.patch({
    calendarId: opts.calendarId,
    eventId: opts.eventId,
    requestBody,
  });
  log.debug({ id: r.data.id }, 'atualizarEvento ok');
  return r.data;
}

export async function deletarEvento(calendarId: string, eventId: string): Promise<void> {
  await cliente().events.delete({ calendarId, eventId });
  log.debug({ eventId }, 'deletarEvento ok');
}

/** Retorna true se há sobreposição de [aIni,aFim] com [bIni,bFim]. */
export function temConflito(
  aIni: string,
  aFim: string,
  bIni: string | null | undefined,
  bFim: string | null | undefined,
): boolean {
  if (!bIni || !bFim) return false;
  return new Date(aIni) < new Date(bFim) && new Date(bIni) < new Date(aFim);
}
