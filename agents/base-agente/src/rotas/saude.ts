import type { Elysia } from 'elysia';
import { pingDb } from '../lib/db.ts';

export function rotaSaude(app: Elysia) {
  return app.get('/health', async () => {
    const dbOk = await pingDb().catch(() => false);
    return {
      status: 'ok',
      uptime: process.uptime(),
      db: dbOk ? 'connected' : 'error',
    };
  });
}
