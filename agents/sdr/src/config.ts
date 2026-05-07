import { z } from 'zod';

const numericString = z.coerce.number().int().positive();

const esquema = z.object({
  // Servidor
  PORT: numericString.default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
  PUBLIC_IP: z.string().optional(),
  WEBHOOK_BASE_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY obrigatório'),
  OPENAI_MODEL: z.string().default('claude-opus-4-7'),
  OPENAI_MODEL_FORMATTER: z.string().default('claude-sonnet-4-6'),

  // ElevenLabs
  ELEVENLABS_API_KEY: z.string().min(1, 'ELEVENLABS_API_KEY obrigatório'),
  ELEVENLABS_VOICE_ID: z.string().min(1, 'ELEVENLABS_VOICE_ID obrigatório'),

  // Chatwoot
  CHATWOOT_BASE_URL: z.string().url(),
  CHATWOOT_API_TOKEN: z.string().min(1),
  CHATWOOT_ACCOUNT_ID: numericString,
  CHATWOOT_INBOX_ID: numericString,
  CHATWOOT_ALERT_CONVERSATION_ID: numericString,
  CHATWOOT_ALERT_INBOX_ID: numericString,
  CHATWOOT_ALERT_ACCOUNT_ID: numericString,

  // Kanban — "Prospecção Ísys" (board ID 3)
  KANBAN_BOARD_ID: numericString.default(3),
  KANBAN_STEP_MAPEADO: numericString.default(20),
  KANBAN_STEP_ENTRAR_EM_CONTATO: numericString.default(21),
  KANBAN_STEP_CONTATO_FEITO: numericString.default(22),
  KANBAN_STEP_RESPONDEU: numericString.default(23),
  KANBAN_STEP_REUNIAO_AGENDADA: numericString.default(24),
  KANBAN_STEP_CALL_REALIZADA: numericString.default(25),
  KANBAN_STEP_PROPOSTA_ENVIADA: numericString.default(26),
  KANBAN_STEP_NEGOCIANDO: numericString.default(27),
  KANBAN_STEP_FECHADO: numericString.default(28),
  KANBAN_STEP_PERDIDO: numericString.default(29),

  // Calendly
  CALENDLY_LINK: z.string().url('CALENDLY_LINK deve ser uma URL válida'),
  CALENDLY_WEBHOOK_SECRET: z.string().min(1, 'CALENDLY_WEBHOOK_SECRET obrigatório'),

  // Escalação humana
  TELEFONE_THIAGO: z.string().default('+5562998311402'),
  TELEFONE_LETICIA: z.string().default('+5562999358918'),

  // PostgreSQL
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: numericString.default(5432),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),

  // Google
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: z.string().min(1),
  CALENDAR_ID_THIAGO_FIGUEREDO: z.string().min(1),
  GOOGLE_OAUTH2_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH2_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH2_REFRESH_TOKEN: z.string().optional(),

  // Langfuse (opcional — handler é no-op se ausente)
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_BASEURL: z.string().url().default('https://cloud.langfuse.com'),
});

export type Config = z.infer<typeof esquema>;

function carregar(): Config {
  const r = esquema.safeParse(process.env);
  if (!r.success) {
    const erros = r.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração inválida — variáveis de ambiente:\n${erros}`);
  }
  return r.data;
}

export const config = carregar();
