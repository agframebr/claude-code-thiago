import { Elysia } from 'elysia';
import { config } from './config.ts';
import { logger } from './lib/logger.ts';
import { rotaSaude } from './rotas/saude.ts';
import { rotaWebhookChatwoot } from './rotas/webhookChatwoot.ts';
import { rotaWebhookCalendly } from './rotas/webhookCalendly.ts';

export function criarServidor() {
  const app = new Elysia()
    .use(rotaSaude)
    .use(rotaWebhookChatwoot)
    .use(rotaWebhookCalendly)
    .onError(({ error, code }) => {
      logger.error({ err: error, code }, 'erro não tratado no servidor');
      return { erro: 'Erro interno', code };
    });

  return app;
}

export async function iniciarServidor() {
  const app = criarServidor();

  app.listen({ port: config.PORT, hostname: config.HOST }, () => {
    logger.info(
      { host: config.HOST, port: config.PORT, webhookUrl: `${config.WEBHOOK_BASE_URL}/webhook/chatwoot` },
      'servidor iniciado',
    );
  });

  return app;
}
