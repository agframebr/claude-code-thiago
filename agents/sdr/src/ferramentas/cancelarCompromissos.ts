import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { listarEventos, deletarEvento } from '../lib/google-calendar.ts';
import { buscarConversaPorTelefone, enviarMensagem } from '../lib/chatwoot.ts';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';
import { DateTime } from 'luxon';

const log = createChildLogger({ modulo: 'tool.cancelarCompromissos' });

export function criarCancelarCompromissos() {
  return tool(
    async ({ motivo }) => {
      const agora = DateTime.now().toISO()!;
      const fim = DateTime.now().plus({ months: 3 }).toISO()!;

      const eventos = await listarEventos({
        calendarId: config.CALENDAR_ID_THIAGO_FIGUEREDO,
        timeMin: agora,
        timeMax: fim,
      });

      if (!eventos.length) {
        return 'Nenhum compromisso futuro encontrado para cancelar.';
      }

      let cancelados = 0;
      let notificados = 0;
      const erros: string[] = [];

      for (const evento of eventos) {
        const descricao = evento.description ?? '';
        const matchTelefone = descricao.match(/Telefone:\s*(\+[\d\s()-]+)/);
        const telefone = matchTelefone?.[1]?.replace(/\s/g, '');
        const titulo = evento.summary ?? 'Compromisso';
        const inicioISO = evento.start?.dateTime ?? evento.start?.date ?? '';
        const horario = inicioISO
          ? DateTime.fromISO(inicioISO).setZone('America/Sao_Paulo').toFormat("d/MM 'às' HH:mm")
          : '';

        try {
          if (evento.id) {
            await deletarEvento(config.CALENDAR_ID_THIAGO_FIGUEREDO, evento.id);
            cancelados++;
          }
        } catch (err) {
          log.warn({ err, eventId: evento.id, titulo }, 'falha ao deletar evento');
          erros.push(titulo);
        }

        if (telefone) {
          try {
            const conversa = await buscarConversaPorTelefone(config.CHATWOOT_ACCOUNT_ID, telefone);
            if (conversa) {
              const msg = `Olá! Preciso te informar que a nossa Sessão Estratégica${horario ? ` do dia ${horario}` : ''} precisou ser cancelada.

😔 *Motivo*: ${motivo}

Quero muito que a gente consiga conversar! Por isso, quando você puder, escolha um novo horário pelo link abaixo — prometo estar presente:

${config.CALENDLY_LINK}

Qualquer dúvida, pode falar comigo aqui. Até logo!`;
              await enviarMensagem(config.CHATWOOT_ACCOUNT_ID, conversa.id, { content: msg });
              notificados++;
            }
          } catch (err) {
            log.warn({ err, telefone }, 'falha ao notificar lead');
          }
        }
      }

      const resultado = [
        `✅ Compromissos cancelados: ${cancelados}/${eventos.length}`,
        `📱 Leads notificados: ${notificados}`,
        erros.length ? `⚠️ Erros ao cancelar: ${erros.join(', ')}` : '',
      ].filter(Boolean).join('\n');

      log.info({ cancelados, notificados, total: eventos.length }, 'cancelarCompromissos concluído');
      return resultado;
    },
    {
      name: 'Cancelar_compromissos',
      description: `Cancela TODOS os compromissos futuros da agenda do Thiago e envia mensagem WhatsApp para cada lead informando o cancelamento e oferecendo o link do Calendly para reagendamento.

Use APENAS quando o Thiago pedir explicitamente para cancelar todos os compromissos. Sempre peça o motivo antes de executar caso não tenha sido informado.`,
      schema: z.object({
        motivo: z.string().describe('Motivo do cancelamento (ex: "imprevisto pessoal", "viagem urgente")'),
      }),
    },
  );
}
