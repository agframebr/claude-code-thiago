/**
 * Nós de roteamento puro — verificar_reset, verificar_agente_ativo.
 * Setam `acao` no estado, lógica de roteamento fica nos conditional edges.
 */
import type { EstadoPrincipalType } from '../estado.ts';
import { ETIQUETAS } from '../../../dominio/vetrik.ts';
import { config } from '../../../config.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'roteamento' });

export async function verificarReset(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  const txt = (estado.mensagem_bruta ?? '').trim().toLowerCase();
  const etiquetas = estado.etiquetas ?? [];

  if (txt === '/reset' && etiquetas.includes(ETIQUETAS.testandoAgente)) {
    log.debug('reset detectado');
    return { acao: 'reset' };
  }
  if (txt === '/testar-agente') {
    log.debug('habilitar teste detectado');
    return { acao: 'habilitar_teste' };
  }
  return { acao: 'processar' };
}

export async function verificarAgenteAtivo(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  const etiquetas = estado.etiquetas ?? [];

  if (etiquetas.includes(ETIQUETAS.agenteOff)) {
    log.debug('agente-off — ignorando');
    return { acao: 'ignorar' };
  }
  const isProd = config.NODE_ENV === 'production';
  const isTeste = etiquetas.includes(ETIQUETAS.testandoAgente);

  if (!isProd && !isTeste) {
    log.debug({ env: config.NODE_ENV }, 'dev mode sem etiqueta de teste — ignorando');
    return { acao: 'ignorar' };
  }
  return { acao: 'processar' };
}
