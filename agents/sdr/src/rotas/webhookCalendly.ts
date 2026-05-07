import { type Elysia, t } from 'elysia';
import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';
import { buscarContatoPorEmail, enviarMensagem, moverTarefa } from '../lib/chatwoot.ts';
import { agendarMensagem } from '../lib/chatwoot.ts';
import { DateTime } from 'luxon';
import type { PayloadCalendly } from '../tipos.ts';
import { ETAPAS_FUNIL } from '../dominio/vetrik.ts';

const log = createChildLogger({ rota: 'webhook-calendly' });

// Header format: "t=TIMESTAMP,v1=SIGNATURE"
function validarAssinatura(rawBody: string, headerAssinatura: string): boolean {
  try {
    const partes = Object.fromEntries(
      headerAssinatura.split(',').map((p) => p.split('=') as [string, string]),
    );
    const timestamp = partes['t'];
    const v1 = partes['v1'];
    if (!timestamp || !v1) return false;

    const hmac = createHmac('sha256', config.CALENDLY_WEBHOOK_SECRET);
    hmac.update(`${timestamp}.${rawBody}`);
    const esperado = hmac.digest('hex');
    return timingSafeEqual(Buffer.from(esperado, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    return false;
  }
}

async function processarBookingCriado(payload: PayloadCalendly['payload']) {
  const email = payload.email;
  const nome = payload.name;
  const horarioISO = payload.event.start_time;
  const horarioTZ = DateTime.fromISO(horarioISO).setZone('America/Sao_Paulo');
  const horarioFormatado = horarioTZ.toFormat("EEEE, d 'de' LLLL 'às' HH:mm", { locale: 'pt-BR' });

  log.info({ email, horario: horarioISO }, 'booking Calendly recebido');

  // Busca contato no Chatwoot pelo email
  const contato = await buscarContatoPorEmail(config.CHATWOOT_ACCOUNT_ID, email).catch(() => null);
  if (!contato) {
    log.warn({ email }, 'contato não encontrado no Chatwoot pelo email');
    return;
  }

  const idConta = config.CHATWOOT_ACCOUNT_ID;
  const idConversa = contato.ultima_conversa_id;
  const idTarefa = contato.tarefa_id;

  if (!idConversa) {
    log.warn({ email, idContato: contato.id }, 'contato sem conversa ativa');
    return;
  }

  // Confirmação para o lead
  const msgConfirmacao = `✅ Sessão Estratégica confirmada!

📅 *${horarioFormatado}* (horário de Brasília)

Um especialista da Vetrik vai entrar em contato com você no horário marcado. Qualquer dúvida antes disso, pode falar comigo aqui.`;

  await enviarMensagem(idConta, idConversa, { content: msgConfirmacao });

  // Lembrete 1h antes
  const horarioLembrete = horarioTZ.minus({ minutes: 60 });
  if (horarioLembrete > DateTime.now()) {
    const msgLembrete = `⏰ Lembrete: sua Sessão Estratégica com a Vetrik começa em 1 hora!

📅 ${horarioFormatado}

Até já! 🚀`;

    await agendarMensagem(idConta, idConversa, msgLembrete, horarioLembrete.toISO()!);
    log.info({ scheduled_at: horarioLembrete.toISO() }, 'lembrete agendado');
  }

  // Move task para Reunião Agendada
  if (idTarefa) {
    await moverTarefa(idConta, config.KANBAN_BOARD_ID, idTarefa, ETAPAS_FUNIL.reuniaoAgendada.id);
    log.info({ idTarefa }, 'task movida para Reunião Agendada');
  }

  // Notifica Thiago
  const alertaContent = `📅 Sessão Estratégica agendada via Calendly

*Lead*: ${nome} (${email})
*Horário*: ${horarioFormatado}`;

  await enviarMensagem(
    config.CHATWOOT_ALERT_ACCOUNT_ID,
    config.CHATWOOT_ALERT_CONVERSATION_ID,
    { content: alertaContent },
  );
}

export function rotaWebhookCalendly(app: Elysia) {
  return app.post('/webhook/calendly', async ({ body, headers, set }) => {
    // body chega como string bruta (type: 'text') para preservar o conteúdo exato para HMAC
    const rawBody = body as string;
    const headerAssinatura = (headers['calendly-webhook-signature'] as string) ?? '';

    if (config.CALENDLY_WEBHOOK_SECRET !== 'pendente' && !validarAssinatura(rawBody, headerAssinatura)) {
      log.warn({ headerAssinatura }, 'assinatura Calendly inválida');
      set.status = 401;
      return { erro: 'assinatura inválida' };
    }

    let payload: PayloadCalendly;
    try {
      payload = JSON.parse(rawBody) as PayloadCalendly;
    } catch {
      set.status = 400;
      return { erro: 'body inválido' };
    }
    log.info({ event: payload.event }, 'webhook Calendly recebido');

    set.status = 200;
    if (payload.event === 'invitee.created') {
      setImmediate(() => {
        processarBookingCriado(payload.payload).catch((err) =>
          log.error({ err }, 'erro processando booking Calendly'),
        );
      });
    }

    return { ok: true };
  }, { body: t.String() });
}
