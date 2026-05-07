import { Elysia } from 'elysia';
import { config } from './config.ts';
import { logger } from './lib/logger.ts';
import { rotaSaude } from './rotas/saude.ts';
import { rotaWebhookChatwoot } from './rotas/webhookChatwoot.ts';
import { rotaWebhookCalendly } from './rotas/webhookCalendly.ts';
import { rotaOAuth2Google } from './rotas/oauth2Google.ts';
import { rotaAdmin } from './rotas/admin.ts';
import { rotaDashboard } from './rotas/dashboard.ts';
import { iniciarBriefingScheduler } from './lib/briefingDiario.ts';

export function criarServidor() {
  const app = new Elysia()
    .use(rotaSaude)
    .use(rotaWebhookChatwoot)
    .use(rotaWebhookCalendly)
    .use(rotaOAuth2Google)
    .use(rotaAdmin)
    .use(rotaDashboard)
    .onError(({ error, code, request, path }) => {
      logger.error({ err: error, code, method: request.method, path, url: request.url }, 'erro não tratado no servidor');
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

  iniciarBriefingScheduler();

  return app;
}
