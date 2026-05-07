import type { Elysia } from 'elysia';
import { createChildLogger } from '../lib/logger.ts';
import type { PayloadWebhook } from '../tipos.ts';

const log = createChildLogger({ rota: 'webhook-chatwoot' });

// Importados dinamicamente para evitar inicialização de grafos antes do servidor subir
let invocarGrafoPrincipal: ((p: PayloadWebhook) => Promise<void>) | null = null;
let invocarGrafoFollowUp: ((p: PayloadWebhook) => Promise<void>) | null = null;

async function garantirGrafos() {
  if (!invocarGrafoPrincipal) {
    const { invocarGrafoPrincipal: fn } = await import('../grafos/principal/grafo.ts');
    invocarGrafoPrincipal = fn;
  }
  if (!invocarGrafoFollowUp) {
    const { invocarGrafoFollowUp: fn } = await import('../grafos/follow-up/grafo.ts');
    invocarGrafoFollowUp = fn;
  }
}

async function processarEvento(payload: PayloadWebhook) {
  try {
    await garantirGrafos();
  } catch (err) {
    log.error({ err }, 'falha ao carregar grafos');
    return;
  }

  try {
    switch (payload.event) {
      case 'message_created':
        if (payload.message_type !== 'incoming') return;
        log.info({ idConversa: payload.conversation?.id, idMsg: payload.id }, 'message_created recebido');
        await invocarGrafoPrincipal!(payload);
        break;

      case 'kanban_task_overdue':
      case 'kanban_task_updated':
        log.info({ evento: payload.event, idTarefa: payload.task?.id ?? payload.kanban_task?.id ?? (payload as any).id }, 'kanban evento recebido');
        await invocarGrafoFollowUp!(payload);
        break;

      default:
        log.debug({ evento: payload.event }, 'evento ignorado');
    }
  } catch (err) {
    log.error({ err, evento: payload.event }, 'erro processando webhook');
  }
}

export function rotaWebhookChatwoot(app: Elysia) {
  return app.post('/webhook/chatwoot', ({ body, set }) => {
    const payload = body as PayloadWebhook;
    log.info({ evento: payload.event, idConversa: (payload as unknown as Record<string, unknown>).conversation_id ?? payload.conversation?.id }, 'webhook recebido');

    // Resposta imediata — Chatwoot tem timeout curto
    set.status = 200;
    setImmediate(() => {
      processarEvento(payload).catch((err) =>
        log.error({ err }, 'erro não capturado no processarEvento'),
      );
    });

    return { ok: true };
  });
}
