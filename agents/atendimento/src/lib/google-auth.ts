import { google, type Auth } from 'googleapis';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.ts';
import { createChildLogger } from './logger.ts';

const log = createChildLogger({ modulo: 'google-auth' });

export const SCOPES_CALENDAR = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// ---- OAuth2 user auth (Meet links + convites por email) ----

let _oauth2: Auth.OAuth2Client | null = null;

function getOAuth2Client(): Auth.OAuth2Client | null {
  if (!config.GOOGLE_OAUTH2_CLIENT_ID || !config.GOOGLE_OAUTH2_CLIENT_SECRET || !config.GOOGLE_OAUTH2_REFRESH_TOKEN) {
    return null;
  }
  if (_oauth2) return _oauth2;
  const client = new google.auth.OAuth2(config.GOOGLE_OAUTH2_CLIENT_ID, config.GOOGLE_OAUTH2_CLIENT_SECRET);
  client.setCredentials({ refresh_token: config.GOOGLE_OAUTH2_REFRESH_TOKEN });
  _oauth2 = client;
  log.info('google auth via OAuth2 user (Meet + email habilitado)');
  return _oauth2;
}

// ---- Service Account (fallback) ----

let _credenciais: Record<string, unknown> | null = null;

function carregarCredenciais(): Record<string, unknown> {
  if (_credenciais) return _credenciais;
  const caminho = resolve(config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
  log.info({ caminho }, 'carregando service account');
  const conteudo = readFileSync(caminho, 'utf-8');
  _credenciais = JSON.parse(conteudo) as Record<string, unknown>;
  return _credenciais;
}

export function getGoogleAuth(scopes: string[]): Auth.GoogleAuth | Auth.OAuth2Client {
  const oauth2 = getOAuth2Client();
  if (oauth2) return oauth2;
  const credentials = carregarCredenciais();
  return new google.auth.GoogleAuth({ credentials, scopes });
}
