import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { criarEvento } from '../lib/google-calendar.ts';
import { parseISO } from '../lib/datas.ts';
import { calendarIdParaProfissional } from '../dominio/id-agendas.ts';
import { definirAtributosContato } from '../lib/chatwoot.ts';
import { createChildLogger } from '../lib/logger.ts';
import { criarBuscarJanelasDisponiveis } from './buscarJanelasDisponiveis.ts';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.criarAgendamento' });

export function criarCriarAgendamento(ctx: Pick<ContextoAgente, 'telefone' | 'idConta' | 'idContato'>) {
  const buscarJanelas = criarBuscarJanelasDisponiveis();

  return tool(
    async ({ evento_inicio, duracao_minutos, titulo, descricao, id_profissional, email_lead }) => {
      log.debug({ evento_inicio, duracao_minutos, id_profissional }, 'criarAgendamento chamado');

      const dtInicio = parseISO(evento_inicio);
      if (!dtInicio.isValid) {
        return JSON.stringify({ erro: 'evento_inicio inválido.' });
      }

      const dtFim = dtInicio.plus({ minutes: duracao_minutos });

      // Verifica disponibilidade antes de criar
      const resultadoJanelas = await buscarJanelas.invoke({
        id_profissional,
        tamanho_janela_minutos: duracao_minutos,
        periodo_inicio: evento_inicio,
        periodo_fim: dtFim.toISO()!,
      });
      const { janelas } = JSON.parse(resultadoJanelas) as { janelas?: unknown[] };
      if (!janelas || janelas.length === 0) {
        return JSON.stringify({ resultado: 'HORÁRIO INDISPONÍVEL' });
      }

      const calendarId = calendarIdParaProfissional(id_profissional);
      const emails = email_lead ? [email_lead] : [];
      const evento = await criarEvento({
        calendarId,
        inicio: evento_inicio,
        fim: dtFim.toISO()!,
        titulo,
        descricao: `${descricao}\nTelefone: ${ctx.telefone}${email_lead ? `\nEmail: ${email_lead}` : ''}`,
        emailsParticipantes: emails,
        criarLinkMeet: true,
      });

      const linkMeet = evento.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ?? null;

      // Atualiza atributo do contato com data da última consulta
      try {
        await definirAtributosContato(ctx.idConta, ctx.idContato, {
          data_ultima_consulta: dtInicio.toFormat('yyyy-MM-dd'),
        });
      } catch (err) {
        log.warn({ err }, 'falha ao atualizar data_ultima_consulta — ignorando');
      }

      log.debug({ id: evento.id, linkMeet }, 'criarAgendamento ok');
      return JSON.stringify({ resultado: 'AGENDAMENTO CRIADO', id_evento: evento.id, link_meet: linkMeet, evento });
    },
    {
      name: 'Criar_agendamento',
      description: `Utilize essa ferramenta para criar um agendamento no horário especificado, com duração do evento conforme já especificado nas instruções gerais.

Sempre verifique se já não chamou essa ferramenta antes de chamá-la.

**NUNCA CHAME ESSA FERRAMENTA MAIS DE UMA VEZ PARA O MESMO AGENDAMENTO.**`,
      schema: z.object({
        evento_inicio: z.string().describe('Deve ser uma data e horário no futuro. Datas passadas são inválidas. A data deve ser no formato: `YYYY-MM-DDThh:mm:ssTZD`. Utilize o fuso horário conforme a data atual.'),
        duracao_minutos: z.number(),
        titulo: z.string(),
        descricao: z.string(),
        id_profissional: z.string(),
        email_lead: z.string().email().optional().describe('Email do lead (se informado). O lead receberá o convite do Google Calendar e o link do Google Meet automaticamente.'),
      }),
    },
  );
}
