import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { deletarEvento } from '../lib/google-calendar.ts';
import { calendarIdParaProfissional } from '../dominio/id-agendas.ts';
import { createChildLogger } from '../lib/logger.ts';

const log = createChildLogger({ modulo: 'tool.cancelarAgendamento' });

export function criarCancelarAgendamento() {
  return tool(
    async ({ id_profissional, id_evento }) => {
      log.debug({ id_evento, id_profissional }, 'cancelarAgendamento chamado');
      const calendarId = calendarIdParaProfissional(id_profissional);
      await deletarEvento(calendarId, id_evento);
      log.debug({ id_evento }, 'cancelarAgendamento ok');
      return JSON.stringify({ resultado: 'CANCELADO' });
    },
    {
      name: 'Cancelar_agendamento',
      description: 'Utilize essa ferramenta para cancelar um agendamento.',
      schema: z.object({
        id_profissional: z.string(),
        id_evento: z.string(),
        motivo_cancelamento: z.string(),
      }),
    },
  );
}
