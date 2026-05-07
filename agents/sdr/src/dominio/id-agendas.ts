/**
 * Mapa idProfissional → calendarId Google Calendar.
 * VETRIK: único profissional é o Thiago Figueredo.
 *
 * Usa 'primary' (calendário primário do user OAuth2 = Thiago) para que:
 * - Eventos criados manualmente apareçam no mesmo calendário onde o Calendly cria
 * - Calendly veja os eventos manuais como conflito (e não ofereça aquele horário ao lead)
 * - Buscas de eventos retornem TUDO (manual + Calendly + reuniões pessoais)
 */

export const idAgendas: Record<string, string> = {
  'thiago-vetrik': 'primary',
};

export function calendarIdParaProfissional(idProfissional: string): string {
  const id = idAgendas[idProfissional] ?? idAgendas['thiago-vetrik'];
  if (!id) throw new Error('Calendário do profissional não configurado');
  return id;
}
