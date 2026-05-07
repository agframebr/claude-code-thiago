import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { criarEvento } from '../lib/google-calendar.ts';
import { parseISO } from '../lib/datas.ts';
import { calendarIdParaProfissional } from '../dominio/id-agendas.ts';
import { definirAtributosContato, atualizarTarefa } from '../lib/chatwoot.ts';
import { createChildLogger } from '../lib/logger.ts';
import { criarBuscarJanelasDisponiveis } from './buscarJanelasDisponiveis.ts';
import { config } from '../config.ts';
import { ETAPAS_FUNIL } from '../dominio/vetrik.ts';
import { DateTime } from 'luxon';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.criarAgendamento' });

export function criarCriarAgendamento(ctx: Pick<ContextoAgente, 'telefone' | 'idConta' | 'idContato' | 'tarefa'>) {
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

      // Move card do Kanban para "Reunião Agendada" automaticamente
      const idTarefa = ctx.tarefa?.id;
      if (idTarefa) {
        try {
          const horarioFormatado = DateTime.fromISO(evento_inicio).setZone('America/Sao_Paulo').toFormat("EEEE, d 'de' LLLL 'às' HH:mm", { locale: 'pt-BR' });
          const linhasDescricao = [
            `📅 Sessão Estratégica agendada`,
            `Data: ${horarioFormatado}`,
            `Quando: ${evento_inicio}`,
            `Telefone: ${ctx.telefone}`,
          ];
          if (email_lead) linhasDescricao.push(`Email: ${email_lead}`);
          if (linkMeet) linhasDescricao.push(`Meet: ${linkMeet}`);
          if (descricao) linhasDescricao.push('', descricao);

          await atualizarTarefa(ctx.idConta, config.KANBAN_BOARD_ID, idTarefa, {
            board_step_id: ETAPAS_FUNIL.reuniaoAgendada.id,
            description: linhasDescricao.join('\n'),
            due_date: dtInicio.minus({ days: 1 }).toISO() ?? undefined,
          });
          log.info({ idTarefa }, 'card movido para Reunião Agendada automaticamente');
        } catch (err) {
          log.warn({ err, idTarefa }, 'falha ao mover card no Kanban — agente pode tentar manualmente');
        }
      }

      log.debug({ id: evento.id, linkMeet }, 'criarAgendamento ok');
      return JSON.stringify({ resultado: 'AGENDAMENTO CRIADO', id_evento: evento.id, link_meet: linkMeet, kanban_movido: !!idTarefa });
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
