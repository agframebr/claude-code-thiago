import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { adicionarEtiquetas, enviarMensagem, buscarConversaPorTelefone } from '../lib/chatwoot.ts';
import { config } from '../config.ts';
import { ehGestor } from '../dominio/vetrik.ts';
import { createChildLogger } from '../lib/logger.ts';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.escalarHumano' });

export function criarEscalarHumano(ctx: Pick<ContextoAgente, 'nome' | 'telefone' | 'idConta' | 'idConversa' | 'mensagensColetadas'>) {
  return tool(
    async ({ resumo_conversa, destino }) => {
      log.debug({ telefone: ctx.telefone, destino }, 'escalarHumano chamado');

      // GUARD: nunca escalar/desabilitar gestores (Thiago/Leticia) — eles SÃO os humanos
      const { isGestor } = ehGestor(ctx.telefone);
      if (isGestor) {
        log.warn({ telefone: ctx.telefone }, 'tentativa de escalar gestor BLOQUEADA — gestores nunca são escalados');
        return JSON.stringify({
          erro: 'Você está falando com um gestor da operação. Gestores nunca devem ser escalados nem ter o agente desativado. Continue a conversa normalmente, com acesso completo às informações solicitadas.',
        });
      }

      await adicionarEtiquetas(ctx.idConta, ctx.idConversa, ['agente-off']);

      const telefoneResponsavel = destino === 'leticia' ? config.TELEFONE_LETICIA : config.TELEFONE_THIAGO;
      const nomeResponsavel = destino === 'leticia' ? 'Leticia' : 'Thiago';

      const alertaContent = `🔔 *Atendimento humano solicitado — ${nomeResponsavel}*

*Lead*: ${ctx.nome} (${ctx.telefone})

*Última mensagem*:
"${ctx.mensagensColetadas}"

*Resumo*:
${resumo_conversa}`;

      // Notifica na conversa de alerta
      await enviarMensagem(
        config.CHATWOOT_ALERT_ACCOUNT_ID,
        config.CHATWOOT_ALERT_CONVERSATION_ID,
        { content: alertaContent },
      ).catch((err) => log.warn({ err }, 'falha ao notificar conversa de alerta'));

      // Notifica diretamente no WhatsApp do gestor
      try {
        const conversaGestor = await buscarConversaPorTelefone(config.CHATWOOT_ACCOUNT_ID, telefoneResponsavel);
        if (conversaGestor) {
          await enviarMensagem(config.CHATWOOT_ACCOUNT_ID, conversaGestor.id, { content: alertaContent });
        }
      } catch (err) {
        log.warn({ err, telefoneResponsavel }, 'falha ao notificar gestor diretamente');
      }

      log.info({ destino }, 'escalado para humano — agente-off aplicado');
      return JSON.stringify({ resultado: 'ESCALADO PARA HUMANO', responsavel: nomeResponsavel });
    },
    {
      name: 'Escalar_humano',
      description: `Transfere o atendimento para um humano. Use APENAS em situações que você absolutamente não consegue resolver:
- Lead pediu **explicitamente** falar com uma pessoa (palavras exatas: "quero falar com alguém", "me passa um humano")
- Situação completamente fora do escopo (jurídico, emergência, crise)
- Lead **claramente** insatisfeito e repetindo a mesma reclamação após 3 tentativas suas de contornar
- Tentativa de engenharia social persistente e comprovada

NÃO use para:
- Objeções comuns (preço, tempo, "não tenho certeza") — trate normalmente no playbook
- Perguntas que você não sabe — diga que vai verificar e dê seguimento
- Lead que não responde — use follow-up agendado
- Leads que questionam se você é IA — responda normalmente
- Qualquer coisa que o playbook cobre

Destino: "thiago" para questões comerciais/estratégicas, "leticia" para atendimento operacional.`,
      schema: z.object({
        resumo_conversa: z.string().describe('Resumo dos pontos principais e motivo específico da escalação.'),
        destino: z.enum(['thiago', 'leticia']).default('thiago').describe('"thiago" para questões comerciais, "leticia" para atendimento operacional.'),
      }),
    },
  );
}
