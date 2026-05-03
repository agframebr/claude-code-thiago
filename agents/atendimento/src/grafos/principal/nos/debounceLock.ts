/**
 * Nós críticos de concorrência:
 * - enfileirar_mensagem: insere em n8n_fila_mensagens
 * - esperar_debounce: setTimeout 16s (toda invocação espera; só a "última" prossegue)
 * - verificar_mensagem_encavalada: dedup + verifica se ainda é a última na fila
 * - verificar_lock / bloquear_lock / liberar_lock: lock por telefone via n8n_status_atendimento
 * - limpar_fila: zera a fila após o lock pegar
 * - marcar_como_lida: Chatwoot updateLastSeen
 */
import type { EstadoPrincipalType } from '../estado.ts';
import { consultar } from '../../../lib/db.ts';
import { marcarComoLida } from '../../../lib/chatwoot.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'debounce_lock' });

const DEBOUNCE_MS = 16_000;

export async function enfileirarMensagem(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  await consultar(
    `INSERT INTO n8n_fila_mensagens (id_mensagem, telefone, mensagem, "timestamp")
     VALUES ($1, $2, $3, NOW())`,
    [estado.id_mensagem, estado.telefone, estado.mensagem_processada ?? ''],
  );
  log.debug({ idMsg: estado.id_mensagem, telefone: estado.telefone }, 'mensagem enfileirada');
  return {};
}

export async function esperarDebounce(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  log.debug({ idMsg: estado.id_mensagem, ms: DEBOUNCE_MS }, 'esperando debounce');
  await new Promise<void>((resolve) => setTimeout(resolve, DEBOUNCE_MS));
  return {};
}

export async function verificarMensagemEncavalada(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  const r = await consultar<{ id_mensagem: string; mensagem: string }>(
    `SELECT id_mensagem, mensagem FROM n8n_fila_mensagens WHERE telefone = $1 ORDER BY "timestamp"`,
    [estado.telefone],
  );
  const fila = r.rows;
  if (!fila.length) {
    log.warn('fila vazia inesperadamente — encavalada=true');
    return { encavalada: true };
  }

  const ultima = fila[fila.length - 1]!;
  if (String(ultima.id_mensagem) !== String(estado.id_mensagem)) {
    log.debug({ esperado: estado.id_mensagem, atual: ultima.id_mensagem }, 'encavalada — outra invocação processará');
    return { encavalada: true };
  }

  // dedup mantendo ordem
  const vistas = new Set<string>();
  const filaUnica = fila.filter((m) => {
    if (vistas.has(m.mensagem)) return false;
    vistas.add(m.mensagem);
    return true;
  });

  log.debug({ totalFila: fila.length, depois: filaUnica.length }, 'fila deduplicada');
  return {
    encavalada: false,
    mensagens_coletadas: filaUnica.map((m) => m.mensagem).join('\n'),
  };
}

export async function verificarLock(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  const r = await consultar<{ lock_conversa: boolean }>(
    `SELECT lock_conversa FROM n8n_status_atendimento WHERE session_id = $1`,
    [estado.telefone],
  );
  if (r.rows.length && r.rows[0]!.lock_conversa === true) {
    log.debug('lock ativo — outra invocação está respondendo');
    return { acao: 'ignorar' };
  }
  return { acao: 'processar' };
}

export async function bloquearLock(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  await consultar(
    `INSERT INTO n8n_status_atendimento (session_id, lock_conversa, updated_at)
     VALUES ($1, true, NOW())
     ON CONFLICT (session_id) DO UPDATE SET lock_conversa=true, updated_at=NOW()`,
    [estado.telefone],
  );
  log.debug('lock bloqueado');
  return {};
}

export async function liberarLock(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  await consultar(
    `INSERT INTO n8n_status_atendimento (session_id, lock_conversa, updated_at)
     VALUES ($1, false, NOW())
     ON CONFLICT (session_id) DO UPDATE SET lock_conversa=false, updated_at=NOW()`,
    [estado.telefone],
  );
  log.debug('lock liberado');
  return {};
}

export async function limparFila(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  await consultar(`DELETE FROM n8n_fila_mensagens WHERE telefone = $1`, [estado.telefone]);
  return {};
}

export async function marcarComoLidaNo(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  try {
    await marcarComoLida(estado.id_conta, estado.id_conversa);
  } catch (err) {
    log.warn({ err }, 'falha ao marcar como lida — ignorando');
  }
  return {};
}

export async function coletarMensagens(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  // mensagens_coletadas já foi setado em verificarMensagemEncavalada
  // este nó só prepende a mensagem referenciada (se houver)
  let mensagens = estado.mensagens_coletadas ?? '';
  if (estado.mensagem_referenciada) {
    mensagens = `<mensagem-referenciada>${estado.mensagem_referenciada}</mensagem-referenciada>\n\n${mensagens}`;
  }
  return { mensagens_coletadas: mensagens };
}

export async function verificarMsgDuranteResposta(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  const r = await consultar<{ id: number }>(
    `SELECT id FROM n8n_fila_mensagens WHERE telefone = $1 ORDER BY id DESC LIMIT 1`,
    [estado.telefone],
  );
  const recebeu = r.rows.length > 0;
  if (recebeu) log.debug('recebeu nova msg durante resposta — outra invocação tratará');
  return { recebeu_msg_durante_resposta: recebeu };
}
