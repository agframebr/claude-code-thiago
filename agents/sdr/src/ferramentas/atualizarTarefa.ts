import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { atualizarTarefa } from '../lib/chatwoot.ts';
import { createChildLogger } from '../lib/logger.ts';
import { config } from '../config.ts';
import { ETAPAS_FUNIL } from '../dominio/vetrik.ts';
import type { ContextoAgente } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.atualizarTarefa' });

const STEPS_PADRAO = Object.values(ETAPAS_FUNIL).map((e) => ({ name: e.nome, id: e.id }));

export function criarAtualizarTarefa(ctx: Pick<ContextoAgente, 'idConta' | 'tarefa' | 'funil'>) {
  const idFunil = ctx.funil?.id ?? ctx.tarefa?.board?.id ?? config.KANBAN_BOARD_ID;
  const idTarefa = ctx.tarefa?.id;

  const steps = ctx.tarefa?.board?.steps?.length ? ctx.tarefa.board.steps : STEPS_PADRAO;
  const etapasDesc = steps.map((s) => `${s.name}: ${s.id}`).join('\n');

  return tool(
    async ({ Title, Description, Kanban_Step, End_Date }) => {
      if (!idTarefa) {
        log.warn('atualizarTarefa sem tarefa no contexto');
        return JSON.stringify({ erro: 'Sem tarefa associada à conversa.' });
      }
      log.debug({ idTarefa, idFunil, Kanban_Step }, 'atualizarTarefa chamado');
      const tarefa = await atualizarTarefa(ctx.idConta, Number(idFunil), idTarefa, {
        title: Title,
        description: Description,
        board_step_id: Kanban_Step,
        due_date: End_Date,
      });
      log.debug({ id: tarefa.id }, 'atualizarTarefa ok');
      return JSON.stringify({ resultado: 'TAREFA ATUALIZADA', tarefa });
    },
    {
      name: 'Atualizar_tarefa',
      description: `Use essa ferramenta para atualizar a tarefa no Kanban.

### IDs das etapas
${etapasDesc}

**USAR ID DA ETAPA ATUAL CASO NÃO HAJA ATUALIZAÇÃO NA ETAPA**

### Descrição
Ao adicionar informações na descrição, sempre inclua a descrição original. NUNCA omita a descrição original, a não ser que o objetivo seja remover a informação.`,
      schema: z.object({
        Title: z.string(),
        Description: z.string(),
        Kanban_Step: z.string(),
        End_Date: z.string().describe('Data limite da tarefa no formato ISO 8601 com fuso horário (ex: 2026-02-10T18:00:00-03:00). Para agendamentos, use a véspera da consulta (data do agendamento − 1 dia). Nos demais casos, use a data atual + 1 dia para indicar quando deverá ser feito o follow-up caso o lead pare de responder.'),
      }),
    },
  );
}
