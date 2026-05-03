/**
 * Nó "resetar_conversa" — apaga histórico, status, atributos, etiquetas e fila;
 * envia mensagem "Memória resetada." em reply ao paciente.
 */
import type { EstadoPrincipalType } from '../estado.ts';
import { consultar } from '../../../lib/db.ts';
import {
  enviarMensagem,
  removerEtiquetas,
  removerAtributosContato,
  removerAtributosConversa,
} from '../../../lib/chatwoot.ts';
import { ETIQUETAS } from '../../../dominio/clinica.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'resetar_conversa' });

export async function resetarConversa(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  log.info({ telefone: estado.telefone }, 'resetando conversa');

  await consultar(`DELETE FROM n8n_historico_mensagens WHERE session_id = $1`, [estado.telefone]);
  await consultar(
    `INSERT INTO n8n_status_atendimento (session_id, lock_conversa, updated_at)
     VALUES ($1, false, NOW())
     ON CONFLICT (session_id) DO UPDATE SET lock_conversa=false, updated_at=NOW()`,
    [estado.telefone],
  );
  await consultar(`DELETE FROM n8n_fila_mensagens WHERE telefone = $1`, [estado.telefone]);

  // Chatwoot: limpa etiquetas, atributos e envia confirmação
  try {
    await removerEtiquetas(estado.id_conta, estado.id_conversa, [
      ETIQUETAS.agenteOff,
      ETIQUETAS.testandoAgente,
    ]);
  } catch (err) {
    log.warn({ err }, 'falha ao remover etiquetas');
  }

  const chavesContato = Object.keys(estado.atributos_contato ?? {});
  if (chavesContato.length) {
    try {
      await removerAtributosContato(estado.id_conta, estado.id_contato, chavesContato);
    } catch (err) {
      log.warn({ err }, 'falha ao remover atributos contato');
    }
  }

  const chavesConversa = Object.keys(estado.atributos_conversa ?? {});
  if (chavesConversa.length) {
    try {
      await removerAtributosConversa(estado.id_conta, estado.id_conversa, chavesConversa);
    } catch (err) {
      log.warn({ err }, 'falha ao remover atributos conversa');
    }
  }

  await enviarMensagem(estado.id_conta, estado.id_conversa, {
    content: 'Memória resetada.',
    replyToMessageId: Number(estado.id_mensagem),
  });

  log.info('reset concluído');
  return {};
}

export async function habilitarTeste(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  const { adicionarEtiquetas } = await import('../../../lib/chatwoot.ts');
  await adicionarEtiquetas(estado.id_conta, estado.id_conversa, [ETIQUETAS.testandoAgente]);
  await enviarMensagem(estado.id_conta, estado.id_conversa, {
    content: 'Modo de teste habilitado.',
    replyToMessageId: Number(estado.id_mensagem),
  });
  log.info('modo teste habilitado');
  return {};
}
