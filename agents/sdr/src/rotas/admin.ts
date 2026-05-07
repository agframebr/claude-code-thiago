import { type Elysia } from 'elysia';
import { apagarHistorico } from '../lib/memoria-chat.ts';
import { consultar } from '../lib/db.ts';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';

const log = createChildLogger({ rota: 'admin' });

// Token de admin é o próprio CALENDLY_WEBHOOK_SECRET (já é um secret aleatório)
const TOKEN_ADMIN = config.CALENDLY_WEBHOOK_SECRET;

export function rotaAdmin(app: Elysia) {
  return app.post('/admin/limpar-memoria', async ({ query, set, headers }) => {
    const tokenRecebido = (headers['x-admin-token'] as string) ?? (query.token as string) ?? '';
    if (tokenRecebido !== TOKEN_ADMIN) {
      set.status = 401;
      return { erro: 'token inválido' };
    }
    const telefone = (query.telefone as string) ?? '';
    if (!telefone) {
      set.status = 400;
      return { erro: 'parâmetro telefone obrigatório (ex: ?telefone=+5562998311402)' };
    }
    try {
      await apagarHistorico(telefone);
      await consultar('DELETE FROM checkpoint_blobs WHERE thread_id = $1', [telefone]).catch(() => {});
      await consultar('DELETE FROM checkpoint_writes WHERE thread_id = $1', [telefone]).catch(() => {});
      await consultar('DELETE FROM checkpoints WHERE thread_id = $1', [telefone]).catch(() => {});
      log.info({ telefone }, 'memória apagada via admin');
      return { ok: true, telefone };
    } catch (err) {
      log.error({ err, telefone }, 'falha ao limpar memória');
      set.status = 500;
      return { erro: err instanceof Error ? err.message : String(err) };
    }
  });
}
