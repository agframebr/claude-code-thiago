import type { EstadoFollowUpType } from '../estado.ts';
import {
  buscarConversasDaTarefa,
  resolverContatoEConversa,
  vincularConversaATarefa,
} from '../../../lib/chatwoot.ts';
import { config } from '../../../config.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'resolver_conversa' });

/**
 * Extrai um número de telefone brasileiro da descrição do card.
 * Normaliza para o formato E.164 (+55XXXXXXXXXXX).
 */
function extrairTelefone(texto: string): string | null {
  // Remove formatação comum: espaços, parênteses, hífens, pontos
  const candidatos = texto.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?[\d][\d\s\-\.]{7,12}[\d]/g);
  if (!candidatos) return null;

  for (const c of candidatos) {
    const digits = c.replace(/\D/g, '');
    // +55 + DDD(2) + número(8 ou 9) = 13 ou 12 dígitos com 55 no início
    if (digits.length === 13 && digits.startsWith('55')) return `+${digits}`;
    if (digits.length === 12 && digits.startsWith('55')) return `+${digits}`;
    // DDD(2) + número(8 ou 9) = 10 ou 11 dígitos sem código do país
    if (digits.length === 11) return `+55${digits}`;
    if (digits.length === 10) return `+55${digits}`;
  }
  return null;
}

/**
 * Extrai nome do contato da descrição, se disponível.
 * Procura padrões como "Nome: João Silva" ou "Lead: João".
 */
function extrairNome(texto: string): string | undefined {
  const m = texto.match(/(?:nome|lead|contato|cliente|empresa)\s*[:\-]\s*([^\n\r,]+)/i);
  return m?.[1]?.trim() || undefined;
}

export async function resolverConversa(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  // Já tem conversa — nada a fazer
  if (estado.id_conversa > 0) {
    return { mover_apos_envio: String(config.KANBAN_STEP_CONTATO_FEITO) };
  }

  // Tenta buscar conversa linkada à tarefa via API
  if (estado.id_tarefa) {
    log.debug({ idTarefa: estado.id_tarefa }, 'buscando conversa via API da tarefa');
    const resultado = await buscarConversasDaTarefa(estado.id_conta, estado.id_tarefa);
    if (resultado) {
      log.info({ idTarefa: estado.id_tarefa, idConversa: resultado.idConversa }, 'conversa encontrada via API');
      return {
        id_conversa: resultado.idConversa,
        id_inbox: resultado.idInbox || config.CHATWOOT_INBOX_ID,
        mover_apos_envio: String(config.KANBAN_STEP_CONTATO_FEITO),
      };
    }
  }

  // Sem conversa linkada — tenta extrair telefone da descrição e criar conversa
  const descricao = estado.descricao_tarefa || '';
  const telefone = extrairTelefone(descricao) || extrairTelefone(estado.titulo_tarefa || '');

  if (!telefone) {
    log.warn({ idTarefa: estado.id_tarefa }, 'nenhum telefone encontrado na descrição do card — abortando');
    return {};
  }

  log.info({ telefone, idTarefa: estado.id_tarefa }, 'telefone extraído — resolvendo contato e conversa');

  const nomeContato = extrairNome(descricao) || estado.nome_contato || estado.titulo_tarefa;
  const idInbox = estado.id_inbox > 0 ? estado.id_inbox : config.CHATWOOT_INBOX_ID;

  try {
    const { idContato, idConversa } = await resolverContatoEConversa(
      estado.id_conta,
      telefone,
      idInbox,
      nomeContato,
    );

    // Linka a conversa ao card do Kanban para histórico
    if (estado.id_tarefa) {
      await vincularConversaATarefa(estado.id_conta, estado.id_tarefa, idConversa).catch((err) =>
        log.warn({ err }, 'falha ao vincular conversa à tarefa — continuando'),
      );
    }

    log.info({ telefone, idContato, idConversa }, 'conversa criada/resolvida com sucesso');
    return {
      id_conversa: idConversa,
      id_inbox: idInbox,
      telefone,
      nome_contato: nomeContato || telefone,
      mover_apos_envio: String(config.KANBAN_STEP_CONTATO_FEITO),
    };
  } catch (err) {
    log.error({ err, telefone }, 'falha ao criar conversa para o lead');
    return {};
  }
}
