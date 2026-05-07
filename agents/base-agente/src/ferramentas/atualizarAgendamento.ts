import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { atualizarEvento } from '../lib/google-calendar.ts';
import { calendarIdParaProfissional } from '../dominio/id-agendas.ts';
import { createChildLogger } from '../lib/logger.ts';

const log = createChildLogger({ modulo: 'tool.atualizarAgendamento' });

export function criarAtualizarAgendamento() {
  return tool(
    async ({ id_evento, titulo, descricao, id_profissional }) => {
      log.debug({ id_evento, id_profissional }, 'atualizarAgendamento chamado');
      const calendarId = calendarIdParaProfissional(id_profissional);
      const evento = await atualizarEvento({ calendarId, eventId: id_evento, titulo, descricao });
      log.debug({ id: evento.id }, 'atualizarAgendamento ok');
      return JSON.stringify({ resultado: 'AGENDAMENTO ATUALIZADO', evento });
    },
    {
      name: 'Atualizar_agendamento',
      description: `Utilize essa ferramenta para atualizar informações no título e descrição do evento.

* Ao atualizar o título e descrição, sempre verifique se você está mantendo informações anteriores que ainda são relevantes. Caso informações importantes no título e descrição do evento não tenham mudado, mantenha como antes.
* Não pode ser utilizada para atualizar o horário do agendamento, para isso, remova o evento e crie outro utilizando as outras ferramentas.`,
      schema: z.object({
        id_evento: z.string(),
        titulo: z.string(),
        descricao: z.string(),
        id_profissional: z.string(),
      }),
    },
  );
}
