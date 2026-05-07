/**
 * Extrai leads do Google Maps via Apify, filtra por celular (WhatsApp)
 * e cria cards em Mapeado no Kanban da Ísys.
 *
 * Uso: bun run scripts/puxar-leads-apify.ts
 */

const APIFY_TOKEN = 'apify_api_1y2SGHh8dIrg2kt1biGwNVt7LX7reQ1qqlD7';
const ACTOR_ID = 'compass~crawler-google-places';

const CHATWOOT_BASE = 'https://chatwoot.vetrik.com.br';
const CHATWOOT_TOKEN = 'vjRSDFqAHzJQKXK7wt4vFjGo';
const ACCOUNT_ID = 1;
const BOARD_ID = 3;
const STEP_MAPEADO = 20;

// ─── Buscas (categoria + cidade) ────────────────────────────────────────────

const BUSCAS = [
  // Saúde
  'clínica médica Goiânia',
  'clínica odontológica Goiânia',
  'clínica veterinária Goiânia',
  'fisioterapia Goiânia',
  'clínica de estética Goiânia',
  // Imóveis
  'imobiliária Goiânia',
  // Beleza
  'salão de beleza Goiânia',
  'barbearia Goiânia',
  // Serviços
  'contabilidade Goiânia',
  'advocacia Goiânia',
];

const MAX_POR_BUSCA = 40; // ~400 brutos no total

// ─── Helpers ────────────────────────────────────────────────────────────────

async function apify(path: string, method = 'GET', body?: unknown) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`https://api.apify.com/v2${path}${sep}token=${APIFY_TOKEN}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Apify ${method} ${path} → ${r.status}: ${await r.text().then(t => t.slice(0,200))}`);
  return r.json() as Promise<any>;
}

