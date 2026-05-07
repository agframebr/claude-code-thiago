/**
 * Adapter sobre tabela legada `n8n_historico_mensagens` (LangChain Postgres).
 *
 * Estrutura assumida (criada pelo n8n):
 *   id          SERIAL PRIMARY KEY
 *   session_id  TEXT
 *   message     JSONB    -- formato LangChain serializado
 *
 * Mantém compatibilidade com WF01 e WF08 — ambos compartilham essa tabela.
 */
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage, ToolMessage } from '@langchain/core/messages';
import { consultar } from './db.ts';
import { createChildLogger } from './logger.ts';

const log = createChildLogger({ modulo: 'memoria-chat' });

interface MensagemSerializada {
  type?: string;
  data?: { content?: string; tool_calls?: unknown[]; additional_kwargs?: Record<string, unknown> };
  content?: string;
  tool_calls?: unknown[];
  additional_kwargs?: Record<string, unknown>;
}

function deserializar(raw: unknown): BaseMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as MensagemSerializada;
  // Formato LangChain padrão tem { type, data: { content, ... } }; fallback para flat.
  const type = m.type ?? '';
  const data = m.data ?? m;
  const content = data.content ?? '';
  const additional = data.additional_kwargs ?? {};

  switch (type) {
    case 'human':
    case 'HumanMessage':
      return new HumanMessage({ content, additional_kwargs: additional });
    case 'ai':
    case 'AIMessage': {
      // Remove tool_calls do additional_kwargs para evitar 400 "tool must follow tool_call"
      const { tool_calls: _tc, function_call: _fc, ...additionalLimpo } = additional as Record<string, unknown>;
      return new AIMessage({ content, additional_kwargs: additionalLimpo });
    }
    case 'system':
    case 'SystemMessage':
      return new SystemMessage({ content, additional_kwargs: additional });
    case 'tool':
    case 'ToolMessage':
      return new ToolMessage({ content, tool_call_id: (additional.tool_call_id as string) ?? '' });
    default:
      log.warn({ type }, 'tipo de mensagem desconhecido — ignorando');
      return null;
  }
}

function serializar(msg: BaseMessage): MensagemSerializada {
  const tipo =
    msg instanceof HumanMessage
      ? 'human'
      : msg instanceof AIMessage
        ? 'ai'
        : msg instanceof SystemMessage
          ? 'system'
          : msg instanceof ToolMessage
            ? 'tool'
            : 'unknown';
  return {
    type: tipo,
    data: {
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      additional_kwargs: msg.additional_kwargs ?? {},
    },
  };
}

export async function carregarHistorico(telefone: string, limite = 50): Promise<BaseMessage[]> {
  const r = await consultar<{ message: unknown }>(
    `SELECT message FROM n8n_historico_mensagens WHERE session_id = $1 ORDER BY id ASC LIMIT $2`,
    [telefone, limite],
  );
  return r.rows
    .map((row) => deserializar(row.message))
    .filter((m): m is BaseMessage => m !== null && !(m instanceof ToolMessage));
}

export async function salvarMensagem(telefone: string, mensagem: BaseMessage): Promise<void> {
  await consultar(
    `INSERT INTO n8n_historico_mensagens (session_id, message) VALUES ($1, $2)`,
    [telefone, JSON.stringify(serializar(mensagem))],
  );
}

export async function salvarMensagens(telefone: string, mensagens: BaseMessage[]): Promise<void> {
  for (const m of mensagens) await salvarMensagem(telefone, m);
}

/**
 * Salva tool calls como AIMessage XML — formato VERBATIM do n8n (Plano §4.19).
 */
export async function salvarToolCallsXml(
  telefone: string,
  steps: Array<{ action: { log: string }; observation: unknown }>,
): Promise<void> {
  if (!steps.length) return;
  const inner = steps
    .map(
      (s) =>
        `<tool-call><action>${s.action.log}</action><result>${typeof s.observation === 'string' ? s.observation : JSON.stringify(s.observation)}</result></tool-call>`,
    )
    .join('')
    .replaceAll('"', "'");
  const conteudo = `<tool-calls>${inner}</tool-calls>`;
  await salvarMensagem(telefone, new AIMessage({ content: conteudo }));
}

export async function apagarHistorico(telefone: string): Promise<void> {
  await consultar(`DELETE FROM n8n_historico_mensagens WHERE session_id = $1`, [telefone]);
}
