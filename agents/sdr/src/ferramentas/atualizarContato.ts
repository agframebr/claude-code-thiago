import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { atualizarContato as atualizarContatoChatwoot } from '../lib/chatwoot.ts';
import { createChildLogger } from '../lib/logger.ts';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.atualizarContato' });

export function criarAtualizarContato(ctx: Pick<ContextoAgente, 'idConta' | 'idContato'>) {
  return tool(
    async ({ nome, email, instagram, site }) => {
      const atributosCustom: Record<string, unknown> = {};
      if (instagram) atributosCustom.instagram = instagram;
      if (site) atributosCustom.site = site;

      await atualizarContatoChatwoot(ctx.idConta, ctx.idContato, {
        nome,
        email,
        atributosCustom: Object.keys(atributosCustom).length > 0 ? atributosCustom : undefined,
      });

      log.info({ nome, email, instagram, site }, 'contato atualizado');
      return JSON.stringify({ resultado: 'CONTATO ATUALIZADO' });
    },
    {
      name: 'Atualizar_contato',
      description: `Salva informações do lead no perfil de contato do Chatwoot.

Use imediatamente quando o lead informar:
- **Nome**: assim que o lead responder com o nome dele
- **Email**: quando o lead fornecer o email para receber o convite da sessão
- **Instagram / Site**: após a confirmação do agendamento, se o lead informar

Campos são todos opcionais — passe apenas o que o lead informou.`,
      schema: z.object({
        nome: z.string().optional().describe('Nome completo ou apelido do lead'),
        email: z.string().email().optional().describe('Email do lead'),
        instagram: z.string().optional().describe('Arroba do Instagram (ex: @vetrik ou vetrik)'),
        site: z.string().optional().describe('URL do site ou domínio do lead'),
      }),
    },
  );
}
