import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { adicionarEtiquetas, enviarMensagem } from '../lib/chatwoot.ts';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.escalarHumano' });

export function criarEscalarHumano(ctx: Pick<ContextoAgente, 'nome' | 'telefone' | 'idConta' | 'idConversa' | 'mensagensColetadas'>) {
  return tool(
    async ({ resumo_conversa }) => {
      log.debug({ telefone: ctx.telefone }, 'escalarHumano chamado');

      await adicionarEtiquetas(ctx.idConta, ctx.idConversa, ['agente-off']);

      const alertaContent = `Assistente desabilitado para o usuário ${ctx.nome} (${ctx.telefone}).

*Última mensagem*:

"${ctx.mensagensColetadas}"

*Resumo da conversa*:

"${resumo_conversa}"`;

      await enviarMensagem(
        config.CHATWOOT_ALERT_ACCOUNT_ID,
        config.CHATWOOT_ALERT_CONVERSATION_ID,
        { content: alertaContent },
      );

      log.debug('escalarHumano ok — agente-off aplicado');
      return JSON.stringify({ resultado: 'ESCALADO PARA HUMANO' });
    },
    {
      name: 'Escalar_humano',
      description: 'Utilize essa ferramenta para direcionar o atendimento para o gestor responsável.',
      schema: z.object({
        resumo_conversa: z.string().describe('Um breve resumo com pontos chave da conversa.'),
      }),
    },
  );
}
