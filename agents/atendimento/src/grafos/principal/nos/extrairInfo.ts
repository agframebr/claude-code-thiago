/**
 * Nó "extrair_info" — corresponde ao nó "Info" do n8n WF01.
 * Lê payload_webhook e popula todos os campos derivados.
 */
import type { EstadoPrincipalType } from '../estado.ts';
import { createChildLogger } from '../../../lib/logger.ts';

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

  const tarefa = (conversa.kanban_task ?? null) as EstadoPrincipalType['tarefa'];
  const funil = tarefa?.board ?? null;

  const out: Partial<EstadoPrincipalType> = {
    id_mensagem: String(p.id ?? ''),
    id_mensagem_referenciada: contentAttrs.in_reply_to ? String(contentAttrs.in_reply_to) : null,
    id_conta: Number((p.account as Record<string, unknown>)?.id ?? 0),
    id_conversa: Number(conversa.id ?? 0),
    id_contato: Number((conversa.contact_inbox as Record<string, unknown>)?.contact_id ?? 0),
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
