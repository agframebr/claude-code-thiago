import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { listarEventos } from '../lib/google-calendar.ts';
import { calendarIdParaProfissional } from '../dominio/id-agendas.ts';
import { createChildLogger } from '../lib/logger.ts';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.buscarAgendamentos' });

export function criarBuscarAgendamentosDoContato(ctx: Pick<ContextoAgente, 'telefone' | 'nome' | 'tarefa'>) {
  return tool(
    async ({ id_profissional }) => {
      log.debug({ id_profissional, telefone: ctx.telefone }, 'buscarAgendamentos chamado');

      const agendamentos: Array<{ fonte: string; resumo: string; inicio?: string; link?: string }> = [];

      // 1. Lê dados do agendamento da descrição da tarefa Kanban (fonte mais confiável)
      const descricao = ctx.tarefa?.description ?? '';
      if (descricao.includes('Sessão Estratégica agendada')) {
        const linhas = descricao.split('\n');
        const data = linhas.find((l) => l.startsWith('Data:'))?.replace('Data:', '').trim();
        const meet = linhas.find((l) => l.startsWith('Meet:'))?.replace('Meet:', '').trim();
        agendamentos.push({
          fonte: 'kanban',
          resumo: `Sessão Estratégica${data ? ` — ${data}` : ''}`,
          inicio: data,
          link: meet,
        });
      }

      // 2. Busca no Google Calendar (eventos criados manualmente pela Ísys)
      try {
        const calendarId = calendarIdParaProfissional(id_profissional);
        let eventos = await listarEventos({ calendarId, q: ctx.telefone });
        if (!eventos.length && ctx.nome) {
          eventos = await listarEventos({ calendarId, q: ctx.nome });
        }
        for (const e of eventos) {
          agendamentos.push({
            fonte: 'google_calendar',
            resumo: e.summary ?? '',
            inicio: e.start?.dateTime ?? e.start?.date ?? undefined,
            link: e.hangoutLink ?? e.location ?? undefined,
          });
        }
        log.debug({ gcal: eventos.length }, 'buscarAgendamentos gcal ok');
      } catch (err) {
        log.debug({ err }, 'buscarAgendamentos gcal inacessível — usando só kanban');
      }

      log.debug({ total: agendamentos.length }, 'buscarAgendamentos concluído');
      return JSON.stringify({ agendamentos });
    },
    {
      name: 'Buscar_agendamentos_do_contato',
      description: 'Busca agendamentos existentes para o contato atual (Kanban + Google Calendar). Use antes de criar novos agendamentos para evitar duplicatas.',
      schema: z.object({
        id_profissional: z.string().describe('ID do profissional. Use "thiago-vetrik".'),
      }),
    },
  );
}
