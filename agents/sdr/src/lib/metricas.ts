/**
 * Cálculo de métricas do pipeline VETRIK pra dashboard e briefing diário.
 */
import { DateTime } from 'luxon';
import { config } from '../config.ts';
import { buscarFunilKanban, listarTarefasKanban } from './chatwoot.ts';
import { listarEventos } from './google-calendar.ts';
import { ETAPAS_FUNIL } from '../dominio/vetrik.ts';
import type { TarefaKanban, EtapaKanban } from '../tipos.ts';

export interface MetricasPipeline {
  total_leads: number;
  por_etapa: Array<{ id: number | string; nome: string; total: number; cor: string }>;
  novos_24h: number;
  novos_7d: number;
  parados_3d: number;
  parados_7d: number;
  reuniao_agendada_total: number;
  call_realizada_total: number;
  fechado_total: number;
  perdido_total: number;
  taxa_conversao_respondeu_para_reuniao: number;
  taxa_conversao_reuniao_para_fechado: number;
}

export interface MetricasAgenda {
  hoje: Array<{
    titulo: string;
    inicio: string;
    fim: string;
    inicio_formatado: string;
    link_meet?: string;
    descricao?: string;
  }>;
  proxima_sessao: {
    titulo: string;
    inicio: string;
    inicio_formatado: string;
    link_meet?: string;
  } | null;
  proximos_7d: number;
  semana_total: number;
}

export async function calcularMetricasPipeline(): Promise<MetricasPipeline> {
  const [funil, tarefas] = await Promise.all([
    buscarFunilKanban(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID),
    listarTarefasKanban(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID),
  ]);

  const agora = DateTime.now();
  const _24h = agora.minus({ hours: 24 });
  const _7d = agora.minus({ days: 7 });
  const _3d = agora.minus({ days: 3 });

  // Mapear por etapa
  const contagemPorEtapa = new Map<number | string, number>();
  let novos_24h = 0;
  let novos_7d = 0;
  let parados_3d = 0;
  let parados_7d = 0;

  for (const t of tarefas) {
    const stepId = t.board_step?.id ?? 'sem_etapa';
    contagemPorEtapa.set(stepId, (contagemPorEtapa.get(stepId) ?? 0) + 1);

    const created = (t as TarefaKanban & { created_at?: string }).created_at
      ? DateTime.fromISO((t as TarefaKanban & { created_at?: string }).created_at!)
      : null;
    const updated = (t as TarefaKanban & { updated_at?: string }).updated_at
      ? DateTime.fromISO((t as TarefaKanban & { updated_at?: string }).updated_at!)
      : null;

    if (created && created > _24h) novos_24h++;
    if (created && created > _7d) novos_7d++;

    // Parado = sem update há X dias e ainda em etapa ativa (não fechado/perdido)
    const stepIdNum = Number(t.board_step?.id ?? 0);
    const ehAtivo = stepIdNum !== ETAPAS_FUNIL.fechado.id &&
                    stepIdNum !== ETAPAS_FUNIL.perdido.id;
    if (updated && ehAtivo) {
      if (updated < _3d) parados_3d++;
      if (updated < _7d) parados_7d++;
    }
  }

  const steps = funil.steps ?? [];
  const por_etapa = steps.map((s: EtapaKanban) => ({
    id: s.id,
    nome: s.name,
    total: contagemPorEtapa.get(s.id) ?? 0,
    cor: s.color ?? '#999',
  }));

  const reuniao_agendada_total = contagemPorEtapa.get(ETAPAS_FUNIL.reuniaoAgendada.id) ?? 0;
  const call_realizada_total = contagemPorEtapa.get(ETAPAS_FUNIL.callRealizada.id) ?? 0;
  const fechado_total = contagemPorEtapa.get(ETAPAS_FUNIL.fechado.id) ?? 0;
  const perdido_total = contagemPorEtapa.get(ETAPAS_FUNIL.perdido.id) ?? 0;
  const respondeu_total = contagemPorEtapa.get(ETAPAS_FUNIL.respondeu.id) ?? 0;

  // Taxa de conversão simplificada (cumulative funnel)
  const totalAlcancado_reuniao = reuniao_agendada_total + call_realizada_total + fechado_total + perdido_total;
  const totalAlcancado_fechado = fechado_total;
  const totalCalls = call_realizada_total + fechado_total + perdido_total;

  const taxa_conversao_respondeu_para_reuniao = (respondeu_total + totalAlcancado_reuniao) > 0
    ? (totalAlcancado_reuniao / (respondeu_total + totalAlcancado_reuniao)) * 100
    : 0;
  const taxa_conversao_reuniao_para_fechado = totalCalls > 0
    ? (totalAlcancado_fechado / totalCalls) * 100
    : 0;

  return {
    total_leads: tarefas.length,
    por_etapa,
    novos_24h,
    novos_7d,
    parados_3d,
    parados_7d,
    reuniao_agendada_total,
    call_realizada_total,
    fechado_total,
    perdido_total,
    taxa_conversao_respondeu_para_reuniao: Math.round(taxa_conversao_respondeu_para_reuniao * 10) / 10,
    taxa_conversao_reuniao_para_fechado: Math.round(taxa_conversao_reuniao_para_fechado * 10) / 10,
  };
}