async function chatwoot(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(`${CHATWOOT_BASE}${path}`, {
    method,
    headers: { api_access_token: CHATWOOT_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok && r.status !== 204) throw new Error(`Chatwoot ${r.status}: ${await r.text().then(t => t.slice(0,200))}`);
  if (r.status === 204 || r.headers.get('content-length') === '0') return null;
  return r.json() as Promise<any>;
}

// ─── Normalização de telefone ────────────────────────────────────────────────

function normalizarTelefone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');

  // Remove código do país se vier
  let numero = digits;
  if (numero.startsWith('55') && numero.length > 11) numero = numero.slice(2);

  // Precisa ter 10 ou 11 dígitos (DDD + número)
  if (numero.length < 10 || numero.length > 11) return null;

  return `+55${numero}`;
}

function ehCelular(tel: string): boolean {
  // Remove +55, fica DDD(2) + número
  const digits = tel.replace(/\D/g, '').replace(/^55/, '');
  // Celular: 11 dígitos no total (DDD + 9 + 8 dígitos)
  // O 3º dígito (primeiro do número após DDD) deve ser 9
  if (digits.length !== 11) return false;
  return digits[2] === '9';
}

// ─── Qualificação do lead ────────────────────────────────────────────────────

function qualificar(item: any): string {
  const temSite = !!(item.website && item.website.trim());
  const nota = item.totalScore ?? item.rating ?? 0;
  const avaliacoes = item.reviewsCount ?? item.userRatingsTotal ?? 0;

  if (!temSite) return 'sem-site';
  if (nota > 0 && nota < 3.5) return 'reputacao-baixa';
  if (avaliacoes < 15) return 'poucas-avaliacoes';
  return 'estruturado';
}

// ─── Formatar descrição do card ──────────────────────────────────────────────

function formatarDescricao(item: any, tel: string, qualificacao: string): string {
  const nota = item.totalScore ?? item.rating ?? 0;
  const avaliacoes = item.reviewsCount ?? item.userRatingsTotal ?? 0;
  const site = item.website?.trim() || 'Sem site';
  const endereco = item.address || item.vicinity || '';
  const categoria = item.categoryName ?? item.types?.[0] ?? '';

  return [
    `📞 ${tel}`,
    endereco ? `📍 ${endereco}` : null,
    categoria ? `🏷 ${categoria}` : null,
    `🌐 ${site}`,
    nota ? `⭐ Nota: ${nota.toFixed(1)} | 💬 Avaliações: ${avaliacoes}` : `💬 Avaliações: ${avaliacoes}`,
    `❗ Qualificação: ${qualificacao}`,
    item.url ? `🗺 ${item.url}` : null,
  ].filter(Boolean).join('\n');
}

// ─── Criar card no Kanban ────────────────────────────────────────────────────

async function criarCard(nome: string, descricao: string): Promise<boolean> {
  try {
    await chatwoot(`/api/v1/accounts/${ACCOUNT_ID}/kanban/tasks`, 'POST', {
      kanban_board_id: BOARD_ID,
      board_step_id: STEP_MAPEADO,
      title: nome,
      description: descricao,
    });
    return true;
  } catch (err: any) {
    console.warn(`  ✗ Falha ao criar card "${nome}": ${err.message}`);
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('🚀 Iniciando extração Apify → Kanban Ísys');
console.log(`   Buscas: ${BUSCAS.length} | Max por busca: ${MAX_POR_BUSCA}`);

// 1. Iniciar run no Apify
console.log('\n▶ Iniciando ator no Apify...');
const run = await apify(`/acts/${ACTOR_ID}/runs`, 'POST', {
  searchStringsArray: BUSCAS,
  maxCrawledPlacesPerSearch: MAX_POR_BUSCA,
  language: 'en',
  countryCode: 'br',
  includeHistogram: false,
  includeOpeningHours: false,
  includePeopleAlsoSearch: false,
  maxImages: 0,
  maxReviews: 0,
});

const runId = run.data?.id;
const datasetId = run.data?.defaultDatasetId;
console.log(`   Run ID: ${runId}`);
console.log(`   Dataset: ${datasetId}`);

// 2. Aguardar conclusão
console.log('\n⏳ Aguardando extração (pode levar alguns minutos)...');
let status = '';
let tentativas = 0;
while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
  await new Promise(r => setTimeout(r, 15000));
  tentativas++;
  const runStatus = await apify(`/actor-runs/${runId}`);
  status = runStatus.data?.status ?? 'UNKNOWN';
  const stats = runStatus.data?.stats;
  process.stdout.write(`   [${tentativas * 15}s] Status: ${status}`);
  if (stats?.requestsFinished) process.stdout.write(` | Processados: ${stats.requestsFinished}`);
  process.stdout.write('\n');
}

if (status !== 'SUCCEEDED') {
  console.error(`\n❌ Ator terminou com status: ${status}`);
  process.exit(1);
}

// 3. Buscar resultados (paginado)
console.log('\n📥 Baixando resultados...');
let offset = 0;
const limit = 200;
const todos: any[] = [];
while (true) {
  const page = await apify(`/datasets/${datasetId}/items?offset=${offset}&limit=${limit}&clean=true`);
  const items: any[] = page?.items ?? page ?? [];
  if (items.length === 0) break;
  todos.push(...items);
  if (items.length < limit) break;
  offset += limit;
}
console.log(`   ${todos.length} registros brutos`);

// 4. Filtrar e criar cards
console.log('\n🔍 Filtrando e criando cards...');

let criados = 0;
let semTel = 0;
let telFixo = 0;
let semNome = 0;
const vistos = new Set<string>();

for (const item of todos) {
  const nome = item.title?.trim() || item.name?.trim();
  if (!nome) { semNome++; continue; }

  const telRaw = item.phone ?? item.phoneUnformatted ?? item.internationalPhoneNumber ?? '';
  const tel = normalizarTelefone(telRaw);
  if (!tel) { semTel++; continue; }
  if (!ehCelular(tel)) { telFixo++; continue; }

  // Deduplicar por telefone
  if (vistos.has(tel)) continue;
  vistos.add(tel);

  const qualificacao = qualificar(item);
  const descricao = formatarDescricao(item, tel, qualificacao);

  const ok = await criarCard(nome, descricao);
  if (ok) {
    criados++;
    console.log(`  ✓ [${qualificacao}] ${nome} | ${tel}`);
  }
}

console.log(`
╔══════════════════════════════════╗
║         RESULTADO FINAL          ║
╠══════════════════════════════════╣
║ Brutos extraídos:    ${String(todos.length).padStart(5)}        ║
║ Sem nome:            ${String(semNome).padStart(5)}        ║
║ Sem telefone:        ${String(semTel).padStart(5)}        ║
║ Tel. fixo (ignorado):${String(telFixo).padStart(5)}        ║
║ Cards criados:       ${String(criados).padStart(5)}        ║
╚══════════════════════════════════╝
`);
console.log('✅ Leads em Mapeado no Kanban da Ísys.');
