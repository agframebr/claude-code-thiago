/**
 * Nó "extrair_info" — corresponde ao nó "Info" do n8n WF01.
 * Lê payload_webhook e popula todos os campos derivados.
 */
import type { EstadoPrincipalType } from '../estado.ts';
import { createChildLogger } from '../../../lib/logger.ts';
import { config } from '../../../config.ts';
import { buscarTarefaDaConversa, criarTarefaKanban, buscarTarefa } from '../../../lib/chatwoot.ts';
import { ETAPAS_FUNIL, TELEFONE_THIAGO, TELEFONE_LETICIA } from '../../../dominio/vetrik.ts';

const log = createChildLogger({ no: 'extrair_info' });

export async function extrairInfo(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  const p = estado.payload_webhook as Record<string, unknown>;
  const conversa = (p.conversation as Record<string, unknown>) ?? {};
  const sender = (p.sender as Record<string, unknown>) ??
    ((conversa.meta as Record<string, unknown>)?.sender as Record<string, unknown>) ?? {};
  const additional = (sender.additional_attributes as Record<string, unknown>) ?? {};
  const social = (additional.social_profiles as Record<string, string>) ?? {};
  const attachments = (p.attachments as Array<Record<string, unknown>>) ?? [];
  const a0 = attachments[0] ?? {};
  const labels = (conversa.labels as string[]) ?? [];
  const contentAttrs = (p.content_attributes as Record<string, unknown>) ?? {};
  const inboxRaw = (p.inbox as Record<string, unknown>) ?? {};

  let tarefa = (conversa.kanban_task ?? null) as EstadoPrincipalType['tarefa'];
  const idConversaNum = Number(conversa.id ?? 0);

  // Fallback: webhook nem sempre inclui kanban_task — busca via API
  if (!tarefa && idConversaNum) {
    tarefa = await buscarTarefaDaConversa(config.CHATWOOT_ACCOUNT_ID, idConversaNum).catch(() => null) as EstadoPrincipalType['tarefa'];
    if (tarefa) log.debug({ idConversa: idConversaNum, idTarefa: tarefa.id }, 'tarefa buscada via API');
  }

  // Auto-cria card Kanban para lead sem tarefa (não gestores)
  const nomeContato = String((sender as Record<string, unknown>).name ?? '');
  const telefoneContato = String((sender as Record<string, unknown>).phone_number ?? (social as Record<string, string>).instagram ?? (sender as Record<string, unknown>).identifier ?? '');
  const ehGestor = telefoneContato === TELEFONE_THIAGO || telefoneContato === TELEFONE_LETICIA;
  if (!tarefa && idConversaNum && !ehGestor) {
    try {
      const titulo = nomeContato || telefoneContato || `Lead #${idConversaNum}`;
      // Novo lead que entrou em contato → começa em "Contato Feito"
      const taskCriada = await criarTarefaKanban(
        config.CHATWOOT_ACCOUNT_ID,
        config.KANBAN_BOARD_ID,
        ETAPAS_FUNIL.contatoFeito.id,
        titulo,
        idConversaNum,
      );
      // Busca diretamente pelo ID da task (retorna board + steps completos)
      tarefa = await buscarTarefa(config.CHATWOOT_ACCOUNT_ID, taskCriada.id).catch(() => taskCriada) as EstadoPrincipalType['tarefa'];
      log.info({ idConversa: idConversaNum, idTarefa: tarefa?.id, titulo }, 'tarefa criada automaticamente no Kanban (Contato Feito)');
    } catch (err) {
      log.warn({ err, idConversa: idConversaNum }, 'falha ao criar tarefa no Kanban — continua sem tarefa');
    }
  }

  const funil = tarefa?.board ?? null;

  const out: Partial<EstadoPrincipalType> = {
    id_mensagem: String(p.id ?? ''),
    id_mensagem_referenciada: contentAttrs.in_reply_to ? String(contentAttrs.in_reply_to) : null,
    id_conta: Number((p.account as Record<string, unknown>)?.id ?? conversa.account_id ?? 0) || config.CHATWOOT_ACCOUNT_ID,
    id_conversa: Number(conversa.id ?? 0),
    id_contato: Number((conversa.contact_inbox as Record<string, unknown>)?.contact_id ?? sender.id ?? 0),
    id_inbox: Number(inboxRaw.id ?? conversa.inbox_id ?? 0),
    telefone: String(sender.phone_number ?? social.instagram ?? sender.identifier ?? ''),
    nome: String(sender.name ?? ''),
    mensagem_bruta: String(p.content ?? ''),
    mensagem_de_audio: a0.file_type === 'audio',
    tipo_arquivo: String(a0.file_type ?? ''),
    id_anexo: a0.id ? String(a0.id) : null,
    url_arquivo: a0.data_url ? String(a0.data_url) : null,
    timestamp_msg: String(p.created_at ?? ''),
    etiquetas: labels,
    atributos_contato: (sender.custom_attributes as Record<string, unknown>) ?? {},
    atributos_conversa: (conversa.custom_attributes as Record<string, unknown>) ?? {},
    tarefa,
    funil,
  };

  log.debug({ idConversa: out.id_conversa, telefone: out.telefone, tipo: out.tipo_arquivo }, 'info extraída');
  return out;
}
