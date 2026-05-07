import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { enviarMensagem } from '../lib/chatwoot.ts';
import { createChildLogger } from '../lib/logger.ts';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.reagirMensagem' });

export function criarReagirMensagem(ctx: Pick<ContextoAgente, 'idConta' | 'idConversa' | 'idMensagem'>) {
  return tool(
    async ({ Content }) => {
      log.debug({ emoji: Content }, 'reagirMensagem chamado');
      await enviarMensagem(ctx.idConta, ctx.idConversa, {
        content: Content,
        replyToMessageId: ctx.idMensagem,
        isReaction: true,
      });
      return JSON.stringify({ resultado: 'REAÇÃO ENVIADA' });
    },
    {
      name: 'Reagir_mensagem',
      description: `Envia uma mensagem de reação como resposta a uma mensagem do usuário. Reação é sempre um emoji.

Ignore a saída dessa ferramenta, ela é a mensagem enviada para o contato.

**NUNCA UTILIZE ESSA FERRAMENTA MÚLTIPLAS VEZES SEGUIDAS**`,
      schema: z.object({
        Content: z.string().describe('Emoji de reação. Permitidos: 😀 ❤️ 👍 👀 ✅'),
      }),
    },
  );
}
