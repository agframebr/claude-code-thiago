/**
 * Smoke M4 — apenas verifica que os grafos compilam, importam e podem ser construídos
 * (sem invocar — invocação real exige webhook completo do Chatwoot).
 */
import { createChildLogger } from '../src/lib/logger.ts';
import { fecharPool } from '../src/lib/db.ts';

const log = createChildLogger({ teste: 'smoke-grafos' });
let falhas = 0;
const ok = (n: string, d?: Record<string, unknown>) => log.info({ nome: n, ...d }, '✓ ok');
const fail = (n: string, e: unknown) => { falhas++; log.error({ nome: n, err: e instanceof Error ? e.message : e }, '✗ falhou'); };

// 1) grafo principal — importa e tenta construir
try {
  const { invocarGrafoPrincipal } = await import('../src/grafos/principal/grafo.ts');
  if (typeof invocarGrafoPrincipal !== 'function') throw new Error('export inválido');
  ok('grafo-principal.import');
} catch (err) {
  fail('grafo-principal.import', err);
}

// 2) grafo follow-up
try {
  const { invocarGrafoFollowUp } = await import('../src/grafos/follow-up/grafo.ts');
  if (typeof invocarGrafoFollowUp !== 'function') throw new Error('export inválido');
  ok('grafo-follow-up.import');
} catch (err) {
  fail('grafo-follow-up.import', err);
}

// 3) ferramentas factory
try {
  const { criarFerramentas } = await import('../src/ferramentas/index.ts');
  const tools = criarFerramentas({
    telefone: '+5511999999999',
    idConta: 1,
    idContato: 1,
    idConversa: 1,
    idInbox: 1,
    idMensagem: 1,
    nome: 'Teste',
    tarefa: null,
    funil: null,
    mensagensColetadas: '',
  });
  if (tools.length !== 9) throw new Error(`esperava 9 tools, recebeu ${tools.length}`);
  const nomes = tools.map((t) => t.name);
  ok('ferramentas.factory', { qtd: tools.length, nomes });
} catch (err) {
  fail('ferramentas.factory', err);
}

// 4) prompt da Maria
try {
  const { buildPromptMaria } = await import('../src/grafos/principal/prompts/maria-system.ts');
  const p = buildPromptMaria({ tarefa: null, funil: null });
  if (!p.includes('Maria')) throw new Error('prompt sem palavra "Maria"');
  if (p.length < 20000) throw new Error(`prompt suspeito (${p.length} chars)`);
  ok('prompt-maria', { chars: p.length });
} catch (err) {
  fail('prompt-maria', err);
}

await fecharPool();

if (falhas > 0) {
  log.error({ falhas }, 'smoke grafos FALHOU');
  process.exit(1);
}
log.info('smoke grafos PASSOU');
process.exit(0);
