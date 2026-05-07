import { type Elysia } from 'elysia';
import { apagarHistorico } from '../lib/memoria-chat.ts';
import { consultar } from '../lib/db.ts';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';
import { enviarBriefingDiarioPara, gerarConteudoBriefing } from '../lib/briefingDiario.ts';
import { TELEFONE_THIAGO, TELEFONE_LETICIA } from '../dominio/vetrik.ts';

const log = createChildLogger({ rota: 'admin' });

// Token de admin é o próprio CALENDLY_WEBHOOK_SECRET (já é um secret aleatório)
const TOKEN_ADMIN = config.CALENDLY_WEBHOOK_SECRET;

export function rotaAdmin(app: Elysia) {
  return app
    .get('/admin/briefing-preview', async ({ query, set }) => {
      if ((query.token as string) !== TOKEN_ADMIN) {
        set.status = 401;
        return { erro: 'token inválido' };
      }
      try {
        const conteudo = await gerarConteudoBriefing();
        set.headers['content-type'] = 'text/plain; charset=utf-8';
        return conteudo;
      } catch (err) {
        set.status = 500;
        return { erro: err instanceof Error ? err.message : 'erro' };
      }
    })
    .post('/admin/briefing-enviar', async ({ query, set }) => {
      if ((query.token as string) !== TOKEN_ADMIN) {
        set.status = 401;
        return { erro: 'token inválido' };
      }
      const destino = (query.para as string) ?? 'thiago';
      const tel = destino === 'leticia' ? TELEFONE_LETICIA : TELEFONE_THIAGO;
      const ok = await enviarBriefingDiarioPara(tel);
      return { ok, telefone: tel };
    })
    .post('/admin/limpar-memoria', async ({ query, set, headers }) => {
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
