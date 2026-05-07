/**
 * Smoke test — valida que os grafos compilam e sobem sem erro.
 * Uso: bun run scripts/smoke-grafos.ts
 */
import { createChildLogger } from '../src/lib/logger.ts';

const log = createChildLogger({ teste: 'smoke-grafos' });
let falhas = 0;

const ok = (n: string, d?: Record<string, unknown>) => log.info({ nome: n, ...d }, '✓ ok');
const fail = (n: string, e: unknown) => { falhas++; log.error({ nome: n, err: e instanceof Error ? e.message : e }, '✗ falhou'); };

// 1) Grafo principal
try {
  const { invocarGrafoPrincipal } = await import('../src/grafos/principal/grafo.ts');
  if (typeof invocarGrafoPrincipal !== 'function') throw new Error('invocarGrafoPrincipal não é função');
  ok('grafo-principal');
} catch (err) {
  fail('grafo-principal', err);
}

// 2) Grafo follow-up
try {
  const { invocarGrafoFollowUp } = await import('../src/grafos/follow-up/grafo.ts');
  if (typeof invocarGrafoFollowUp !== 'function') throw new Error('invocarGrafoFollowUp não é função');
  ok('grafo-follow-up');
} catch (err) {
  fail('grafo-follow-up', err);
}

// 3) System prompt Isys
try {
  const { buildPromptIsys } = await import('../src/grafos/principal/prompts/isys-system.ts');
  const prompt = buildPromptIsys({ tarefa: null, funil: null, telefone: '+5500000000000' });
  if (!prompt || prompt.length < 100) throw new Error('prompt muito curto');
  ok('prompt-isys', { chars: prompt.length });
} catch (err) {
  fail('prompt-isys', err);
}

// 4) Ferramentas factory (sem invocar)
try {
  const { criarFerramentas } = await import('../src/ferramentas/index.ts');
  if (typeof criarFerramentas !== 'function') throw new Error('criarFerramentas não é função');
  ok('ferramentas-factory');
} catch (err) {
  fail('ferramentas-factory', err);
}

if (falhas > 0) {
  log.error({ falhas }, 'smoke-grafos com falhas');
  process.exit(1);
}
log.info('smoke-grafos ok ✓');
