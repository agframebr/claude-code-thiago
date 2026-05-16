import { type Elysia, t } from 'elysia';
import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config.ts';
import { createChildLogger } from '../lib/logger.ts';
import {
  buscarContatoPorEmail,
  buscarContatoPorTelefone,
  criarContato,
  criarConversa,
  enviarMensagem,
  moverTarefa,
  agendarMensagem,
  atualizarTarefa,
} from '../lib/chatwoot.ts';
import { normalizarTelefoneBR } from '../dominio/vetrik.ts';
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

  // Calendly v2: dados do evento em scheduled_event. Fallback pra event (caso seja objeto).
  const eventoObj = payload.scheduled_event
    ?? (typeof payload.event === 'object' ? payload.event : undefined);

  const horarioISO = eventoObj?.start_time ?? '';
  if (!horarioISO) {
    log.error({ email, payloadKeys: Object.keys(payload) }, 'webhook Calendly sem start_time — payload inesperado');
    return;
  }

  const horarioTZ = DateTime.fromISO(horarioISO).setZone('America/Sao_Paulo');
  const horarioFormatado = horarioTZ.toFormat("EEEE, d 'de' LLLL 'às' HH:mm", { locale: 'pt-BR' });

  // Link Meet que o Calendly já criou no Google Calendar
  const linkMeet = eventoObj?.location?.join_url ?? null;

  // Tenta extrair telefone das questions_and_answers do Calendly
  let telefoneLead: string | null = null;
  const qa = payload.questions_and_answers ?? [];
  for (const item of qa) {
    const q = (item.question ?? '').toLowerCase();
    if (q.includes('telefone') || q.includes('whatsapp') || q.includes('phone') || q.includes('celular') || q.includes('contato')) {
      const raw = item.answer?.trim();
      if (raw) {
        telefoneLead = normalizarTelefoneBR(raw);
        break;
      }
    }
  }
  if (!telefoneLead && payload.text_reminder_number) {
    telefoneLead = normalizarTelefoneBR(payload.text_reminder_number);
  }

  log.info({ email, horario: horarioISO, linkMeet, locationType: eventoObj?.location?.type, telefoneLead }, 'booking Calendly recebido');

  const idConta = config.CHATWOOT_ACCOUNT_ID;
  let contato = await buscarContatoPorEmail(idConta, email).catch(() => null);
  let idConversa = contato?.ultima_conversa_id ?? null;
  const idTarefa = contato?.tarefa_id ?? null;

  // Fallback 1: se não achou por email, tenta por telefone
  if (!contato && telefoneLead) {
    log.info({ telefoneLead }, 'tentando lookup por telefone');
    const contatoPorTel = await buscarContatoPorTelefone(idConta, telefoneLead);
    if (contatoPorTel) {
      // Reusa o tipo via re-busca pelo email do contato encontrado pra ter ultima_conversa_id
      contato = await buscarContatoPorEmail(idConta, contatoPorTel.email ?? '').catch(() => null);
      if (!contato && contatoPorTel.id) {
        // Pega conversas direto do contato encontrado
        contato = { id: contatoPorTel.id, telefone: contatoPorTel.phone_number ?? telefoneLead, ultima_conversa_id: null, tarefa_id: null };
      }
      idConversa = contato?.ultima_conversa_id ?? null;
    }
  }

  // Fallback 2: cria contato + conversa se temos telefone mas não achamos
  if (!contato && telefoneLead) {
    try {
      log.info({ telefoneLead, email }, 'criando contato Chatwoot a partir do telefone do Calendly');
      const novoContato = await criarContato(idConta, {
        nome,
        email,
        telefone: telefoneLead,
        idInbox: config.CHATWOOT_INBOX_ID,
      });
      const novaConversa = await criarConversa(
        idConta,
        novoContato.id,
        config.CHATWOOT_INBOX_ID,
      ).catch((err) => {
        log.warn({ err }, 'criarConversa falhou — pode ser que precise de uma mensagem inicial');
        return null;
      });
      contato = {
        id: novoContato.id,
        telefone: telefoneLead,
        ultima_conversa_id: novaConversa?.id ?? null,
        tarefa_id: null,
      };
      idConversa = contato.ultima_conversa_id;
      log.info({ idContato: contato.id, idConversa }, 'contato + conversa criados via Calendly');
    } catch (err) {
      log.error({ err, telefoneLead }, 'falha ao criar contato/conversa no Chatwoot');
    }
  }

  if (!contato) {
    log.warn({ email, nome }, 'contato não encontrado nem criado — notifica Thiago apenas');
  } else if (!idConversa) {
    log.warn({ email, idContato: contato.id }, 'contato sem conversa ativa — notifica Thiago mesmo assim');
  }

  // Confirmação para o lead (só se conversa existir)
  if (idConversa) {
    const linhasConfirmacao = [
      `✅ Sessão Estratégica confirmada!`,
      ``,
      `📅 *${horarioFormatado}* (horário de Brasília)`,
    ];
    if (linkMeet) linhasConfirmacao.push(``, `🔗 *Link da reunião*: ${linkMeet}`);
    linhasConfirmacao.push(``, `Um especialista da Vetrik vai entrar em contato com você no horário marcado. Qualquer dúvida antes disso, pode falar comigo aqui.`);

    try {
      await enviarMensagem(idConta, idConversa, { content: linhasConfirmacao.join('\n') });
      log.info({ idConversa, linkMeet: !!linkMeet }, 'confirmação enviada ao lead');
    } catch (err) {
      log.error({ err, idConversa }, 'falha ao enviar confirmação ao lead');
    }

    // Lembrete 1h antes
    const horarioLembrete = horarioTZ.minus({ minutes: 60 });
    if (horarioLembrete > DateTime.now()) {
      const linhasLembrete = [
        `⏰ Lembrete: sua Sessão Estratégica com a Vetrik começa em 1 hora!`,
        ``,
        `📅 ${horarioFormatado}`,
      ];
      if (linkMeet) linhasLembrete.push(`🔗 ${linkMeet}`);
      linhasLembrete.push(``, `Até já! 🚀`);

      try {
        await agendarMensagem(idConta, idConversa, linhasLembrete.join('\n'), horarioLembrete.toISO()!);
        log.info({ scheduled_at: horarioLembrete.toISO() }, 'lembrete 1h antes agendado');
      } catch (err) {
        log.error({ err }, 'falha ao agendar lembrete 1h antes');
      }
    }
  }

  // Move task para Reunião Agendada e salva dados do agendamento na descrição
  if (idTarefa) {
    const linhasDescricao = [
      `📅 Sessão Estratégica agendada`,
      `Data: ${horarioFormatado}`,
      `Quando: ${horarioISO}`,
      `Email: ${email}`,
    ];
    if (contato?.telefone) linhasDescricao.push(`Telefone: ${contato.telefone}`);
    if (linkMeet) linhasDescricao.push(`Meet: ${linkMeet}`);

    try {
      await atualizarTarefa(idConta, config.KANBAN_BOARD_ID, idTarefa, {
        board_step_id: ETAPAS_FUNIL.reuniaoAgendada.id,
        description: linhasDescricao.join('\n'),
      });
      log.info({ idTarefa }, 'task movida para Reunião Agendada');
    } catch (err) {
      log.error({ err, idTarefa }, 'falha ao mover task');
    }
  }

  // SEMPRE notifica Thiago (com infos completas), mesmo se contato/conversa não foi encontrado
  const linhasAlerta = [
    `📅 *Nova Sessão Estratégica agendada via Calendly*`,
    ``,
    `*Lead*: ${nome}`,
    `*Email*: ${email}`,
    contato?.telefone ? `*Telefone*: ${contato.telefone}` : '',
    `*Horário*: ${horarioFormatado}`,
    linkMeet ? `*Link Meet*: ${linkMeet}` : '',
    idTarefa ? `*Card Kanban*: #${idTarefa}` : '',
    !contato ? `\n⚠️ Lead não encontrado no Chatwoot pelo email — confirmação ainda NÃO foi enviada ao lead. Avise manualmente.` : '',
    contato && !idConversa ? `\n⚠️ Lead encontrado mas sem conversa ativa — confirmação NÃO enviada.` : '',
  ].filter(Boolean);

  try {
    await enviarMensagem(
      config.CHATWOOT_ALERT_ACCOUNT_ID,
      config.CHATWOOT_ALERT_CONVERSATION_ID,
      { content: linhasAlerta.join('\n') },
    );
    log.info({ contatoEncontrado: !!contato, conversaAtiva: !!idConversa }, 'Thiago notificado');
  } catch (err) {
    log.error({ err }, 'falha ao notificar Thiago');
  }
}

export function rotaWebhookCalendly(app: Elysia) {
  return app.post('/webhook/calendly', async ({ body, headers, set }) => {
    const rawBody = body as string;
    const headerAssinatura = (headers['calendly-webhook-signature'] as string) ?? '';

    if (!validarAssinatura(rawBody, headerAssinatura)) {
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
    log.info({ event: payload.event, payloadKeys: Object.keys(payload.payload ?? {}) }, 'webhook Calendly recebido');
    // Log debug do payload completo pra inspecionar estrutura (truncado)
    log.debug({ raw: rawBody.slice(0, 2000) }, 'webhook Calendly raw');

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
