import type { EstadoFollowUpType } from '../estado.ts';
import { moverTarefa } from '../../../lib/chatwoot.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'mover_para_pos_venda' });

export async function moverParaPosVenda(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  const etapaPosVenda = estado.etapas_funil.find(
    (e) => e.name === 'Pós-venda',
  );
  if (!etapaPosVenda) {
    log.warn({ etapas: estado.etapas_funil.map((e) => e.name) }, 'etapa Pós-venda não encontrada');
    return {};
  }
  await moverTarefa(estado.id_conta, estado.id_funil, estado.id_tarefa, etapaPosVenda.id);
  log.debug({ idTarefa: estado.id_tarefa, idEtapa: etapaPosVenda.id }, 'tarefa movida para Pós-venda');
  return {};
}
