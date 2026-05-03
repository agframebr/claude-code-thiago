import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config.ts';
import { createChildLogger } from './logger.ts';

const log = createChildLogger({ modulo: 'db' });

export const pool = new Pool({
  host: config.POSTGRES_HOST,
  port: config.POSTGRES_PORT,
  database: config.POSTGRES_DB,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  log.error({ err }, 'erro inesperado no pool postgres');
});

export function buildPgUrl(): string {
  const senha = encodeURIComponent(config.POSTGRES_PASSWORD);
  return `postgresql://${config.POSTGRES_USER}:${senha}@${config.POSTGRES_HOST}:${config.POSTGRES_PORT}/${config.POSTGRES_DB}`;
}

export async function consultar<T extends QueryResultRow = QueryResultRow>(
  texto: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const inicio = Date.now();
  try {
    const r = await pool.query<T>(texto, params);
    log.debug({ duracaoMs: Date.now() - inicio, linhas: r.rowCount }, 'query ok');
    return r;
  } catch (err) {
    log.error({ err, texto, duracaoMs: Date.now() - inicio }, 'query falhou');
    throw err;
  }
}

export async function comTransacao<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

export async function pingDb(): Promise<boolean> {
  const r = await consultar<{ ok: number }>('SELECT 1 AS ok');
  return r.rows[0]?.ok === 1;
}

export async function fecharPool(): Promise<void> {
  await pool.end();
}
