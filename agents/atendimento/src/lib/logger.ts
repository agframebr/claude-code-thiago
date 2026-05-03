import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        }
      : undefined,
  redact: {
    paths: [
      'OPENAI_API_KEY',
      'CHATWOOT_API_TOKEN',
      'ELEVENLABS_API_KEY',
      'POSTGRES_PASSWORD',
      'LANGFUSE_SECRET_KEY',
      'GOOGLE_OAUTH2_CLIENT_SECRET',
      'N8N_API_KEY',
      '*.api_key',
      '*.apiKey',
      '*.access_token',
      '*.accessToken',
      '*.password',
      '*.secret',
      '*.token',
      'headers.authorization',
      'headers["xi-api-key"]',
    ],
    censor: '[REDACTED]',
  },
});

export function createChildLogger(ctx: Record<string, unknown>) {
  return logger.child(ctx);
}

export type Logger = typeof logger;
