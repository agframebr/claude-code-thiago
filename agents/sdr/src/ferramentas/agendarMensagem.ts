import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { agendarMensagem as agendarMensagemChatwoot } from '../lib/chatwoot.ts';
import { createChildLogger } from '../lib/logger.ts';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.agendarMensagem' });

export function criarAgendarMensagem(ctx: Pick<ContextoAgente, 'idConta' | 'idConversa'>) {
  return tool(
    async ({ conteudo, scheduled_at }) => {
      log.debug({ idConversa: ctx.idConversa, scheduled_at }, 'agendarMensagem chamado');

      await agendarMensagemChatwoot(ctx.idConta, ctx.idConversa, conteudo, scheduled_at);

      log.info({ scheduled_at }, 'mensagem agendada');
      return JSON.stringify({ resultado: 'MENSAGEM AGENDADA', scheduled_at });
    },
    {
      name: 'Agendar_mensagem',
      description: `Agenda uma mensagem para ser enviada automaticamente no futuro.

Use para agendar o lembrete 1h antes da Sessão Estratégica:
- scheduled_at deve ser o horário da sessão menos 60 minutos
- Formato ISO 8601 com timezone (ex: "2026-05-10T13:00:00-03:00")

Só use após confirmar o agendamento com o lead.`,
      schema: z.object({
        conteudo: z.string().describe('Texto da mensagem a ser enviada'),
        scheduled_at: z.string().describe('Data/hora de envio em ISO 8601 com timezone'),
      }),
    },
  );
}
