/**
 * Smoke test M1 — valida módulos foundation.
 *
 * Uso: bun run scripts/smoke-foundation.ts
 *
 * Não tenta abrir conexão Postgres por padrão (host interno Coolify).
 * Passe --pg para incluir o ping no banco.
 */
import { config } from '../src/config.ts';
import { logger, createChildLogger } from '../src/lib/logger.ts';
import { agora, formatarHumano, formatarISO } from '../src/lib/datas.ts';
import { langfuseAtivo, createLangfuseHandler, flushLangfuseHandler } from '../src/lib/langfuse.ts';
import { getGoogleAuth, SCOPES_CALENDAR } from '../src/lib/google-auth.ts';

const log = createChildLogger({ teste: 'smoke-foundation' });
let falhas = 0;

function ok(nome: string, detalhe?: Record<string, unknown>) {
  log.info({ nome, ...detalhe }, '✓ ok');
}
function fail(nome: string, err: unknown) {
  falhas++;
  log.error({ nome, err: err instanceof Error ? err.message : err }, '✗ falhou');
}

// 1) config
try {
  if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ausente');
  if (!config.CHATWOOT_BASE_URL) throw new Error('CHATWOOT_BASE_URL ausente');
  ok('config', {
    PORT: config.PORT,
    HOST: config.HOST,
    NODE_ENV: config.NODE_ENV,
    APP_TIMEZONE: config.APP_TIMEZONE,
    OPENAI_MODEL: config.OPENAI_MODEL,
    OPENAI_MODEL_FORMATTER: config.OPENAI_MODEL_FORMATTER,
  });
} catch (err) {
  fail('config', err);
}

// 2) logger
try {
  logger.debug('mensagem debug — só aparece se LOG_LEVEL=debug');
  ok('logger', { nivel: logger.level });
} catch (err) {
  fail('logger', err);
}

// 3) datas
try {
  const dt = agora();
  if (dt.zoneName !== config.APP_TIMEZONE) {
    throw new Error(`tz incorreta: ${dt.zoneName} ≠ ${config.APP_TIMEZONE}`);
  }
  ok('datas', { agora: formatarISO(dt), humano: formatarHumano(dt) });
} catch (err) {
  fail('datas', err);
}

// 4) langfuse
try {
  const handler = createLangfuseHandler('smoke-test', { sessionId: 'smoke', tags: ['smoke'] });
  if (langfuseAtivo && !handler) throw new Error('handler não criado mesmo com langfuse ativo');
  if (!langfuseAtivo && handler) throw new Error('handler criado mesmo com langfuse inativo');
  await flushLangfuseHandler(handler);
  ok('langfuse', { ativo: langfuseAtivo });
} catch (err) {
  fail('langfuse', err);
}

// 5) google-auth
try {
  const auth = getGoogleAuth(SCOPES_CALENDAR);
  const cliente = await auth.getClient();
  // Tentar buscar token (testa que a service account é válida)
  const tokenResp = await cliente.getAccessToken();
  if (!tokenResp.token) throw new Error('token vazio');
  ok('google-auth', { tokenLen: tokenResp.token.length });
} catch (err) {
  fail('google-auth', err);
}

// 6) checkpointer/db (opcional — só se --pg)
if (process.argv.includes('--pg')) {
  try {
    const { pingDb, fecharPool } = await import('../src/lib/db.ts');
    const ping = await pingDb();
    if (!ping) throw new Error('ping retornou false');
    ok('db.ping');

    const { getCheckpointer } = await import('../src/lib/checkpointer.ts');
    await getCheckpointer();
    ok('checkpointer.setup');

    await fecharPool();
  } catch (err) {
    fail('postgres', err);
  }
} else {
  log.warn('postgres pulado — passe --pg para incluir');
}

if (falhas > 0) {
  log.error({ falhas }, 'smoke test FALHOU');
  process.exit(1);
}
log.info('smoke test PASSOU');
process.exit(0);
