import { type Elysia } from 'elysia';
import { timingSafeEqual } from 'crypto';
import { apagarHistorico } from '../lib/memoria-chat.ts';
import { consultar } from '../lib/db.ts';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';
import { enviarBriefingDiarioPara, gerarConteudoBriefing } from '../lib/briefingDiario.ts';
import { TELEFONE_THIAGO, TELEFONE_LETICIA } from '../dominio/vetrik.ts';

const log = createChildLogger({ rota: 'admin' });

const TOKEN_ADMIN = config.ADMIN_TOKEN;
const TOKEN_BUF = Buffer.from(TOKEN_ADMIN);

function tokenValido(recebido: string): boolean {
  if (!recebido) return false;
  const buf = Buffer.from(recebido);
  if (buf.length !== TOKEN_BUF.length) return false;
  return timingSafeEqual(buf, TOKEN_BUF);
}

export function rotaAdmin(app: Elysia) {
  return app
    .get('/admin/briefing-preview', async ({ headers, set }) => {
      if (!tokenValido((headers['x-admin-token'] as string) ?? '')) {
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
    .post('/admin/briefing-enviar', async ({ headers, query, set }) => {
      if (!tokenValido((headers['x-admin-token'] as string) ?? '')) {
        set.status = 401;
        return { erro: 'token inválido' };
      }
      const destino = (query.para as string) ?? 'thiago';
      const tel = destino === 'leticia' ? TELEFONE_LETICIA : TELEFONE_THIAGO;
      const ok = await enviarBriefingDiarioPara(tel);
      return { ok, telefone: tel };
    })
    .post('/admin/limpar-memoria', async ({ headers, query, set }) => {
      if (!tokenValido((headers['x-admin-token'] as string) ?? '')) {
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
