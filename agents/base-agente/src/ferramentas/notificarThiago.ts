/**
 * Tool interna — notifica o Thiago no Chatwoot de alerta quando uma sessão é agendada.
 * Usada pela Ísys automaticamente após Criar_agendamento.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { enviarMensagem } from '../lib/chatwoot.ts';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';

const log = createChildLogger({ modulo: 'tool.notificarThiago' });

export function criarNotificarThiago() {
  return tool(
    async ({ nome_lead, empresa, data_hora, contexto }) => {
      const content = `📅 *Nova Sessão Estratégica agendada*

*Lead*: ${nome_lead}${empresa ? ` — ${empresa}` : ''}
*Data/Hora*: ${data_hora}
*Contexto*: ${contexto}`;

      await enviarMensagem(
        config.CHATWOOT_ALERT_ACCOUNT_ID,
        config.CHATWOOT_ALERT_CONVERSATION_ID,
        { content },
      );

      log.info({ nome_lead, data_hora }, 'Thiago notificado sobre nova sessão');
      return JSON.stringify({ resultado: 'THIAGO NOTIFICADO' });
    },
    {
      name: 'Notificar_responsavel',
      description: `Use IMEDIATAMENTE após confirmar um agendamento de Sessão Estratégica. Notifica o responsável da Vetrik sobre o novo agendamento.

Sempre use após "Criar_agendamento" ter sucesso.`,
      schema: z.object({
        nome_lead: z.string().describe('Nome do lead ou contato'),
        empresa: z.string().optional().describe('Nome da empresa (se informado)'),
        data_hora: z.string().describe('Data e horário da sessão no formato legível (ex: quinta-feira, 15/05 às 15:00)'),
        contexto: z.string().describe('Resumo breve do que o lead precisa/busca (2-3 linhas)'),
      }),
    },
  );
}
