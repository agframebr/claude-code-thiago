/**
 * WF00 — Setup idempotente: tabelas Postgres, etiquetas e funil Kanban.
 *
 * Uso: bun run scripts/setup.ts
 */
import { createChildLogger } from '../src/lib/logger.ts';
import { consultar, fecharPool } from '../src/lib/db.ts';
import {
  adicionarEtiquetas,
  listarFunis,
  buscarFunilKanban,
} from '../src/lib/chatwoot.ts';
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
const etiquetas = [
  { nome: 'testando-agente', cor: '#6BBF8A', descricao: 'Habilita agente IA em modo teste' },
  { nome: 'agente-off', cor: '#E8735A', descricao: 'Desabilita agente IA' },
];

for (const et of etiquetas) {
  try {
    // Chatwoot retorna 422 se etiqueta já existe — ignorar
    const resp = await fetch(
      `${config.CHATWOOT_BASE_URL}/api/v1/accounts/${config.CHATWOOT_ACCOUNT_ID}/labels`,
      {
        method: 'POST',
        headers: { api_access_token: config.CHATWOOT_API_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: et.nome, color: et.cor, description: et.descricao, show_on_sidebar: true }),
      },
    );
    if (resp.ok || resp.status === 422) {
      ok(`etiqueta:${et.nome}`, { status: resp.status });
    } else {
      fail(`etiqueta:${et.nome}`, `HTTP ${resp.status}`);
    }
  } catch (err) {
    fail(`etiqueta:${et.nome}`, err);
  }
}

// ---- 3. Funil Kanban ----
log.info('verificando funil kanban...');
const etapas = [
  { nome: 'Novo Lead', cor: '#5B9BD5' },
  { nome: 'Qualificado', cor: '#F4C542' },
  { nome: 'Diagnóstico Agendado', cor: '#6BBF8A' },
  { nome: 'Diagnóstico Feito', cor: '#9B7ED8' },
  { nome: 'Proposta Enviada', cor: '#3A8F5C' },
  { nome: 'Fechado', cor: '#2E7D32' },
  { nome: 'Perdido', cor: '#A0A0A0' },
  { nome: 'Cliente Ativo', cor: '#5CC0C7' },
];

try {
  const funis = await listarFunis(config.CHATWOOT_ACCOUNT_ID);
  const funilExistente = funis.find((f) => f.name === 'Pipeline VETRIK' || f.name === 'Clínica de Odontologia');

  if (funilExistente) {
    ok('funil', { id: funilExistente.id, nome: funilExistente.name, status: 'já existe' });
    const detalhes = await buscarFunilKanban(config.CHATWOOT_ACCOUNT_ID, funilExistente.id as number);
    ok('etapas-funil', { qtd: detalhes.steps?.length ?? 0, nomes: detalhes.steps?.map((s) => s.name) });
  } else {
    log.warn('Funil "Clínica de Odontologia" não encontrado — criação via API ainda não implementada. Crie manualmente no Chatwoot.');
    log.info({ etapas_necessarias: etapas.map((e) => e.nome) }, 'etapas necessárias');
    falhas++;
  }
} catch (err) {
  fail('funil', err);
}

await fecharPool();

if (falhas > 0) {
  log.error({ falhas }, 'setup concluído com falhas');
  process.exit(1);
}
log.info('setup concluído com sucesso');
process.exit(0);
