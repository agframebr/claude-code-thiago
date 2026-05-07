import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { buscarFunilKanban, listarTarefasKanban } from '../lib/chatwoot.ts';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';

const log = createChildLogger({ modulo: 'tool.gerarRelatorio' });

export function criarGerarRelatorio() {
  return tool(
    async () => {
      const [funil, tarefas] = await Promise.all([
        buscarFunilKanban(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID),
        listarTarefasKanban(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID),
      ]);
      const steps = funil.steps ?? [];
      const contagem = new Map<number | string, number>();
      for (const t of tarefas) {
        const stepId = t.board_step?.id ?? 'sem_etapa';
        contagem.set(stepId, (contagem.get(stepId) ?? 0) + 1);
      }
      const total = tarefas.length;
      const linhas = steps.map((s) => {
        const n = contagem.get(s.id) ?? 0;
        return `• ${s.name}: ${n} lead${n !== 1 ? 's' : ''}`;
      });
      const relatorio = `📊 *Pipeline Prospecção VETRIK*\n\nTotal: ${total} leads\n\n${linhas.join('\n')}`;
      log.info({ total }, 'relatório gerado');
      return relatorio;
    },
    {
      name: 'Gerar_relatorio',
      description: 'Gera um relatório do pipeline de prospecção com contagem de leads por etapa do Kanban.',
      schema: z.object({}),
    },
  );
}
