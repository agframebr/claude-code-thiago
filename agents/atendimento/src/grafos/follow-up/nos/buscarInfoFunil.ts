import type { EstadoFollowUpType } from '../estado.ts';
import { buscarFunilKanban } from '../../../lib/chatwoot.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'buscar_info_funil' });

export async function buscarInfoFunil(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  const funil = await buscarFunilKanban(estado.id_conta, estado.id_funil);
  log.debug({ idFunil: estado.id_funil, qtdEtapas: funil.steps?.length }, 'funil carregado');
  return { etapas_funil: funil.steps ?? [] };
}
