/**
 * Setup OAuth2 Google — obtém refresh token para habilitar Meet links e convites por email.
 *
 * Pré-requisito: adicionar http://localhost:3001 como redirect URI no Google Cloud Console
 *   → APIs & Services → Credentials → OAuth 2.0 Client IDs → editar o client_id
 *
 * Uso: bun run scripts/oauth2-google-setup.ts
 */
import { google } from 'googleapis';
import { createServer } from 'node:http';

const CLIENT_ID = process.env.GOOGLE_OAUTH2_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH2_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3001';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ GOOGLE_OAUTH2_CLIENT_ID e GOOGLE_OAUTH2_CLIENT_SECRET precisam estar no .env');
  process.exit(1);
}

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n🔐 CONFIGURAÇÃO OAUTH2 — GOOGLE CALENDAR\n');
console.log('Pré-requisito: no Google Cloud Console, adicione este redirect URI ao seu OAuth2 Client:');
console.log('  → http://localhost:3001\n');
console.log('1. Abra esta URL no navegador (login com a conta Google que tem o calendário):');
console.log('\n   ' + authUrl + '\n');
console.log('Aguardando autorização em http://localhost:3001 ...\n');

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://localhost:3001');
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>❌ Acesso negado. Feche esta aba e tente novamente.</h2>');
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html><body style="font-family:monospace;padding:20px">
        <h2>✅ Autorizado! Pode fechar esta aba.</h2>
        <p>Copie o refresh token abaixo e adicione ao seu <code>.env</code>.</p>
      </body></html>
    `);

    console.log('✅ Autorização concluída!\n');

    if (tokens.refresh_token) {
      console.log('Adicione ao .env:');
      console.log('──────────────────────────────────────────────────');
      console.log('GOOGLE_OAUTH2_REFRESH_TOKEN=' + tokens.refresh_token);
      console.log('──────────────────────────────────────────────────\n');
      console.log('Após salvar no .env, reinicie o agente. Meet links e convites por email ficarão ativos.\n');
    } else {
      console.log('⚠️  refresh_token não retornado (conta já autorizou antes).');
      console.log('   Revogue o acesso em https://myaccount.google.com/permissions');
      console.log('   e execute este script novamente.\n');
    }
  } catch (err) {
    console.error('❌ Erro ao trocar código por token:', err);
  } finally {
    server.close();
  }
}).listen(3001);