export interface AtividadeRecente {
  tipo: 'novo_lead' | 'agendamento' | 'movimento' | 'call';
  titulo: string;
  detalhe: string;
  quando: string;
  quando_relativo: string;
  cor_status: 'green' | 'blue' | 'yellow' | 'gray';
}

export interface SerieTemporal {
  labels: string[];   // dias últimos 14 dias formatados (ex: "5/Mai")
  novos_leads: number[];
  fechados: number[];
  agendamentos: number[];
}

export async function calcularAtividadeRecente(limite = 12): Promise<AtividadeRecente[]> {
  try {
    const tarefas = await listarTarefasKanban(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID);
    const agora = DateTime.now();

    const atividades: AtividadeRecente[] = [];
    for (const t of tarefas) {
      const created = (t as TarefaKanban & { created_at?: string }).created_at;
      const updated = (t as TarefaKanban & { updated_at?: string }).updated_at;
      const stepNome = t.board_step?.name ?? '';

      // Considera atividades das últimas 7 dias
      const dataRef = updated ?? created;
      if (!dataRef) continue;
      const dt = DateTime.fromISO(dataRef);
      if (agora.diff(dt, 'days').days > 7) continue;

      let tipo: AtividadeRecente['tipo'] = 'movimento';
      let cor: AtividadeRecente['cor_status'] = 'gray';
      let titulo = t.title ?? '(sem nome)';
      let detalhe = stepNome;

      if (created === updated) {
        tipo = 'novo_lead';
        cor = 'green';
        detalhe = 'Lead novo · ' + stepNome;
      } else if (stepNome === 'Reunião Agendada') {
        tipo = 'agendamento';
        cor = 'blue';
        detalhe = 'Sessão agendada';
      } else if (stepNome === 'Call Realizada') {
        tipo = 'call';
        cor = 'yellow';
        detalhe = 'Call realizada';
      } else {
        detalhe = `Movido pra ${stepNome}`;
      }

      atividades.push({
        tipo,
        titulo,
        detalhe,
        quando: dt.toISO()!,
        quando_relativo: formatarRelativo(dt, agora),
        cor_status: cor,
      });
    }

    atividades.sort((a, b) => b.quando.localeCompare(a.quando));
    return atividades.slice(0, limite);
  } catch {
    return [];
  }
}

