import { CallbackHandler } from 'langfuse-langchain';
import { config } from '../config.ts';
import { createChildLogger } from './logger.ts';

const log = createChildLogger({ modulo: 'langfuse' });

const ATIVO = !!(config.LANGFUSE_SECRET_KEY && config.LANGFUSE_PUBLIC_KEY);

if (!ATIVO) {
  log.warn('Langfuse desativado — LANGFUSE_SECRET_KEY ou LANGFUSE_PUBLIC_KEY ausente');
}

export interface OpcoesHandler {
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export function createLangfuseHandler(
  traceName: string,
  opts: OpcoesHandler = {},
): CallbackHandler | undefined {
  if (!ATIVO) return undefined;
  return new CallbackHandler({
    secretKey: config.LANGFUSE_SECRET_KEY!,
    publicKey: config.LANGFUSE_PUBLIC_KEY!,
    baseUrl: config.LANGFUSE_BASEURL,
    sessionId: opts.sessionId,
    userId: opts.userId,
    metadata: { ...opts.metadata, traceName },
    tags: opts.tags,
  });
}

export async function flushLangfuseHandler(h: CallbackHandler | undefined): Promise<void> {
  if (!h) return;
  try {
    await h.shutdownAsync();
  } catch (err) {
    log.warn({ err }, 'falha ao dar flush no handler langfuse');
  }
}

export const langfuseAtivo = ATIVO;
