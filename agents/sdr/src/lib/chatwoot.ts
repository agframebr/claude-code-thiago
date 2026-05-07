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

export async function buscarContatoPorEmail(
  idConta: number,
  email: string,
): Promise<{ id: number; ultima_conversa_id: number | null; tarefa_id: number | null } | null> {
  const resultado = await chamar<{ payload: Array<{ id: number }> }>(
    `/api/v1/accounts/${idConta}/contacts/search?q=${encodeURIComponent(email)}&page=1`,
  );
  const contato = resultado?.payload?.[0];
  if (!contato) return null;

  // Busca conversas do contato para pegar a mais recente
  const conversas = await chamar<{ payload: Array<{ id: number; kanban_task?: { id: number } | null }> }>(
    `/api/v1/accounts/${idConta}/contacts/${contato.id}/conversations`,
  ).catch(() => ({ payload: [] }));

  const conversa = conversas?.payload?.[0] ?? null;
  return {
    id: contato.id,
    ultima_conversa_id: conversa?.id ?? null,
    tarefa_id: conversa?.kanban_task?.id ?? null,
  };
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