function formatarRelativo(dt: DateTime, agora: DateTime): string {
  const diffMin = agora.diff(dt, 'minutes').minutes;
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${Math.round(diffMin)}min`;
  const diffH = agora.diff(dt, 'hours').hours;
  if (diffH < 24) return `${Math.round(diffH)}h`;
  const diffD = agora.diff(dt, 'days').days;
  if (diffD < 7) return `${Math.round(diffD)}d`;
  return dt.toFormat('d/MM');
}

export async function calcularSerieTemporal(): Promise<SerieTemporal> {
  try {
    const tarefas = await listarTarefasKanban(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID);
    const agora = DateTime.now().setZone('America/Sao_Paulo');
    const dias = 14;

    const labels: string[] = [];
    const novos: number[] = [];
    const fechados: number[] = [];
    const agendamentos: number[] = [];

    for (let i = dias - 1; i >= 0; i--) {
      const dia = agora.minus({ days: i });
      const inicio = dia.startOf('day');
      const fim = dia.endOf('day');
      labels.push(dia.toFormat('d/MM'));

      let cNovos = 0;
      let cFechados = 0;
      let cAgenda = 0;
      for (const t of tarefas) {
        const created = (t as TarefaKanban & { created_at?: string }).created_at;
        const updated = (t as TarefaKanban & { updated_at?: string }).updated_at;
        if (created) {
          const dt = DateTime.fromISO(created);
          if (dt >= inicio && dt <= fim) cNovos++;
        }
        const stepId = Number(t.board_step?.id ?? 0);
        if (updated) {
          const dt = DateTime.fromISO(updated);
          if (dt >= inicio && dt <= fim) {
            if (stepId === ETAPAS_FUNIL.fechado.id) cFechados++;
            else if (stepId === ETAPAS_FUNIL.reuniaoAgendada.id) cAgenda++;
          }
        }
      }
      novos.push(cNovos);
      fechados.push(cFechados);
      agendamentos.push(cAgenda);
    }

    return { labels, novos_leads: novos, fechados, agendamentos };
  } catch {
    return { labels: [], novos_leads: [], fechados: [], agendamentos: [] };
  }
}

export async function calcularMetricasAgenda(): Promise<MetricasAgenda> {
  const agora = DateTime.now().setZone('America/Sao_Paulo');
  const inicioHoje = agora.startOf('day');
  const fimHoje = agora.endOf('day');
  const fim7d = agora.plus({ days: 7 }).endOf('day');

  try {
    const [eventosHoje, eventosSemana] = await Promise.all([
      listarEventos({
        calendarId: 'primary',
        timeMin: inicioHoje.toISO()!,
        timeMax: fimHoje.toISO()!,
        maxResults: 50,
      }),
      listarEventos({
        calendarId: 'primary',
        timeMin: agora.toISO()!,
        timeMax: fim7d.toISO()!,
        maxResults: 100,
      }),
    ]);

    const hoje = eventosHoje.map((e) => {
      const ini = e.start?.dateTime ?? e.start?.date ?? '';
      const fim = e.end?.dateTime ?? e.end?.date ?? '';
      return {
        titulo: e.summary ?? '(sem título)',
        inicio: ini,
        fim,
        inicio_formatado: ini ? DateTime.fromISO(ini).setZone('America/Sao_Paulo').toFormat('HH:mm') : '',
        link_meet: e.hangoutLink ?? undefined,
        descricao: e.description ?? undefined,
      };
    });

    // Próxima sessão = primeiro evento futuro a partir de agora
    const eventoProx = eventosSemana
      .filter((e) => {
        const ini = e.start?.dateTime;
        return ini && DateTime.fromISO(ini) > agora;
      })
      .sort((a, b) => (a.start?.dateTime ?? '').localeCompare(b.start?.dateTime ?? ''))[0];

    let proxima_sessao: MetricasAgenda['proxima_sessao'] = null;
    if (eventoProx?.start?.dateTime) {
      const ini = eventoProx.start.dateTime;
      const dtIni = DateTime.fromISO(ini).setZone('America/Sao_Paulo');
      proxima_sessao = {
        titulo: eventoProx.summary ?? '(sem título)',
        inicio: ini,
        inicio_formatado: dtIni.toFormat("EEEE, HH:mm", { locale: 'pt-BR' }),
        link_meet: eventoProx.hangoutLink ?? undefined,
      };
    }

    return {
      hoje,
      proxima_sessao,
      proximos_7d: eventosSemana.length,
      semana_total: eventosSemana.length,
    };
  } catch {
    return { hoje: [], proxima_sessao: null, proximos_7d: 0, semana_total: 0 };
  }
}
