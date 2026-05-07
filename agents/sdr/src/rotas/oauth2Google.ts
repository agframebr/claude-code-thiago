import { type Elysia } from 'elysia';
import { google } from 'googleapis';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';

const log = createChildLogger({ rota: 'oauth2-google' });

const REDIRECT_URI = 'https://sdr.vetrik.com.br/oauth2/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

export function rotaOAuth2Google(app: Elysia) {
  return app
    .get('/oauth2/start', ({ set }) => {
      if (!config.GOOGLE_OAUTH2_CLIENT_ID || !config.GOOGLE_OAUTH2_CLIENT_SECRET) {
        set.status = 500;
        return { erro: 'GOOGLE_OAUTH2_CLIENT_ID/SECRET não configurados' };
      }
      const client = new google.auth.OAuth2(
        config.GOOGLE_OAUTH2_CLIENT_ID,
        config.GOOGLE_OAUTH2_CLIENT_SECRET,
        REDIRECT_URI,
      );
      const url = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
      });
      set.redirect = url;
      return;
    })
    .get('/oauth2/callback', async ({ query, set }) => {
      const code = query.code as string | undefined;
      if (!code) {
        set.status = 400;
        return { erro: 'sem code' };
      }
      try {
        const client = new google.auth.OAuth2(
          config.GOOGLE_OAUTH2_CLIENT_ID,
          config.GOOGLE_OAUTH2_CLIENT_SECRET,
          REDIRECT_URI,
        );
        const { tokens } = await client.getToken(code);
        log.info({ has_refresh: !!tokens.refresh_token }, 'oauth2 callback ok');
        if (!tokens.refresh_token) {
          set.status = 500;
          return {
            erro: 'Google não retornou refresh_token. Possível causa: app já foi autorizado antes. Revogue acesso em https://myaccount.google.com/permissions e tente de novo.',
          };
        }
        set.headers['content-type'] = 'text/html; charset=utf-8';
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>OAuth2 OK</title><style>body{font-family:system-ui;max-width:600px;margin:50px auto;padding:20px}code{background:#eee;padding:8px;display:block;word-break:break-all;border-radius:4px;margin:10px 0}</style></head><body>
<h1>✅ Refresh token gerado</h1>
<p>Salve este token no Coolify (env <strong>GOOGLE_OAUTH2_REFRESH_TOKEN</strong>) e redeploy:</p>
<code>${tokens.refresh_token}</code>
<p><strong>Importante:</strong> não compartilhe esse token. Após salvá-lo, recarregue a página.</p>
</body></html>`;
      } catch (err) {
        log.error({ err }, 'oauth2 callback erro');
        set.status = 500;
        return { erro: err instanceof Error ? err.message : String(err) };
      }
    });
}
