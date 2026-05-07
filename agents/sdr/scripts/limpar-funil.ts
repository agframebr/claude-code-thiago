/**
 * Limpa o funil do Chatwoot:
 * 1. Remove todos os cards do Kanban
 * 2. Remove todos os contatos (cascateia conversas)
 *
 * Uso: bun run scripts/limpar-funil.ts
 */

const BASE = 'https://chatwoot.vetrik.com.br';
const TOKEN = 'vjRSDFqAHzJQKXK7wt4vFjGo';
const ACCOUNT_ID = 1;
const BOARD_ID = 2;

// Telefones que NÃO devem ser removidos (Thiago e Leticia)
const TELEFONES_PROTEGIDOS = new Set(['+5562998311402', '+5562999358918']);

async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      api_access_token: TOKEN,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`${method} ${path} → ${resp.status}: ${txt.slice(0, 200)}`);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

// ── 1. Deletar todos os cards do Kanban ──────────────────────────────────────

async function deletarTasks() {
  console.log('\n── Buscando cards do Kanban...');
  const r = await api<{ tasks?: Array<{ id: number; title?: string }> }>(
    `/api/v1/accounts/${ACCOUNT_ID}/kanban/tasks?board_id=${BOARD_ID}`,
  );
  const tasks = r?.tasks ?? [];
  console.log(`   ${tasks.length} cards encontrados`);

  let deletados = 0;
  for (const t of tasks) {
    try {
      await api(`/api/v1/accounts/${ACCOUNT_ID}/kanban/tasks/${t.id}`, 'DELETE');
      console.log(`   ✓ Card #${t.id} "${t.title ?? ''}" removido`);
      deletados++;
    } catch (err) {
      console.warn(`   ✗ Falha ao deletar card #${t.id}:`, err);
    }
  }
  console.log(`   → ${deletados}/${tasks.length} cards removidos`);
}

// ── 2. Deletar todos os contatos (paginado) ──────────────────────────────────

async function deletarContatos() {
  console.log('\n── Buscando contatos...');

  let page = 1;
  let totalDeletados = 0;
  let totalIgnorados = 0;

  while (true) {
    const r = await api<{
      payload: Array<{ id: number; name?: string; phone_number?: string }>;
      meta?: { count?: number };
    }>(`/api/v1/accounts/${ACCOUNT_ID}/contacts?page=${page}`);

    const contatos = r?.payload ?? [];
    if (contatos.length === 0) break;

    console.log(`   Página ${page}: ${contatos.length} contatos`);

    for (const c of contatos) {
      const tel = c.phone_number ?? '';
      if (TELEFONES_PROTEGIDOS.has(tel)) {
        console.log(`   ⊘ Contato #${c.id} "${c.name}" (${tel}) protegido — ignorando`);
        totalIgnorados++;
        continue;
      }
      try {
        await api(`/api/v1/accounts/${ACCOUNT_ID}/contacts/${c.id}`, 'DELETE');
        console.log(`   ✓ Contato #${c.id} "${c.name ?? tel}" removido`);
        totalDeletados++;
      } catch (err) {
        console.warn(`   ✗ Falha ao deletar contato #${c.id}:`, err);
      }
    }

    // Se retornou menos de 15, chegou no fim
    if (contatos.length < 15) break;
    page++;
  }

  console.log(`   → ${totalDeletados} contatos removidos, ${totalIgnorados} protegidos`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('🗑️  Iniciando limpeza do funil Vetrik...');
console.log(`   Conta: ${ACCOUNT_ID} | Board: ${BOARD_ID}`);
console.log(`   Protegidos: ${[...TELEFONES_PROTEGIDOS].join(', ')}`);

await deletarTasks();
await deletarContatos();

console.log('\n✅ Limpeza concluída. Só as colunas ficaram.');
