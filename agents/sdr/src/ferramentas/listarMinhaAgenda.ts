import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { listarEventos } from '../lib/google-calendar.ts';
import { calendarIdParaProfissional } from '../dominio/id-agendas.ts';
import { createChildLogger } from '../lib/logger.ts';
import { DateTime } from 'luxon';

const log = createChildLogger({ modulo: 'tool.listarMinhaAgenda' });

export function criarListarMinhaAgenda() {
  return tool(
    async ({ inicio, fim, calendar }) => {
      log.debug({ inicio, fim, calendar }, 'listarMinhaAgenda chamado');

      const dtInicio = inicio
        ? DateTime.fromISO(inicio).setZone('America/Sao_Paulo')
        : DateTime.now().setZone('America/Sao_Paulo').startOf('day');
      const dtFim = fim
        ? DateTime.fromISO(fim).setZone('America/Sao_Paulo')
        : dtInicio.endOf('day');

      // 'primary' usa o calendário primário do usuário OAuth2 (Thiago).
      // 'agenda-vetrik' usa o group calendar configurado no env.
      const calendarId = calendar === 'agenda-vetrik'
        ? calendarIdParaProfissional('thiago-vetrik')
        : 'primary';

      const eventos = await listarEventos({
        calendarId,
        timeMin: dtInicio.toISO()!,
        timeMax: dtFim.toISO()!,
        maxResults: 50,
      });

      const lista = eventos.map((e) => {
        const ini = e.start?.dateTime ?? e.start?.date ?? '';
        const horaFormatada = ini
          ? DateTime.fromISO(ini).setZone('America/Sao_Paulo').toFormat("EEEE, d/MM 'às' HH:mm", { locale: 'pt-BR' })
          : '';
        return {
          titulo: e.summary ?? '(sem título)',
          inicio: ini,
          inicio_formatado: horaFormatada,
          fim: e.end?.dateTime ?? e.end?.date,
          link_meet: e.hangoutLink ?? null,
          local: e.location ?? null,
          descricao: e.description ?? null,
          attendees: e.attendees?.map((a) => a.email).filter(Boolean) ?? [],
        };
      });

      log.info({ qtd: lista.length, calendarId }, 'agenda listada');
      return JSON.stringify({
        periodo: {
          inicio: dtInicio.toISO(),
          fim: dtFim.toISO(),
        },
        total: lista.length,
        eventos: lista,
      });
    },
    {
      name: 'Listar_minha_agenda',
      description: `Lista TODOS os compromissos da agenda do Thiago em um período. Use quando ele perguntar "o que tenho hoje", "minha agenda de amanhã", "o que tenho essa semana", etc.

Diferente de Buscar_agendamentos_do_contato (que filtra por contato específico), essa lista todos os eventos do calendário.

Padrão: se não passar inicio/fim, lista o dia atual completo.
calendar: 'primary' = calendário pessoal do Thiago (recomendado, contém Calendly + manuais). 'agenda-vetrik' = calendário compartilhado de grupo.`,
      schema: z.object({
        inicio: z.string().optional().describe('ISO 8601 de início do período (ex: 2026-05-08T00:00:00-03:00). Se omitido, usa início do dia atual.'),
        fim: z.string().optional().describe('ISO 8601 de fim do período. Se omitido, usa fim do dia atual.'),
        calendar: z.enum(['primary', 'agenda-vetrik']).default('primary').describe('Qual calendário consultar.'),
      }),
    },
  );
}
