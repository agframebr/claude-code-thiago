/**
 * Briefing diário — disparo automático às 8h da manhã (BRT) pro Thiago.
 * Compila pipeline + agenda do dia + alertas e manda via WhatsApp.
 */
import { DateTime } from 'luxon';
import { config } from '../config.ts';
import { TELEFONE_THIAGO } from '../dominio/vetrik.ts';
import { calcularMetricasPipeline, calcularMetricasAgenda } from './metricas.ts';
import { buscarConversaPorTelefone, enviarMensagem } from './chatwoot.ts';
import { createChildLogger } from './logger.ts';

const log = createChildLogger({ modulo: 'briefingDiario' });

export async function gerarConteudoBriefing(): Promise<string> {
  const [pipeline, agenda] = await Promise.all([
    calcularMetricasPipeline(),
    calcularMetricasAgenda(),
  ]);

  const agora = DateTime.now().setZone('America/Sao_Paulo');
  const dataFmt = agora.toFormat("EEEE, d 'de' LLLL", { locale: 'pt-BR' });

  const linhas: string[] = [
    `☕ *Bom dia, Thiago!*`,
    `📅 ${dataFmt}`,
    ``,
  ];

  // Agenda de hoje
  if (agenda.hoje.length === 0) {
    linhas.push(`*Agenda de hoje*: livre — sem compromissos.`);
  } else {
    linhas.push(`*Agenda de hoje* (${agenda.hoje.length}):`);
    for (const ev of agenda.hoje) {
      linhas.push(`  • *${ev.inicio_formatado}* — ${ev.titulo}${ev.link_meet ? ` 🔗` : ''}`);
    }
  }
  linhas.push('');

  // Pipeline resumo
  linhas.push(`*Pipeline*:`);
  linhas.push(`  🟢 Novos 24h: ${pipeline.novos_24h} (semana: ${pipeline.novos_7d})`);
  linhas.push(`  🟡 Reuniões agendadas: ${pipeline.reuniao_agendada_total}`);
  linhas.push(`  🔵 Calls realizadas: ${pipeline.call_realizada_total}`);
  linhas.push(`  💚 Fechados: ${pipeline.fechado_total}`);
  linhas.push(`  📦 Total leads ativos: ${pipeline.total_leads}`);
  linhas.push('');

  // Alertas
  const alertas: string[] = [];
  if (pipeline.parados_7d > 0) {
    alertas.push(`🔴 ${pipeline.parados_7d} leads parados há +7 dias — follow-up urgente`);
  } else if (pipeline.parados_3d > 0) {
    alertas.push(`🟡 ${pipeline.parados_3d} leads parados há +3 dias — vale revisar`);
  }
  if (pipeline.taxa_conversao_respondeu_para_reuniao < 30 && pipeline.total_leads > 5) {
    alertas.push(`📉 Conversão Respondeu→Reunião baixa: ${pipeline.taxa_conversao_respondeu_para_reuniao}%`);
  }

  if (alertas.length > 0) {
    linhas.push(`*Alertas*:`);
    for (const a of alertas) linhas.push(`  ${a}`);
    linhas.push('');
  }

  // Próximos compromissos da semana
  if (agenda.proximos_7d > 0) {
    linhas.push(`📌 ${agenda.proximos_7d} compromissos esta semana`);
  }

  linhas.push('');
  linhas.push(`Fala comigo se precisar de algo.`);

  return linhas.join('\n');
}

export async function enviarBriefingDiarioPara(telefone: string): Promise<boolean> {
  try {
    const conteudo = await gerarConteudoBriefing();
    const conversa = await buscarConversaPorTelefone(config.CHATWOOT_ACCOUNT_ID, telefone);
    if (!conversa) {
      log.warn({ telefone }, 'sem conversa pra mandar briefing');
      return false;
    }
    await enviarMensagem(config.CHATWOOT_ACCOUNT_ID, conversa.id, { content: conteudo });
    log.info({ telefone, idConversa: conversa.id, len: conteudo.length }, 'briefing enviado');
    return true;
  } catch (err) {
    log.error({ err, telefone }, 'falha ao enviar briefing');
    return false;
  }
}

let _ultimaExecucao = '';

/**
 * Loop que verifica a cada minuto se é hora de mandar o briefing (8h BRT).
 * Garante que dispara só uma vez por dia mesmo se o servidor reiniciar.
 */
export function iniciarBriefingScheduler(): void {
  log.info('briefing scheduler iniciado — dispara às 08:00 BRT');

  setInterval(async () => {
    try {
      const agora = DateTime.now().setZone('America/Sao_Paulo');
      const dataHoje = agora.toFormat('yyyy-MM-dd');
      // Janela: 08:00 - 08:05 BRT
      if (agora.hour === 8 && agora.minute < 5 && _ultimaExecucao !== dataHoje) {
        _ultimaExecucao = dataHoje;
        log.info({ dataHoje }, 'disparando briefing diário');
        await enviarBriefingDiarioPara(TELEFONE_THIAGO);
      }
    } catch (err) {
      log.error({ err }, 'erro no scheduler');
    }
  }, 60_000);
}
