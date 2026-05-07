/**
 * Setup idempotente: tabelas Postgres, etiquetas Chatwoot.
 * Uso: bun run scripts/setup.ts
 */
import { createChildLogger } from '../src/lib/logger.ts';
import { consultar, fecharPool } from '../src/lib/db.ts';
import { config } from '../src/config.ts';

const log = createChildLogger({ script: 'setup' });
let falhas = 0;

const ok = (n: string, d?: Record<string, unknown>) => log.info({ passo: n, ...d }, '✓ ok');
const fail = (n: string, e: unknown) => { falhas++; log.error({ passo: n, err: e instanceof Error ? e.message : e }, '✗ falhou'); };

// ---- 1. Tabelas Postgres ----
log.info('criando tabelas postgres (idempotente)...');
try {
  await consultar(`
    CREATE TABLE IF NOT EXISTS n8n_historico_mensagens (
      id         SERIAL PRIMARY KEY,
      session_id VARCHAR(40) NOT NULL,
      message    JSONB NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_historico_session ON n8n_historico_mensagens(session_id);

    CREATE TABLE IF NOT EXISTS n8n_fila_mensagens (
      id          BIGSERIAL PRIMARY KEY,
      id_mensagem VARCHAR(40) NOT NULL,
      telefone    VARCHAR(40) NOT NULL,
      mensagem    TEXT NOT NULL,
      "timestamp" TIMESTAMP WITHOUT TIME ZONE NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fila_telefone ON n8n_fila_mensagens(telefone);

    CREATE TABLE IF NOT EXISTS n8n_status_atendimento (
      id            SERIAL PRIMARY KEY,
      session_id    VARCHAR(40) UNIQUE NOT NULL,
      lock_conversa BOOLEAN DEFAULT FALSE,
      updated_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_status_session ON n8n_status_atendimento(session_id);
  `);
  ok('tabelas-postgres');
} catch (err) {
  fail('tabelas-postgres', err);
}

// ---- 2. Etiquetas Chatwoot ----
log.info('verificando etiquetas chatwoot...');
try {
  const BASE = config.CHATWOOT_BASE_URL.replace(/\/$/, '');
  const TOKEN = config.CHATWOOT_API_TOKEN;
  const ID = config.CHATWOOT_ACCOUNT_ID;

  const etiquetas = [
    { title: 'testando-agente', color: '#6BBF8A', description: 'Habilita agente IA em modo teste', show_on_sidebar: true },
    { title: 'agente-off', color: '#E8735A', description: 'Desabilita agente IA', show_on_sidebar: true },
  ];

  const res = await fetch(`${BASE}/api/v1/accounts/${ID}/labels`, {
    headers: { api_access_token: TOKEN },
  });
  const existentes: string[] = (await res.json() as { payload: Array<{ title: string }> }).payload?.map((l: { title: string }) => l.title) ?? [];

  for (const etiqueta of etiquetas) {
    if (existentes.includes(etiqueta.title)) {
      ok(`etiqueta-${etiqueta.title}`, { status: 'já existe' });
      continue;
    }
    await fetch(`${BASE}/api/v1/accounts/${ID}/labels`, {
      method: 'POST',
      headers: { api_access_token: TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(etiqueta),
    });
    ok(`etiqueta-${etiqueta.title}`, { status: 'criada' });
  }
} catch (err) {
  fail('etiquetas-chatwoot', err);
}

// ---- 3. Verificar Kanban ----
log.info('verificando kanban...');
try {
  const BASE = config.CHATWOOT_BASE_URL.replace(/\/$/, '');
  const TOKEN = config.CHATWOOT_API_TOKEN;
  const ID = config.CHATWOOT_ACCOUNT_ID;

  const res = await fetch(`${BASE}/api/v1/accounts/${ID}/kanban/boards`, {
    headers: { api_access_token: TOKEN },
  });
  const data = await res.json() as { boards: Array<{ id: number; name: string; total_tasks_count: number }> };
  const board = data.boards?.find((b: { id: number }) => b.id === config.KANBAN_BOARD_ID);

  if (!board) throw new Error(`Board ID ${config.KANBAN_BOARD_ID} não encontrado`);
  ok('kanban-board', { nome: board.name, leads: board.total_tasks_count });
} catch (err) {
  fail('kanban-board', err);
}

await fecharPool();

if (falhas > 0) {
  log.error({ falhas }, 'setup concluído com falhas');
  process.exit(1);
}
log.info('setup concluído com sucesso ✓');
