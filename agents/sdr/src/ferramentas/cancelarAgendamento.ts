import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { deletarEvento, listarEventos } from '../lib/google-calendar.ts';
import { calendarIdParaProfissional } from '../dominio/id-agendas.ts';
import { createChildLogger } from '../lib/logger.ts';
import { DateTime } from 'luxon';

const log = createChildLogger({ modulo: 'tool.cancelarAgendamento' });

export function criarCancelarAgendamento() {
  return tool(
    async ({ event_id, busca_termo }) => {
      log.debug({ event_id, busca_termo }, 'cancelarAgendamento chamado');
      const calendarId = calendarIdParaProfissional('thiago-vetrik');

      let idEvento = event_id;

      // Se não veio event_id mas veio termo de busca, encontra o evento mais próximo
      if (!idEvento && busca_termo) {
        const agora = DateTime.now();
        const eventos = await listarEventos({
          calendarId,
          timeMin: agora.toISO()!,
          timeMax: agora.plus({ months: 3 }).toISO()!,
          q: busca_termo,
          maxResults: 10,
        });
        if (!eventos.length) {
          return JSON.stringify({ erro: `Nenhum evento futuro encontrado com "${busca_termo}".` });
        }
        if (eventos.length > 1) {
          // Lista as opções pro agente decidir
          return JSON.stringify({
            multiplos_eventos: eventos.map((e) => ({
              id: e.id,
              titulo: e.summary,
              inicio: e.start?.dateTime,
              attendees: e.attendees?.map((a) => a.email).filter(Boolean),
            })),
            mensagem: 'Múltiplos eventos encontrados. Confirme qual cancelar passando event_id.',
          });
        }
        idEvento = eventos[0]!.id ?? undefined;
      }

      if (!idEvento) {
        return JSON.stringify({ erro: 'Forneça event_id ou busca_termo.' });
      }

      try {
        await deletarEvento(calendarId, idEvento);
        log.info({ event_id: idEvento }, 'evento cancelado');
        return JSON.stringify({ resultado: 'EVENTO CANCELADO', event_id: idEvento });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ err, event_id: idEvento }, 'falha ao cancelar evento');
        return JSON.stringify({ erro: `Falha ao cancelar: ${msg.slice(0, 200)}` });
      }
    },
    {
      name: 'Cancelar_agendamento',
      description: `Cancela UM evento específico no Google Calendar do Thiago.

Forma 1 (preferida): passa event_id se você já souber (ex: depois de Listar_minha_agenda).
Forma 2: passa busca_termo (nome do lead, palavra do título) — busca evento futuro com esse termo. Se houver mais de um, retorna lista pra você confirmar qual.

Use quando o Thiago pedir "cancela a reunião com X", "cancela o evento das 15h", etc. Não confunda com Cancelar_compromissos (que cancela TODOS).`,
      schema: z.object({
        event_id: z.string().optional().describe('ID do evento Google Calendar (preferencial).'),
        busca_termo: z.string().optional().describe('Termo de busca (nome do lead, palavra do título) caso não tenha o ID.'),
      }),
    },
  );
}
