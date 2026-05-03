import { google, type Auth } from 'googleapis';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.ts';
import { createChildLogger } from './logger.ts';

const log = createChildLogger({ modulo: 'google-auth' });

let _credenciais: Record<string, unknown> | null = null;

function carregarCredenciais(): Record<string, unknown> {
  if (_credenciais) return _credenciais;
  const caminho = resolve(config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
  log.info({ caminho }, 'carregando service account');
  const conteudo = readFileSync(caminho, 'utf-8');
  _credenciais = JSON.parse(conteudo) as Record<string, unknown>;
  return _credenciais;
}

export function getGoogleAuth(scopes: string[], impersonateEmail?: string): Auth.GoogleAuth {
  const credentials = carregarCredenciais();
  return new google.auth.GoogleAuth({
    credentials,
    scopes,
    clientOptions: impersonateEmail ? { subject: impersonateEmail } : undefined,
  });
}

export const SCOPES_CALENDAR = ['https://www.googleapis.com/auth/calendar'];
