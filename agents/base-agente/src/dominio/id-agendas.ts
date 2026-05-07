/**
 * Mapa idProfissional → calendarId Google Calendar.
 * VETRIK: único profissional é o Thiago Figueredo.
 */
import { config } from '../config.ts';

export const idAgendas: Record<string, string> = {
  'thiago-vetrik': config.CALENDAR_ID_THIAGO_FIGUEREDO,
};

export function calendarIdParaProfissional(idProfissional: string): string {
  const id = idAgendas[idProfissional] ?? idAgendas['thiago-vetrik'];
  if (!id) throw new Error('CALENDAR_ID_THIAGO_FIGUEREDO não configurado');
  return id;
}
