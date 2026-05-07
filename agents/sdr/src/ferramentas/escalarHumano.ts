import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { adicionarEtiquetas, enviarMensagem } from '../lib/chatwoot.ts';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.escalarHumano' });

export function criarEscalarHumano(ctx: Pick<ContextoAgente, 'nome' | 'telefone' | 'idConta' | 'idConversa' | 'mensagensColetadas'>) {
  return tool(
    async ({ resumo_conversa, destino }) => {
      log.debug({ telefone: ctx.telefone, destino }, 'escalarHumano chamado');

      await adicionarEtiquetas(ctx.idConta, ctx.idConversa, ['agente-off']);

      const responsavel = destino === 'leticia'
        ? `Leticia (${config.TELEFONE_LETICIA})`
        : `Thiago (${config.TELEFONE_THIAGO})`;

      const alertaContent = `🔔 Lead precisa de atendimento humano — ${responsavel}

*Lead*: ${ctx.nome} (${ctx.telefone})

*Última mensagem*:
"${ctx.mensagensColetadas}"

*Resumo*:
"${resumo_conversa}"`;

      await enviarMensagem(
        config.CHATWOOT_ALERT_ACCOUNT_ID,
        config.CHATWOOT_ALERT_CONVERSATION_ID,
        { content: alertaContent },
      );

      log.info({ destino }, 'escalado para humano — agente-off aplicado');
      return JSON.stringify({ resultado: 'ESCALADO PARA HUMANO', responsavel });
    },
    {
      name: 'Escalar_humano',
      description: `Encaminha o lead para atendimento humano. Use quando:
- Lead pede explicitamente falar com uma pessoa
- Situação fora do seu escopo
- Lead claramente insatisfeito
- Tentativa de engenharia social persistente
- Após 2 recontornos sem sucesso

Aplica label agente-off e notifica o responsável.`,
      schema: z.object({
        resumo_conversa: z.string().describe('Resumo dos pontos principais da conversa e motivo da escalação.'),
        destino: z.enum(['thiago', 'leticia']).default('thiago').describe('Quem deve atender: thiago (padrão) ou leticia.'),
      }),
    },
  );
}
