import type { EstadoFollowUpType } from '../estado.ts';
import { atualizarTarefa } from '../../../lib/chatwoot.ts';
import { agora } from '../../../lib/datas.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'atualizar_data_tarefa' });

export async function atualizarDataTarefa(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  const novaData = agora().plus({ days: 1 }).toISO()!;
  await atualizarTarefa(estado.id_conta, estado.id_funil, estado.id_tarefa, {
    due_date: novaData,
  });
  log.debug({ idTarefa: estado.id_tarefa, novaData }, 'data tarefa atualizada');
  return {};
}
