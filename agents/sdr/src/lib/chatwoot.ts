/**
 * Cliente HTTP Chatwoot — Client API + métodos Kanban (extensão fazer.ai).
 */
import { config } from '../config.ts';
import { createChildLogger } from './logger.ts';
import type {
  EtapaKanban,
  FunilKanban,
  MensagemChatwoot,
  MetadadosAnexo,
  OpcoesEnvioMensagem,
  TarefaKanban,
} from '../tipos.ts';

const log = createChildLogger({ modulo: 'chatwoot' });

const BASE = config.CHATWOOT_BASE_URL.replace(/\/$/, '');
const TOKEN = config.CHATWOOT_API_TOKEN;

interface OpcoesFetch {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  corpo?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  bruto?: boolean;
}

async function chamar<T = unknown>(caminho: string, opts: OpcoesFetch = {}): Promise<T> {
  const url = new URL(`${BASE}${caminho}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const inicio = Date.now();
  const metodo = opts.metodo ?? 'GET';

  const headers: Record<string, string> = {
    api_access_token: TOKEN,
    Accept: 'application/json',
  };
  let body: FormData | string | undefined;
  if (opts.corpo !== undefined) {
    if (opts.corpo instanceof FormData) {
      body = opts.corpo;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.corpo);
    }
  }

  try {
    const resp = await fetch(url.toString(), { method: metodo, headers, body });
    const duracaoMs = Date.now() - inicio;

    if (!resp.ok) {
      const texto = await resp.text().catch(() => '');
      log.error({ caminho, metodo, status: resp.status, duracaoMs, corpoErro: texto.slice(0, 500) }, 'chatwoot HTTP erro');
      throw new Error(`Chatwoot ${metodo} ${caminho} → ${resp.status}: ${texto.slice(0, 200)}`);
    }
    log.debug({ caminho, metodo, status: resp.status, duracaoMs }, 'chatwoot ok');

    if (opts.bruto) return resp as unknown as T;
    if (resp.status === 204) return undefined as T;
    const ct = resp.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) return (await resp.json()) as T;
    return (await resp.text()) as unknown as T;
  } catch (err) {
    log.error({ caminho, metodo, err }, 'chatwoot fetch falhou');
    throw err;
  }
}

// ----- Mensagens -----

export interface RespostaMensagem {
  id: number;
  content?: string;
  conversation_id?: number;
}

export async function enviarMensagem(
  idConta: number,
  idConversa: number,
  opts: OpcoesEnvioMensagem,
): Promise<RespostaMensagem | RespostaMensagem[]> {
  if (opts.splitMessage && !opts.isReaction) {
    return enviarMensagemDivididaEmBlocos(idConta, idConversa, opts);
  }
  const corpo: Record<string, unknown> = {
    content: opts.content,
    message_type: 'outgoing',
    private: false,
    content_type: opts.contentType ?? 'text',
  };
  if (opts.replyToMessageId) corpo.content_attributes = { in_reply_to: opts.replyToMessageId };
  if (opts.isReaction) corpo.is_reaction = true;
  return chamar<RespostaMensagem>(
    `/api/v1/accounts/${idConta}/conversations/${idConversa}/messages`,
    { metodo: 'POST', corpo },
  );
}

async function enviarMensagemDivididaEmBlocos(
  idConta: number,
  idConversa: number,
  opts: OpcoesEnvioMensagem,
): Promise<RespostaMensagem[]> {
  const blocos = opts.content
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const respostas: RespostaMensagem[] = [];
  for (const [i, bloco] of blocos.entries()) {
    if (i > 0 && opts.waitBeforeSending) {
      const delay =
        opts.waitBeforeSending === 'dynamic' ? calcularDelayDinamico(bloco) : opts.waitBeforeSending;
      await new Promise((r) => setTimeout(r, delay));
    }
    const r = await enviarMensagem(idConta, idConversa, {
      content: bloco,
      replyToMessageId: i === 0 ? opts.replyToMessageId : undefined,
    });
    respostas.push(Array.isArray(r) ? r[0]! : r);
  }
  return respostas;
}

export function calcularDelayDinamico(texto: string): number {
  return Math.max(1500, Math.min(8000, texto.length * 60));
}

export async function enviarArquivo(
  idConta: number,
  idConversa: number,
  arquivo: Buffer | Uint8Array,
  opts: { nomeArquivo: string; mimeType: string; isRecordedAudio?: boolean; metadadosAnexo?: MetadadosAnexo },
): Promise<RespostaMensagem> {
  const fd = new FormData();
  fd.append('message_type', 'outgoing');
  fd.append('private', 'false');
  fd.append('content', '');
  if (opts.isRecordedAudio) fd.append('content_attributes', JSON.stringify({ is_recorded_audio: true }));
  const blob = new Blob([new Uint8Array(arquivo)], { type: opts.mimeType });
  fd.append('attachments[]', blob, opts.nomeArquivo);
  const msg = await chamar<RespostaMensagem>(
    `/api/v1/accounts/${idConta}/conversations/${idConversa}/messages`,
    { metodo: 'POST', corpo: fd },
  );
  return msg;
}

export async function listarMensagens(
  idConta: number,
  idConversa: number,
  buscarPeloMenos = 20,
): Promise<MensagemChatwoot[]> {
  const todas: MensagemChatwoot[] = [];
  let antesDeId: number | undefined;
  while (todas.length < buscarPeloMenos) {
    const resp = await chamar<{ payload: MensagemChatwoot[] }>(
      `/api/v1/accounts/${idConta}/conversations/${idConversa}/messages`,
      { query: { before: antesDeId } },
    );
    if (!resp.payload?.length) break;
    todas.push(...resp.payload);
    const ultima = resp.payload[resp.payload.length - 1];
    if (!ultima || ultima.id === antesDeId) break;
    antesDeId = ultima.id;
  }
  return todas;
}

export async function baixarAnexo(url: string): Promise<Buffer> {
  log.debug({ url }, 'baixando anexo externo');
  const r = await fetch(url);
  if (!r.ok) throw new Error(`baixarAnexo ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function atualizarMetadadosAnexo(
  idConta: number,
  idConversa: number,
  idMensagem: number,
  idAnexo: number | string,
  metadata: MetadadosAnexo,
): Promise<void> {
  await chamar(
    `/api/v1/accounts/${idConta}/conversations/${idConversa}/messages/${idMensagem}/attachments/${idAnexo}`,
    { metodo: 'PATCH', corpo: { meta: metadata } },
  );
}

// ----- Conversa -----

export async function marcarComoLida(idConta: number, idConversa: number): Promise<void> {
  await chamar(
    `/api/v1/accounts/${idConta}/conversations/${idConversa}/update_last_seen`,
    { metodo: 'POST' },
  );
}

export async function atualizarPresenca(
  idConta: number,
  idConversa: number,
  status: 'recording' | 'typing' | 'idle',
): Promise<void> {
  await chamar(
    `/api/v1/accounts/${idConta}/conversations/${idConversa}/toggle_typing_status`,
    { metodo: 'POST', corpo: { typing_status: status === 'idle' ? 'off' : status } },
  );
}

// ----- Etiquetas -----

export async function adicionarEtiquetas(
  idConta: number,
  idConversa: number,
  labels: string[],
): Promise<void> {
  // Chatwoot "labels" endpoint substitui — então combina com existentes
  const atuais = await listarEtiquetas(idConta, idConversa);
  const set = new Set([...atuais, ...labels]);
  await chamar(`/api/v1/accounts/${idConta}/conversations/${idConversa}/labels`, {
    metodo: 'POST',
    corpo: { labels: Array.from(set) },
  });
}

export async function removerEtiquetas(
  idConta: number,
  idConversa: number,
  labels: string[],
): Promise<void> {
  const atuais = await listarEtiquetas(idConta, idConversa);
  const restantes = atuais.filter((l) => !labels.includes(l));
  await chamar(`/api/v1/accounts/${idConta}/conversations/${idConversa}/labels`, {
    metodo: 'POST',
    corpo: { labels: restantes },
  });
}

export async function listarEtiquetas(idConta: number, idConversa: number): Promise<string[]> {
  const r = await chamar<{ payload: string[] }>(
    `/api/v1/accounts/${idConta}/conversations/${idConversa}/labels`,
  );
  return r.payload ?? [];
}

// ----- Contato -----

export async function atualizarContato(
  idConta: number,
  idContato: number,
  campos: { nome?: string; email?: string; atributosCustom?: Record<string, unknown> },
): Promise<void> {
  const corpo: Record<string, unknown> = {};
  if (campos.nome) corpo.name = campos.nome;
  if (campos.email) corpo.email = campos.email;
  if (campos.atributosCustom && Object.keys(campos.atributosCustom).length > 0) {
    corpo.custom_attributes = campos.atributosCustom;
  }
  if (Object.keys(corpo).length === 0) return;
  await chamar(`/api/v1/accounts/${idConta}/contacts/${idContato}`, {
    metodo: 'PATCH',
    corpo,
  });
}

// ----- Atributos customizados -----

export async function definirAtributosContato(
  idConta: number,
  idContato: number,
  attrs: Record<string, unknown>,
): Promise<void> {
  await chamar(`/api/v1/accounts/${idConta}/contacts/${idContato}`, {
    metodo: 'PATCH',
    corpo: { custom_attributes: attrs },
  });
}

export async function definirAtributosConversa(
  idConta: number,
  idConversa: number,
  attrs: Record<string, unknown>,
): Promise<void> {
  await chamar(
    `/api/v1/accounts/${idConta}/conversations/${idConversa}/custom_attributes`,
    { metodo: 'POST', corpo: { custom_attributes: attrs } },
  );
}

export async function removerAtributosContato(
  idConta: number,
  idContato: number,
  chaves: string[],
): Promise<void> {
  const c = await chamar<{ custom_attributes?: Record<string, unknown> }>(
    `/api/v1/accounts/${idConta}/contacts/${idContato}`,
  );
  const atuais = c.custom_attributes ?? {};
  for (const k of chaves) delete atuais[k];
  await definirAtributosContato(idConta, idContato, atuais);
}

export async function removerAtributosConversa(
  idConta: number,
  idConversa: number,
  chaves: string[],
): Promise<void> {
  await chamar(
    `/api/v1/accounts/${idConta}/conversations/${idConversa}/custom_attributes`,
    { metodo: 'DELETE', corpo: { custom_attributes: chaves } },
  );
}

// ----- Kanban (fazer.ai) -----
//
// Endpoints REAIS (descobertos via probe — diferentes do que o plugin n8n sugere):
//   GET    /api/v1/accounts/{id}/kanban/boards
//   GET    /api/v1/accounts/{id}/kanban/boards/{boardId}     (retorna { steps: [...] })
//   GET    /api/v1/accounts/{id}/kanban/tasks
//   PATCH  /api/v1/accounts/{id}/kanban/tasks/{taskId}

export async function buscarFunilKanban(
  idConta: number,
  idFunil: number,
): Promise<FunilKanban & { steps: EtapaKanban[] }> {
  return chamar<FunilKanban & { steps: EtapaKanban[] }>(
    `/api/v1/accounts/${idConta}/kanban/boards/${idFunil}`,
  );
}

export async function listarFunis(idConta: number): Promise<FunilKanban[]> {
  const r = await chamar<{ boards?: FunilKanban[]; payload?: FunilKanban[] } | FunilKanban[]>(
    `/api/v1/accounts/${idConta}/kanban/boards`,
  );
  if (Array.isArray(r)) return r;
  return r.boards ?? r.payload ?? [];
}

export interface PayloadAtualizarTarefa {
  title?: string;
  description?: string;
  board_step_id?: number | string;
  due_date?: string | null;
  conversation_ids?: number[];
}

export async function atualizarTarefa(
  idConta: number,
  _idFunil: number,
  idTarefa: number,
  payload: PayloadAtualizarTarefa,
): Promise<TarefaKanban> {
  return chamar<TarefaKanban>(
    `/api/v1/accounts/${idConta}/kanban/tasks/${idTarefa}`,
    { metodo: 'PATCH', corpo: payload },
  );
}

export async function moverTarefa(
  idConta: number,
  idFunil: number,
  idTarefa: number,
  idEtapa: number | string,
): Promise<TarefaKanban> {
  return atualizarTarefa(idConta, idFunil, idTarefa, { board_step_id: idEtapa });
}

export async function buscarTarefa(idConta: number, idTarefa: number): Promise<TarefaKanban> {
  return chamar<TarefaKanban>(`/api/v1/accounts/${idConta}/kanban/tasks/${idTarefa}`);
}

export async function vincularConversaATarefa(
  idConta: number,
  idTarefa: number,
  idConversa: number,
): Promise<void> {
  await chamar(`/api/v1/accounts/${idConta}/kanban/tasks/${idTarefa}`, {
    metodo: 'PATCH',
    corpo: { conversation_ids: [idConversa] },
  });
}

/**
 * Busca ou cria uma conversa para um contato (por telefone).
 * Retorna { idContato, idConversa }.
 */
export async function resolverContatoEConversa(
  idConta: number,
  telefone: string,
  idInbox: number,
  nomeContato?: string,
): Promise<{ idContato: number; idConversa: number }> {
  // 1. Tenta achar contato existente
  let contato = await buscarContatoPorTelefone(idConta, telefone);

  // 2. Cria se não existir
  if (!contato) {
    const novo = await criarContato(idConta, {
      nome: nomeContato || telefone,
      telefone,
      idInbox,
    });
    contato = { id: novo.id };
  }

  // 3. Busca conversas do contato
  const convs = await chamar<{ payload: Array<{ id: number; inbox_id?: number }> }>(
    `/api/v1/accounts/${idConta}/contacts/${contato.id}/conversations`,
  ).catch(() => ({ payload: [] as Array<{ id: number; inbox_id?: number }> }));

  // 4. Reutiliza conversa existente na inbox certa (ou qualquer uma)
  const convExistente = convs.payload.find((c) => c.inbox_id === idInbox) ?? convs.payload[0];
  if (convExistente) {
    return { idContato: contato.id, idConversa: convExistente.id };
  }

  // 5. Cria conversa nova
  const novaConv = await criarConversa(idConta, contato.id, idInbox);
  return { idContato: contato.id, idConversa: novaConv.id };
}

export async function buscarConversasDaTarefa(
  idConta: number,
  idTarefa: number,
): Promise<{ idConversa: number; idInbox: number } | null> {
  try {
    const tarefa = await chamar<TarefaKanban & { conversation_ids?: number[]; conversations?: Array<{ id: number; inbox_id?: number }> }>(
      `/api/v1/accounts/${idConta}/kanban/tasks/${idTarefa}`,
    );
    // Tenta conversations[] embutido
    const conv = tarefa.conversations?.[0];
    if (conv?.id) return { idConversa: conv.id, idInbox: conv.inbox_id ?? 0 };
    // Tenta conversation_ids[]
    const convId = tarefa.conversation_ids?.[0];
    if (!convId) return null;
    // Busca detalhes da conversa para obter inbox_id
    const detalhes = await chamar<{ id: number; inbox_id?: number }>(
      `/api/v1/accounts/${idConta}/conversations/${convId}`,
    ).catch(() => null);
    return { idConversa: convId, idInbox: detalhes?.inbox_id ?? 0 };
  } catch {
    return null;
  }
}

export async function buscarContatoPorEmail(
  idConta: number,
  email: string,
): Promise<{ id: number; telefone: string | null; ultima_conversa_id: number | null; tarefa_id: number | null } | null> {
  const resultado = await chamar<{ payload: Array<{ id: number; phone_number?: string }> }>(
    `/api/v1/accounts/${idConta}/contacts/search?q=${encodeURIComponent(email)}&page=1`,
  );
  const contato = resultado?.payload?.[0];
  if (!contato) return null;

  const conversas = await chamar<{ payload: Array<{ id: number; kanban_task?: { id: number } | null }> }>(
    `/api/v1/accounts/${idConta}/contacts/${contato.id}/conversations`,
  ).catch(() => ({ payload: [] }));

  const conversa = conversas?.payload?.[0] ?? null;
  return {
    id: contato.id,
    telefone: contato.phone_number ?? null,
    ultima_conversa_id: conversa?.id ?? null,
    tarefa_id: conversa?.kanban_task?.id ?? null,
  };
}

export async function criarTarefaKanban(
  idConta: number,
  idFunil: number,
  idEtapa: number,
  titulo: string,
  idConversa: number,
): Promise<TarefaKanban> {
  return chamar<TarefaKanban>(
    `/api/v1/accounts/${idConta}/kanban/tasks`,
    {
      metodo: 'POST',
      corpo: {
        kanban_board_id: idFunil,
        board_step_id: idEtapa,
        title: titulo,
        conversation_ids: [idConversa],
      },
    },
  );
}

export async function buscarTarefaDaConversa(
  idConta: number,
  idConversa: number,
): Promise<TarefaKanban | null> {
  try {
    const conversa = await chamar<{ kanban_task?: TarefaKanban | null }>(
      `/api/v1/accounts/${idConta}/conversations/${idConversa}`,
    );
    return conversa?.kanban_task ?? null;
  } catch {
    return null;
  }
}

/**
 * Envia uma reaction nativa do WhatsApp em uma mensagem específica.
 * Endpoint Chatwoot/Baileys: POST /messages/{id}/reactions com {"emoji":"❤️"}
 */
export async function enviarReacao(
  idConta: number,
  idConversa: number,
  idMensagem: number,
  emoji: string,
): Promise<void> {
  await chamar(
    `/api/v1/accounts/${idConta}/conversations/${idConversa}/messages/${idMensagem}/reactions`,
    { metodo: 'POST', corpo: { emoji } },
  );
}

export async function listarTarefasKanban(
  idConta: number,
  idFunil?: number,
): Promise<TarefaKanban[]> {
  const query = idFunil ? `?board_id=${idFunil}` : '';
  const r = await chamar<{ payload?: TarefaKanban[]; data?: TarefaKanban[] } | TarefaKanban[]>(
    `/api/v1/accounts/${idConta}/kanban/tasks${query}`,
  );
  if (Array.isArray(r)) return r;
  return (r as { payload?: TarefaKanban[]; data?: TarefaKanban[] }).payload ??
    (r as { payload?: TarefaKanban[]; data?: TarefaKanban[] }).data ?? [];
}

/**
 * Cria contato no Chatwoot. Falha se phone_number já existir.
 */
export async function criarContato(
  idConta: number,
  campos: { nome: string; email?: string; telefone?: string; idInbox?: number },
): Promise<{ id: number; phone_number?: string; email?: string }> {
  const corpo: Record<string, unknown> = { name: campos.nome };
  if (campos.email) corpo.email = campos.email;
  if (campos.telefone) corpo.phone_number = campos.telefone;
  if (campos.idInbox) corpo.inbox_id = campos.idInbox;
  const r = await chamar<{ payload: { contact: { id: number; phone_number?: string; email?: string } } } | { id: number }>(
    `/api/v1/accounts/${idConta}/contacts`,
    { metodo: 'POST', corpo },
  );
  // Chatwoot retorna { payload: { contact } } ou { id }
  const c = (r as { payload?: { contact?: { id: number } } }).payload?.contact ?? r;
  return c as { id: number; phone_number?: string; email?: string };
}

/**
 * Busca contato por telefone (formato +5562...).
 */
export async function buscarContatoPorTelefone(
  idConta: number,
  telefone: string,
): Promise<{ id: number; email?: string; phone_number?: string } | null> {
  try {
    const r = await chamar<{ payload: Array<{ id: number; email?: string; phone_number?: string }> }>(
      `/api/v1/accounts/${idConta}/contacts/search?q=${encodeURIComponent(telefone)}&page=1`,
    );
    return r?.payload?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Cria nova conversa para um contato existente.
 */
export async function criarConversa(
  idConta: number,
  idContato: number,
  idInbox: number,
  mensagemInicial?: string,
): Promise<{ id: number }> {
  const corpo: Record<string, unknown> = {
    contact_id: idContato,
    inbox_id: idInbox,
  };
  if (mensagemInicial) corpo.message = { content: mensagemInicial };
  const r = await chamar<{ id: number }>(
    `/api/v1/accounts/${idConta}/conversations`,
    { metodo: 'POST', corpo },
  );
  return r;
}

export async function buscarConversaPorTelefone(
  idConta: number,
  telefone: string,
): Promise<{ id: number } | null> {
  try {
    const resultado = await chamar<{ payload: Array<{ id: number }> }>(
      `/api/v1/accounts/${idConta}/contacts/search?q=${encodeURIComponent(telefone)}&page=1`,
    );
    const contato = resultado?.payload?.[0];
    if (!contato) return null;
    const conversas = await chamar<{ payload: Array<{ id: number }> }>(
      `/api/v1/accounts/${idConta}/contacts/${contato.id}/conversations`,
    ).catch(() => ({ payload: [] }));
    const conversa = conversas?.payload?.[0] ?? null;
    return conversa ? { id: conversa.id } : null;
  } catch {
    return null;
  }
}

export async function agendarMensagem(
  idConta: number,
  idConversa: number,
  conteudo: string,
  scheduledAt: string,
): Promise<{ id: number; scheduled_at: string }> {
  return chamar<{ id: number; scheduled_at: string }>(
    `/api/v1/accounts/${idConta}/conversations/${idConversa}/scheduled_messages`,
    { metodo: 'POST', corpo: { content: conteudo, scheduled_at: scheduledAt } },
  );
}
