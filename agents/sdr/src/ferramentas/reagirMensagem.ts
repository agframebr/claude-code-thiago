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
      description: `Reage à última mensagem do lead com um emoji (reaction nativa do WhatsApp). Use pra humanizar a conversa.

QUANDO usar:
- Lead se apresentou / disse o nome → ❤️
- Lead confirmou horário ou decisão → ✅
- Lead mandou email/Instagram/site válido → 👍
- Lead compartilhou algo positivo sobre o negócio → 😀 ou 👍

QUANDO NÃO usar:
- Já reagiu nas últimas 2 mensagens (nunca em sequência)
- Mensagem é objeção, dúvida ou hesitação
- Não há contexto positivo claro

Após reagir, CONTINUE com a próxima mensagem em texto — reação não substitui resposta.

NUNCA chame essa ferramenta múltiplas vezes seguidas no mesmo turno.`,
      schema: z.object({
        Content: z.string().describe('Emoji único. Permitidos: 😀 ❤️ 👍 👀 ✅'),
      }),
    },
  );
}
