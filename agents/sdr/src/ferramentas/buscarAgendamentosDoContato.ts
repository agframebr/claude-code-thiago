import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { listarEventos } from '../lib/google-calendar.ts';
import { calendarIdParaProfissional } from '../dominio/id-agendas.ts';
import { createChildLogger } from '../lib/logger.ts';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.buscarAgendamentos' });

export function criarBuscarAgendamentosDoContato(ctx: Pick<ContextoAgente, 'telefone' | 'nome'>) {
  return tool(
    async ({ id_profissional }) => {
      log.debug({ id_profissional, telefone: ctx.telefone }, 'buscarAgendamentos chamado');
      const calendarId = calendarIdParaProfissional(id_profissional);

      let eventos = await listarEventos({ calendarId, q: ctx.telefone });

      // Fallback: busca pelo nome se não encontrou pelo telefone
      if (!eventos.length && ctx.nome) {
        eventos = await listarEventos({ calendarId, q: ctx.nome });
      }

      log.debug({ qtd: eventos.length }, 'buscarAgendamentos ok');
      return JSON.stringify({ agendamentos: eventos });
    },
    {
      name: 'Buscar_agendamentos_do_contato',
      description: 'Utilize essa ferramenta para buscar os agendamentos já existentes para o contato atual. Utilize antes de criar novos agendamentos, para evitar agendamentos duplicados.',
      schema: z.object({
        id_profissional: z.string(),
      }),
    },
  );
}
