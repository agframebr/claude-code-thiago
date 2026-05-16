import { type Elysia } from 'elysia';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.ts';
import {
  calcularMetricasPipeline,
  calcularMetricasAgenda,
  calcularAtividadeRecente,
  calcularSerieTemporal,
  listarLeadsDetalhado,
  listarAgendaCompleta,
} from '../lib/metricas.ts';
import { atualizarTarefa, buscarTarefa } from '../lib/chatwoot.ts';
import { deletarEvento } from '../lib/google-calendar.ts';
import { ETAPAS_FUNIL } from '../dominio/vetrik.ts';
import { createChildLogger } from '../lib/logger.ts';

const log = createChildLogger({ rota: 'dashboard' });
const TOKEN_ADMIN_BUF = Buffer.from(config.ADMIN_TOKEN, 'utf8');

function autorizar(token: string): boolean {
  const candidato = Buffer.from(token ?? '', 'utf8');
  if (candidato.length !== TOKEN_ADMIN_BUF.length) return false;
  return timingSafeEqual(candidato, TOKEN_ADMIN_BUF);
}

export function rotaDashboard(app: Elysia) {
  return app
    .get('/dashboard/api/stats', async ({ query, set }) => {
      if (!autorizar((query.token as string) ?? '')) { set.status = 401; return { erro: 'unauthorized' }; }
      try {
        const [pipeline, agenda, atividade, serie] = await Promise.all([
          calcularMetricasPipeline(),
          calcularMetricasAgenda(),
          calcularAtividadeRecente(10),
          calcularSerieTemporal(),
        ]);
        return { pipeline, agenda, atividade, serie, gerado_em: new Date().toISOString() };
      } catch (err) {
        log.error({ err }, 'falha ao calcular métricas');
        set.status = 500;
        return { erro: err instanceof Error ? err.message : 'erro' };
      }
    })
    .get('/dashboard/api/leads', async ({ query, set }) => {
      if (!autorizar((query.token as string) ?? '')) { set.status = 401; return { erro: 'unauthorized' }; }
      try {
        const leads = await listarLeadsDetalhado();
        return { leads, total: leads.length };
      } catch (err) {
        log.error({ err }, 'falha ao listar leads');
        set.status = 500;
        return { erro: err instanceof Error ? err.message : 'erro' };
      }
    })
    .get('/dashboard/api/agenda', async ({ query, set }) => {
      if (!autorizar((query.token as string) ?? '')) { set.status = 401; return { erro: 'unauthorized' }; }
      try {
        const dias = Number(query.dias ?? 7);
        const agenda = await listarAgendaCompleta(Math.min(30, Math.max(1, dias)));
        return agenda;
      } catch (err) {
        log.error({ err }, 'falha ao listar agenda');
        set.status = 500;
        return { erro: err instanceof Error ? err.message : 'erro' };
      }
    })
    .get('/dashboard/api/leads/:id', async ({ params, query, set }) => {
      if (!autorizar((query.token as string) ?? '')) { set.status = 401; return { erro: 'unauthorized' }; }
      try {
        const id = Number(params.id);
        const t = await buscarTarefa(config.CHATWOOT_ACCOUNT_ID, id);
        return t;
      } catch (err) {
        set.status = 500;
        return { erro: err instanceof Error ? err.message : 'erro' };
      }
    })
    .post('/dashboard/api/leads/:id/move', async ({ params, query, body, set }) => {
      if (!autorizar((query.token as string) ?? '')) { set.status = 401; return { erro: 'unauthorized' }; }
      try {
        const id = Number(params.id);
        const b = (body ?? {}) as { etapa_id?: number };
        if (!b.etapa_id) { set.status = 400; return { erro: 'etapa_id obrigatório' }; }
        await atualizarTarefa(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID, id, { board_step_id: b.etapa_id });
        return { ok: true };
      } catch (err) {
        set.status = 500;
        return { erro: err instanceof Error ? err.message : 'erro' };
      }
    })
    .post('/dashboard/api/leads/:id/perdido', async ({ params, query, set }) => {
      if (!autorizar((query.token as string) ?? '')) { set.status = 401; return { erro: 'unauthorized' }; }
      try {
        const id = Number(params.id);
        await atualizarTarefa(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID, id, { board_step_id: ETAPAS_FUNIL.perdido.id });
        return { ok: true };
      } catch (err) {
        set.status = 500;
        return { erro: err instanceof Error ? err.message : 'erro' };
      }
    })
    .post('/dashboard/api/eventos/:id/cancelar', async ({ params, query, set }) => {
      if (!autorizar((query.token as string) ?? '')) { set.status = 401; return { erro: 'unauthorized' }; }
      try {
        await deletarEvento('primary', params.id);
        return { ok: true };
      } catch (err) {
        set.status = 500;
        return { erro: err instanceof Error ? err.message : 'erro' };
      }
    })
    .get('/dashboard/api/config', async ({ query, set }) => {
      if (!autorizar((query.token as string) ?? '')) { set.status = 401; return { erro: 'unauthorized' }; }
      return {
        chatwoot: { base_url: config.CHATWOOT_BASE_URL, account_id: config.CHATWOOT_ACCOUNT_ID, inbox_id: config.CHATWOOT_INBOX_ID },
        kanban: { board_id: config.KANBAN_BOARD_ID, etapas: ETAPAS_FUNIL },
        calendly: { link: config.CALENDLY_LINK, secret_configurado: config.CALENDLY_WEBHOOK_SECRET.length >= 32 },
        google: { calendar_id: config.CALENDAR_ID_THIAGO_FIGUEREDO, oauth2_configurado: !!config.GOOGLE_OAUTH2_REFRESH_TOKEN },
        openai: { modelo: config.OPENAI_MODEL, modelo_formatter: config.OPENAI_MODEL_FORMATTER },
        elevenlabs: { voice_id: config.ELEVENLABS_VOICE_ID },
        gestores: { thiago: config.TELEFONE_THIAGO, leticia: config.TELEFONE_LETICIA },
      };
    })
    .get('/dashboard', ({ query, set }) => {
      if (!autorizar((query.token as string) ?? '')) {
        set.status = 401;
        set.headers['content-type'] = 'text/html; charset=utf-8';
        return `<!DOCTYPE html><html><head><title>Acesso negado</title><style>body{font-family:system-ui;text-align:center;padding:60px;background:#0a0a0a;color:#eee}</style></head><body><h1>🔒 Acesso negado</h1><p>Token inválido. Adicione <code>?token=...</code> na URL.</p></body></html>`;
      }
      set.headers['content-type'] = 'text/html; charset=utf-8';
      return DASHBOARD_HTML
        .replace(/\{\{TOKEN\}\}/g, query.token as string)
        .replace(/\{\{CHATWOOT_BASE_URL\}\}/g, config.CHATWOOT_BASE_URL)
        .replace(/\{\{CHATWOOT_ACCOUNT_ID\}\}/g, String(config.CHATWOOT_ACCOUNT_ID));
    });
}


const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vetrik · Ísys Dashboard</title>
<style>
  :root {
    --bg: #0a0a0a;
    --bg-2: #131313;
    --bg-3: #1a1a1a;
    --bg-4: #222;
    --border: #1f1f1f;
    --text: #f5f5f5;
    --text-2: #a0a0a0;
    --text-3: #6b6b6b;
    --accent: #3B82F6;
    --accent-strong: #2563EB;
    --accent-soft: #3B82F622;
    --green: #10b981;
    --yellow: #f59e0b;
    --red: #ef4444;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    font-size: 14px;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }

  .app { display: grid; grid-template-columns: 250px 1fr; min-height: 100vh; }
  .sidebar {
    background: var(--bg-2);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    padding: 20px 16px;
    position: sticky; top: 0; height: 100vh;
  }
  .main { padding: 22px 28px; overflow-x: auto; min-width: 0; }

  .brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px; margin-bottom: 18px; }
  .brand-logo {
    width: 34px; height: 34px;
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    border-radius: 8px;
    display: grid; place-items: center;
    color: white; font-weight: 800; font-size: 16px;
    box-shadow: 0 4px 14px var(--accent-soft);
  }
  .brand-name { font-weight: 700; font-size: 16px; letter-spacing: -0.3px; }

  .search {
    background: var(--bg-3); border: 1px solid var(--border); border-radius: 8px;
    padding: 10px 12px; color: var(--text-2); font-size: 13px;
    margin-bottom: 18px; display: flex; align-items: center; gap: 8px;
  }
  .search input { background: transparent; border: none; outline: none; color: var(--text); flex: 1; font-size: 13px; }
  .search kbd { background: var(--bg-4); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-family: inherit; color: var(--text-3); }

  .nav-section { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-3); padding: 14px 8px 6px; font-weight: 600; }
  .nav-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; margin: 2px 0;
    border-radius: 8px; color: var(--text-2);
    font-weight: 500; cursor: pointer;
    transition: all 0.15s; font-size: 13.5px;
    border: none; background: none; width: 100%; text-align: left;
  }
  .nav-item:hover { background: var(--bg-3); color: var(--text); }
  .nav-item.active { background: var(--accent-soft); color: var(--accent); }
  .nav-item .ico { width: 18px; height: 18px; flex-shrink: 0; opacity: 0.85; display: inline-block; }

  .upgrade-card {
    margin-top: auto;
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    padding: 16px; border-radius: 12px; color: white;
    box-shadow: 0 8px 24px var(--accent-soft);
  }
  .upgrade-card h4 { font-size: 13px; margin-bottom: 4px; }
  .upgrade-card p { font-size: 11px; opacity: 0.9; line-height: 1.4; margin-bottom: 10px; word-wrap: break-word; }
  .upgrade-card a { display: inline-block; background: rgba(255,255,255,0.2); padding: 5px 10px; border-radius: 6px; color: white; font-size: 11px; font-weight: 600; }

  /* Top bar */
  .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; flex-wrap: wrap; gap: 12px; }
  .crumbs { color: var(--text-3); font-size: 13px; }
  .crumbs strong { color: var(--text); font-weight: 600; }
  .topbar-right { display: flex; gap: 8px; align-items: center; }
  .icon-btn {
    width: 36px; height: 36px; border-radius: 8px;
    background: var(--bg-2); border: 1px solid var(--border);
    display: grid; place-items: center; color: var(--text-2);
    cursor: pointer; transition: all 0.15s; font-size: 14px;
  }
  .icon-btn:hover { background: var(--bg-3); color: var(--text); }
  .live-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 14px; font-size: 11px; font-weight: 600; background: #10b98122; color: var(--green); }
  .live-badge::before { content: '●'; animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% {opacity:1} 50% {opacity:0.4} }

  .section-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .section-head h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.4px; }
  .section-head p { color: var(--text-3); font-size: 13px; margin-top: 2px; }
  .filters { display: flex; gap: 8px; flex-wrap: wrap; }
  .filter-btn {
    padding: 7px 12px; background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text-2); font-size: 12px; cursor: pointer;
    transition: all 0.15s;
  }
  .filter-btn:hover { background: var(--bg-3); color: var(--text); }
  .filter-btn.active { background: var(--accent); color: white; border-color: var(--accent); }

  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
  .kpi-card {
    background: var(--bg-2); border: 1px solid var(--border); border-radius: 16px;
    padding: 18px 20px; position: relative; overflow: hidden;
  }
  .kpi-card.highlight {
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    border-color: transparent; box-shadow: 0 12px 32px var(--accent-soft);
  }
  .kpi-card.highlight .kpi-label, .kpi-card.highlight .kpi-extra { color: rgba(255,255,255,0.85); }
  .kpi-card.highlight .kpi-value { color: white; }
  .kpi-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; }
  .kpi-icon {
    width: 32px; height: 32px; border-radius: 8px; background: var(--bg-3);
    display: grid; place-items: center; font-size: 14px;
  }
  .kpi-card.highlight .kpi-icon { background: rgba(255,255,255,0.18); }
  .kpi-menu { color: var(--text-3); cursor: pointer; padding: 4px; }
  .kpi-label { font-size: 12px; color: var(--text-2); margin-bottom: 4px; font-weight: 500; }
  .kpi-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
  .kpi-card.highlight .kpi-title { color: white; }
  .kpi-value { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.1; }
  .kpi-badge { display: inline-block; background: rgba(255,255,255,0.22); padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-left: 6px; vertical-align: middle; }
  .kpi-extra { font-size: 12px; color: var(--text-3); margin-top: 8px; }
  .kpi-extra.green { color: var(--green); }
  .kpi-extra.red { color: var(--red); }

  .row-2 { display: grid; grid-template-columns: 1fr 1.5fr; gap: 14px; margin-bottom: 18px; }
  .panel {
    background: var(--bg-2); border: 1px solid var(--border); border-radius: 16px;
    padding: 18px 20px;
  }
  .panel-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .panel-title h3 { font-size: 16px; font-weight: 600; }
  .panel-title .meta { color: var(--text-3); font-size: 12px; }
  .panel-action { background: var(--accent); color: white; border: none; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; }
  .panel-action:hover { background: var(--accent-strong); }

  .stage-list { display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto; }
  .stage-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-radius: 10px; background: var(--bg-3);
    border-left: 3px solid var(--cor); cursor: pointer;
    transition: all 0.15s;
  }
  .stage-row:hover { background: var(--bg-4); }
  .stage-row .name { font-size: 13px; font-weight: 500; color: var(--text); }
  .stage-row .count { font-size: 18px; font-weight: 700; color: var(--text); }
  .stage-row.zero .count { color: var(--text-3); }

  .chart-area { height: 220px; position: relative; padding-top: 10px; }
  .chart-value { font-size: 28px; font-weight: 700; margin-bottom: 12px; }
  .chart-bars { display: flex; align-items: end; gap: 6px; height: 160px; padding-bottom: 28px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: end; gap: 4px; height: 100%; position: relative; }
  .bar { width: 100%; max-width: 24px; background: var(--bg-4); border-radius: 4px 4px 0 0; transition: all 0.2s; min-height: 2px; }
  .bar.active { background: linear-gradient(180deg, var(--accent), var(--accent-strong)); box-shadow: 0 0 12px var(--accent-soft); }
  .bar-label { font-size: 10px; color: var(--text-3); position: absolute; bottom: -22px; }

  /* Tabela genérica */
  .table { width: 100%; border-collapse: collapse; }
  .table th, .table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
  .table th { color: var(--text-3); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .table tr:hover td { background: var(--bg-3); }
  .table .right { text-align: right; }

  /* Badges */
  .badge { display: inline-block; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: var(--cor, var(--bg-4))22; color: var(--cor, var(--text-2)); border: 1px solid var(--cor, var(--border))44; }
  .badge.green { background: #10b98122; color: var(--green); }
  .badge.red { background: #ef444422; color: var(--red); }
  .badge.yellow { background: #f59e0b22; color: var(--yellow); }
  .badge.blue { background: var(--accent-soft); color: var(--accent); }

  /* Activity */
  .activity-row { display: grid; grid-template-columns: 30px 1fr auto auto; gap: 12px; align-items: center; padding: 10px 8px; border-bottom: 1px solid var(--border); font-size: 13px; }
  .activity-row:last-child { border-bottom: none; }
  .activity-dot { width: 8px; height: 8px; border-radius: 50%; margin: 0 auto; }
  .activity-dot.green { background: var(--green); box-shadow: 0 0 8px var(--green); }
  .activity-dot.blue { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
  .activity-dot.yellow { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); }
  .activity-dot.gray { background: var(--text-3); }
  .activity-name { font-weight: 500; color: var(--text); }
  .activity-detail { color: var(--text-2); font-size: 12px; }
  .activity-when { color: var(--text-3); font-size: 11px; font-variant-numeric: tabular-nums; }

  .empty-state { text-align: center; padding: 30px 16px; color: var(--text-3); font-size: 13px; }

  /* View switching */
  .view { display: none; }
  .view.active { display: block; }

  /* Pipeline view: lead row */
  .lead-row { display: grid; grid-template-columns: 1.5fr 130px 90px 90px auto; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--border); align-items: center; font-size: 13px; }
  .lead-row:hover { background: var(--bg-3); }
  .lead-name { font-weight: 600; color: var(--text); }
  .lead-meta { font-size: 11px; color: var(--text-3); margin-top: 2px; }
  .lead-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: end; }
  .lead-action { padding: 5px 10px; font-size: 11px; border-radius: 6px; background: var(--bg-3); color: var(--text-2); border: 1px solid var(--border); cursor: pointer; transition: all 0.15s; }
  .lead-action:hover { background: var(--bg-4); color: var(--text); }
  .lead-action.danger:hover { background: #ef444422; color: var(--red); border-color: var(--red); }
  .lead-action.primary { background: var(--accent); color: white; border-color: var(--accent); }
  .lead-action.primary:hover { background: var(--accent-strong); }

  /* Dropdown menu */
  .dropdown { position: relative; display: inline-block; }
  .dropdown-menu {
    display: none; position: absolute; right: 0; top: calc(100% + 4px);
    background: var(--bg-2); border: 1px solid var(--border); border-radius: 8px;
    min-width: 180px; padding: 4px; z-index: 100;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .dropdown-menu.open { display: flex; flex-direction: column; }
  .dropdown-item {
    background: none; border: none; color: var(--text-2); text-align: left;
    padding: 8px 12px; cursor: pointer; font-size: 13px; border-radius: 6px;
    transition: all 0.1s;
  }
  .dropdown-item:hover { background: var(--bg-3); color: var(--text); }

  /* Search input */
  .search-input {
    width: 100%; padding: 10px 14px; background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 10px; color: var(--text); font-size: 13px; outline: none;
  }
  .search-input:focus { border-color: var(--accent); }

  /* Agenda day group */
  .day-group { margin-bottom: 20px; }
  .day-header { font-size: 13px; color: var(--text-2); font-weight: 600; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); text-transform: capitalize; }
  .event-card {
    display: grid; grid-template-columns: 80px 1fr auto; gap: 14px;
    padding: 12px 14px; background: var(--bg-3); border-radius: 10px;
    margin-bottom: 8px; align-items: center;
  }
  .event-time { font-size: 18px; font-weight: 700; }
  .event-time .min { font-size: 11px; color: var(--text-3); display: block; font-weight: 500; }
  .event-title { font-weight: 600; }
  .event-meta { font-size: 11px; color: var(--text-3); margin-top: 2px; }
  .event-actions { display: flex; gap: 6px; }

  /* Config view */
  .config-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .config-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  .config-card h4 { font-size: 13px; margin-bottom: 10px; color: var(--text); }
  .config-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; border-bottom: 1px solid var(--border); }
  .config-row:last-child { border: none; }
  .config-row .key { color: var(--text-3); }
  .config-row .val { color: var(--text); font-family: monospace; font-size: 11px; }

  @media (max-width: 900px) {
    .app { grid-template-columns: 1fr; }
    .sidebar { position: static; height: auto; }
    .kpi-grid { grid-template-columns: 1fr; }
    .row-2 { grid-template-columns: 1fr; }
    .config-grid { grid-template-columns: 1fr; }
    .lead-row { grid-template-columns: 1fr; gap: 6px; }
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--bg-4); border-radius: 3px; }
</style>
</head>
<body>
<div class="app">

  <aside class="sidebar">
    <div class="brand">
      <div class="brand-logo">V</div>
      <div class="brand-name">Vetrik</div>
    </div>

    <div class="search">
      <span>🔍</span>
      <input id="global_search" placeholder="Buscar lead..." />
    </div>

    <button class="nav-item active" data-view="dashboard"><span class="ico">▦</span> Dashboard</button>
    <button class="nav-item" data-view="pipeline"><span class="ico">📊</span> Pipeline</button>
    <button class="nav-item" data-view="agenda"><span class="ico">📅</span> Agenda</button>
    <button class="nav-item" data-view="leads"><span class="ico">👥</span> Leads</button>

    <div class="nav-section">Operação</div>
    <button class="nav-item" data-view="follow-ups"><span class="ico">🔁</span> Follow-ups</button>
    <button class="nav-item" data-view="relatorios"><span class="ico">📈</span> Relatórios</button>
    <button class="nav-item" data-view="config"><span class="ico">⚙️</span> Configurações</button>

    <div class="upgrade-card" id="proxima_sessao_card">
      <h4>📌 Próxima sessão</h4>
      <p id="proxima_sessao_info">Carregando...</p>
      <a id="proxima_sessao_link" href="#" target="_blank" style="display:none">Abrir Meet →</a>
    </div>
  </aside>

  <main class="main">
    <div class="topbar">
      <div class="crumbs">Vetrik · <strong id="crumb_view">Dashboard</strong></div>
      <div class="topbar-right">
        <span class="live-badge" id="status">ao vivo</span>
        <a class="icon-btn" href="{{CHATWOOT_BASE_URL}}" target="_blank" title="Abrir Chatwoot">💬</a>
        <button class="icon-btn" title="Atualizar" onclick="recarregarAtual()">↻</button>
      </div>
    </div>

    <!-- ============ DASHBOARD VIEW ============ -->
    <section class="view active" id="view-dashboard">
      <div class="section-head">
        <div>
          <h2>Visão geral</h2>
          <p>Resumo do funil de prospecção e operação</p>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card highlight">
          <div class="kpi-head"><div class="kpi-icon">📅</div><div class="kpi-menu">⋯</div></div>
          <div class="kpi-title">Reuniões Agendadas</div>
          <div class="kpi-value">
            <span id="reuniao_agendada">—</span>
            <span class="kpi-badge" id="novos_24h_badge">+0</span>
          </div>
          <div class="kpi-extra">Sessões marcadas no pipeline</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-head"><div class="kpi-icon">🎯</div><div class="kpi-menu">⋯</div></div>
          <div class="kpi-title">Calls Realizadas</div>
          <div class="kpi-value" id="call_realizada">—</div>
          <div class="kpi-extra">Sessões já executadas</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-head"><div class="kpi-icon">💚</div><div class="kpi-menu">⋯</div></div>
          <div class="kpi-title">Fechados</div>
          <div class="kpi-value" id="fechado">—</div>
          <div class="kpi-extra green" id="conv_fechado_extra">—</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Total Leads</div><div class="kpi-value" id="total_leads">—</div></div>
        <div class="kpi-card"><div class="kpi-label">Novos 7 dias</div><div class="kpi-value" id="novos_7d">—</div></div>
        <div class="kpi-card"><div class="kpi-label">Parados +7d</div><div class="kpi-value" id="parados_7d" style="color:var(--red)">—</div><div class="kpi-extra">leads sem ação</div></div>
      </div>

      <div class="row-2">
        <div class="panel">
          <div class="panel-title"><h3>Pipeline por etapa</h3><span class="meta" id="total_etapas">—</span></div>
          <div class="stage-list" id="stage_list"></div>
        </div>
        <div class="panel">
          <div class="panel-title"><h3>Conversão · 14 dias</h3><button class="panel-action" onclick="navegarPara('relatorios')">Detalhes →</button></div>
          <div class="chart-area">
            <div class="chart-value" id="chart_total">—</div>
            <div class="chart-bars" id="chart_bars"></div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title"><h3>Atividade recente</h3><span class="meta">últimas 7 dias</span></div>
        <div id="atividade_lista"></div>
      </div>
    </section>

    <!-- ============ PIPELINE VIEW ============ -->
    <section class="view" id="view-pipeline">
      <div class="section-head">
        <div>
          <h2>Pipeline</h2>
          <p>Todos os leads agrupados por etapa</p>
        </div>
        <div class="filters" id="pipeline_filters"></div>
      </div>
      <div class="panel" style="padding:0">
        <div id="pipeline_list"></div>
      </div>
    </section>

    <!-- ============ AGENDA VIEW ============ -->
    <section class="view" id="view-agenda">
      <div class="section-head">
        <div>
          <h2>Agenda</h2>
          <p>Próximos compromissos</p>
        </div>
        <div class="filters">
          <button class="filter-btn active" data-dias="7">7 dias</button>
          <button class="filter-btn" data-dias="14">14 dias</button>
          <button class="filter-btn" data-dias="30">30 dias</button>
        </div>
      </div>
      <div id="agenda_view_content"></div>
    </section>

    <!-- ============ LEADS VIEW ============ -->
    <section class="view" id="view-leads">
      <div class="section-head">
        <div>
          <h2>Leads</h2>
          <p>Lista completa com busca</p>
        </div>
      </div>
      <input class="search-input" id="leads_search" placeholder="Buscar por nome, email ou telefone..." style="margin-bottom: 14px" />
      <div class="panel" style="padding:0">
        <div id="leads_list"></div>
      </div>
    </section>

    <!-- ============ FOLLOW-UPS VIEW ============ -->
    <section class="view" id="view-follow-ups">
      <div class="section-head">
        <div>
          <h2>Follow-ups</h2>
          <p>Leads com due_date vencido ou próximo</p>
        </div>
      </div>
      <div class="panel">
        <div id="followups_list"></div>
      </div>
    </section>

    <!-- ============ RELATÓRIOS VIEW ============ -->
    <section class="view" id="view-relatorios">
      <div class="section-head">
        <div>
          <h2>Relatórios</h2>
          <p>Análise consolidada e exportações</p>
        </div>
      </div>
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Conversão Respondeu→Reunião</div><div class="kpi-value" id="rep_conv_reuniao">—</div></div>
        <div class="kpi-card"><div class="kpi-label">Conversão Reunião→Fechado</div><div class="kpi-value" id="rep_conv_fechado">—</div></div>
        <div class="kpi-card"><div class="kpi-label">Total perdidos</div><div class="kpi-value" id="rep_perdidos">—</div></div>
      </div>
      <div class="row-2" style="grid-template-columns: 1fr;">
        <div class="panel">
          <div class="panel-title">
            <h3>Exportar dados</h3>
            <button class="panel-action" onclick="baixarCsv()">⬇ Baixar CSV de leads</button>
          </div>
          <p style="color:var(--text-2); font-size:13px; padding: 8px 0;">
            Exporta a lista completa de leads com etapa, contato, data de criação e última atualização.
          </p>
        </div>
      </div>
    </section>

    <!-- ============ CONFIG VIEW ============ -->
    <section class="view" id="view-config">
      <div class="section-head">
        <div>
          <h2>Configurações</h2>
          <p>Status das integrações e variáveis do sistema</p>
        </div>
      </div>
      <div class="config-grid" id="config_grid"></div>
    </section>

  </main>
</div>

<script>
const TOKEN = '{{TOKEN}}';
const CHATWOOT_BASE = '{{CHATWOOT_BASE_URL}}';
const ACCOUNT_ID = '{{CHATWOOT_ACCOUNT_ID}}';

const state = {
  view: 'dashboard',
  stats: null,
  leads: null,
  agenda: null,
  agendaDias: 7,
  pipelineFiltro: null,
  buscaLead: '',
};

// ========== Navegação ==========
document.querySelectorAll('.nav-item').forEach(b => {
  b.addEventListener('click', () => navegarPara(b.dataset.view));
});

window.addEventListener('hashchange', () => {
  const v = (location.hash || '#dashboard').replace('#', '');
  navegarPara(v, false);
});

function navegarPara(view, atualizarHash = true) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');
  if (atualizarHash) location.hash = view;
  document.getElementById('crumb_view').textContent = ({
    dashboard: 'Dashboard', pipeline: 'Pipeline', agenda: 'Agenda', leads: 'Leads',
    'follow-ups': 'Follow-ups', relatorios: 'Relatórios', config: 'Configurações'
  })[view] || view;
  carregarPorView(view);
}

async function carregarPorView(view) {
  if (view === 'dashboard') return carregarStats();
  if (view === 'pipeline' || view === 'leads' || view === 'follow-ups' || view === 'relatorios') return carregarLeads();
  if (view === 'agenda') return carregarAgenda();
  if (view === 'config') return carregarConfig();
}

function recarregarAtual() {
  carregarPorView(state.view);
  if (state.view !== 'dashboard') carregarStats();  // mantém sidebar/topo atualizado
}

function setStatus(s) {
  const el = document.getElementById('status');
  el.textContent = s.txt;
  el.style.background = s.bg;
  el.style.color = s.color;
}

// ========== Dashboard ==========
async function carregarStats() {
  setStatus({ txt: 'carregando', bg: '#f59e0b22', color: '#f59e0b' });
  try {
    const r = await fetch('/dashboard/api/stats?token=' + encodeURIComponent(TOKEN));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    state.stats = d;
    aplicarStats(d);
    setStatus({ txt: 'ao vivo', bg: '#10b98122', color: 'var(--green)' });
  } catch (e) {
    setStatus({ txt: 'erro', bg: '#ef444422', color: 'var(--red)' });
  }
}

function aplicarStats(d) {
  const p = d.pipeline; const a = d.agenda; const at = d.atividade ?? []; const s = d.serie ?? { labels: [], novos_leads: [] };

  document.getElementById('reuniao_agendada').textContent = p.reuniao_agendada_total;
  document.getElementById('novos_24h_badge').textContent = '+' + p.novos_24h + ' 24h';
  document.getElementById('call_realizada').textContent = p.call_realizada_total;
  document.getElementById('fechado').textContent = p.fechado_total;
  document.getElementById('conv_fechado_extra').textContent = p.taxa_conversao_reuniao_para_fechado + '% conv. reunião → fechado';
  document.getElementById('total_leads').textContent = p.total_leads;
  document.getElementById('novos_7d').textContent = p.novos_7d;
  document.getElementById('parados_7d').textContent = p.parados_7d;

  // Sidebar próxima sessão
  const ps = a.proxima_sessao;
  if (ps) {
    document.getElementById('proxima_sessao_info').textContent = ps.titulo + ' · ' + ps.inicio_formatado;
    if (ps.link_meet) {
      const l = document.getElementById('proxima_sessao_link');
      l.href = ps.link_meet; l.style.display = 'inline-block';
    }
  } else {
    document.getElementById('proxima_sessao_info').textContent = 'Sem sessão agendada.';
  }

  // Pipeline lista
  document.getElementById('stage_list').innerHTML = p.por_etapa.map(s =>
    '<div class="stage-row ' + (s.total === 0 ? 'zero' : '') + '" style="--cor:' + s.cor + '" onclick="navegarPara(\\'pipeline\\'); state.pipelineFiltro=' + s.id + '; carregarLeads()">'
    + '<span class="name">' + escape(s.nome) + '</span><span class="count">' + s.total + '</span></div>'
  ).join('');
  document.getElementById('total_etapas').textContent = p.total_leads + ' leads';

  // Chart
  const dadosBar = s.novos_leads ?? [];
  const max = Math.max(1, ...dadosBar);
  const idxAtivo = dadosBar.length - 1;
  document.getElementById('chart_bars').innerHTML = dadosBar.map((v, i) => {
    const altura = Math.max(2, (v / max) * 100);
    return '<div class="bar-col"><div class="bar ' + (i === idxAtivo ? 'active' : '') + '" style="height:' + altura + '%"></div>'
      + (i % 2 === 0 ? '<div class="bar-label">' + (s.labels[i] ?? '') + '</div>' : '') + '</div>';
  }).join('');
  document.getElementById('chart_total').innerHTML = dadosBar.reduce((a, v) => a + v, 0) + ' <span style="font-size:14px;color:var(--text-3);font-weight:500">leads novos</span>';

  // Atividade
  const ativ = document.getElementById('atividade_lista');
  if (at.length === 0) ativ.innerHTML = '<div class="empty-state">Sem atividade nas últimas 7 dias.</div>';
  else ativ.innerHTML = at.map(item =>
    '<div class="activity-row"><div><div class="activity-dot ' + item.cor_status + '"></div></div>'
    + '<div><div class="activity-name">' + escape(item.titulo) + '</div><div class="activity-detail">' + escape(item.detalhe) + '</div></div>'
    + '<div class="activity-when">' + item.quando_relativo + '</div><div></div></div>'
  ).join('');

  // Relatórios
  document.getElementById('rep_conv_reuniao').textContent = p.taxa_conversao_respondeu_para_reuniao + '%';
  document.getElementById('rep_conv_fechado').textContent = p.taxa_conversao_reuniao_para_fechado + '%';
  document.getElementById('rep_perdidos').textContent = p.perdido_total;
}

// ========== Leads ==========
async function carregarLeads() {
  if (!state.stats) await carregarStats();
  if (!state.leads) {
    setStatus({ txt: 'carregando', bg: '#f59e0b22', color: '#f59e0b' });
    try {
      const r = await fetch('/dashboard/api/leads?token=' + encodeURIComponent(TOKEN));
      const d = await r.json();
      state.leads = d.leads ?? [];
      setStatus({ txt: 'ao vivo', bg: '#10b98122', color: 'var(--green)' });
    } catch (e) {
      setStatus({ txt: 'erro', bg: '#ef444422', color: 'var(--red)' });
      return;
    }
  }
  renderPipeline();
  renderLeadsCompleto();
  renderFollowUps();
}

function renderPipeline() {
  if (!state.stats || !state.leads) return;
  const filtros = document.getElementById('pipeline_filters');
  filtros.innerHTML = '<button class="filter-btn ' + (state.pipelineFiltro === null ? 'active' : '') + '" onclick="state.pipelineFiltro=null; renderPipeline()">Todas</button>'
    + state.stats.pipeline.por_etapa.map(s =>
      '<button class="filter-btn ' + (state.pipelineFiltro === s.id ? 'active' : '') + '" onclick="state.pipelineFiltro=' + s.id + '; renderPipeline()">'
      + escape(s.nome) + ' (' + s.total + ')</button>'
    ).join('');

  const lista = document.getElementById('pipeline_list');
  let leads = state.leads;
  if (state.pipelineFiltro !== null) leads = leads.filter(l => String(l.etapa_id) === String(state.pipelineFiltro));

  if (leads.length === 0) {
    lista.innerHTML = '<div class="empty-state">Nenhum lead nesta etapa.</div>';
    return;
  }
  lista.innerHTML = leads.slice(0, 200).map(l => leadRowHtml(l)).join('');
}

function renderLeadsCompleto() {
  const lista = document.getElementById('leads_list');
  if (!state.leads) { lista.innerHTML = '<div class="empty-state">Carregando...</div>'; return; }
  const q = (state.buscaLead || '').toLowerCase().trim();
  let leads = state.leads;
  if (q) {
    leads = leads.filter(l =>
      (l.titulo || '').toLowerCase().includes(q)
      || (l.email || '').toLowerCase().includes(q)
      || (l.telefone || '').includes(q)
      || (l.descricao || '').toLowerCase().includes(q)
    );
  }
  if (leads.length === 0) {
    lista.innerHTML = '<div class="empty-state">Nenhum lead encontrado.</div>';
    return;
  }
  lista.innerHTML = leads.slice(0, 300).map(l => leadRowHtml(l)).join('');
}

function renderFollowUps() {
  const lista = document.getElementById('followups_list');
  if (!state.leads) return;
  const agora = new Date();
  const followups = state.leads.filter(l => {
    if (!l.due_date) return false;
    const dt = new Date(l.due_date);
    return dt < agora || (dt.getTime() - agora.getTime() < 24 * 60 * 60 * 1000);
  }).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

  if (followups.length === 0) {
    lista.innerHTML = '<div class="empty-state">Sem follow-ups pendentes. ✨</div>';
    return;
  }
  lista.innerHTML = followups.map(l => leadRowHtml(l, true)).join('');
}

function leadRowHtml(l, mostrarDue = false) {
  const corBadge = l.etapa_cor;
  const conv = (l.conversation_ids && l.conversation_ids[0]) ? l.conversation_ids[0] : null;
  const linkChat = conv ? CHATWOOT_BASE + '/app/accounts/' + ACCOUNT_ID + '/conversations/' + conv : null;
  const dueInfo = mostrarDue && l.due_date ? '<span class="badge ' + (new Date(l.due_date) < new Date() ? 'red' : 'yellow') + '">due: ' + new Date(l.due_date).toLocaleString('pt-BR') + '</span>' : '';
  const parado = l.dias_na_etapa > 7 ? '<span class="badge red">' + l.dias_na_etapa + 'd parado</span>'
    : l.dias_na_etapa > 3 ? '<span class="badge yellow">' + l.dias_na_etapa + 'd parado</span>' : '';
  const etapas = state.stats?.pipeline?.por_etapa ?? [];
  const opcoesMover = etapas.filter(e => String(e.id) !== String(l.etapa_id))
    .map(e => '<button class="dropdown-item" onclick="moverLead(' + l.id + ',' + e.id + ',\\''+ escape(e.nome) +'\\')">' + escape(e.nome) + '</button>')
    .join('');
  return '<div class="lead-row">'
    + '<div><div class="lead-name">' + escape(l.titulo) + '</div>'
    +   '<div class="lead-meta">' + escape(l.email || l.telefone || '') + ' · ' + l.ultima_atividade_relativa + ' atrás ' + parado + ' ' + dueInfo + '</div></div>'
    + '<div><span class="badge" style="--cor:' + corBadge + '">' + escape(l.etapa_nome) + '</span></div>'
    + '<div style="font-size:11px; color:var(--text-3)">' + l.dias_na_etapa + 'd na etapa</div>'
    + '<div style="font-size:11px; color:var(--text-3)">criado ' + l.dias_desde_criacao + 'd</div>'
    + '<div class="lead-actions">'
    +   (linkChat ? '<a class="lead-action primary" href="' + linkChat + '" target="_blank">Chat</a>' : '')
    +   '<div class="dropdown"><button class="lead-action" onclick="toggleDropdown(this)">Mover ▾</button>'
    +     '<div class="dropdown-menu">' + opcoesMover + '</div>'
    +   '</div>'
    + '</div>'
    + '</div>';
}

function toggleDropdown(btn) {
  // Fecha outros
  document.querySelectorAll('.dropdown-menu.open').forEach(m => { if (m !== btn.nextElementSibling) m.classList.remove('open'); });
  const menu = btn.nextElementSibling;
  if (menu) menu.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  }
});

async function moverLead(idTarefa, etapaId, nomeEtapa) {
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  if (!confirm('Mover lead pra "' + nomeEtapa + '"?')) return;
  try {
    const r = await fetch('/dashboard/api/leads/' + idTarefa + '/move?token=' + encodeURIComponent(TOKEN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etapa_id: etapaId }),
    });
    if (r.ok) { state.leads = null; state.stats = null; await carregarStats(); carregarLeads(); }
    else alert('Erro: ' + r.status);
  } catch (e) { alert('Erro: ' + e.message); }
}

// ========== Agenda ==========
document.querySelectorAll('[data-dias]').forEach(b => {
  b.addEventListener('click', () => {
    state.agendaDias = Number(b.dataset.dias);
    document.querySelectorAll('[data-dias]').forEach(x => x.classList.toggle('active', x === b));
    state.agenda = null;
    carregarAgenda();
  });
});

async function carregarAgenda() {
  if (state.agenda) { renderAgenda(); return; }
  setStatus({ txt: 'carregando', bg: '#f59e0b22', color: '#f59e0b' });
  try {
    const r = await fetch('/dashboard/api/agenda?dias=' + state.agendaDias + '&token=' + encodeURIComponent(TOKEN));
    state.agenda = await r.json();
    setStatus({ txt: 'ao vivo', bg: '#10b98122', color: 'var(--green)' });
    renderAgenda();
  } catch (e) {
    setStatus({ txt: 'erro', bg: '#ef444422', color: 'var(--red)' });
  }
}

function renderAgenda() {
  const cont = document.getElementById('agenda_view_content');
  const a = state.agenda || { por_dia: [], total: 0 };
  if (a.por_dia.length === 0) {
    cont.innerHTML = '<div class="panel"><div class="empty-state">Sem compromissos no período.</div></div>';
    return;
  }
  cont.innerHTML = a.por_dia.map(dia =>
    '<div class="day-group"><div class="day-header">' + escape(dia.data_formatada) + ' · ' + dia.eventos.length + ' compromissos</div>'
    + dia.eventos.map(e => eventoHtml(e)).join('')
    + '</div>'
  ).join('');
}

function eventoHtml(e) {
  return '<div class="event-card">'
    + '<div><div class="event-time">' + e.inicio_formatado + '</div><span class="min">' + e.duracao_min + ' min</span></div>'
    + '<div><div class="event-title">' + escape(e.titulo) + '</div>'
    +   '<div class="event-meta">' + (e.attendees.length ? escape(e.attendees.join(', ')) : 'sem participantes') + '</div></div>'
    + '<div class="event-actions">'
    +   (e.link_meet ? '<a class="lead-action primary" href="' + e.link_meet + '" target="_blank">Meet →</a>' : '')
    +   '<button class="lead-action danger" onclick="cancelarEvento(\\'' + e.id + '\\')">Cancelar</button>'
    + '</div>'
    + '</div>';
}

async function cancelarEvento(id) {
  if (!confirm('Cancelar este evento?')) return;
  try {
    const r = await fetch('/dashboard/api/eventos/' + encodeURIComponent(id) + '/cancelar?token=' + encodeURIComponent(TOKEN), { method: 'POST' });
    if (r.ok) { state.agenda = null; carregarAgenda(); }
    else alert('Erro: ' + r.status);
  } catch (e) { alert('Erro: ' + e.message); }
}

// ========== Config ==========
async function carregarConfig() {
  setStatus({ txt: 'carregando', bg: '#f59e0b22', color: '#f59e0b' });
  try {
    const r = await fetch('/dashboard/api/config?token=' + encodeURIComponent(TOKEN));
    const d = await r.json();
    setStatus({ txt: 'ao vivo', bg: '#10b98122', color: 'var(--green)' });
    renderConfig(d);
  } catch (e) {
    setStatus({ txt: 'erro', bg: '#ef444422', color: 'var(--red)' });
  }
}

function renderConfig(d) {
  const grid = document.getElementById('config_grid');
  const card = (titulo, badge, rows) => '<div class="config-card"><h4>' + titulo + ' ' + badge + '</h4>'
    + rows.map(r => '<div class="config-row"><span class="key">' + r[0] + '</span><span class="val">' + escape(String(r[1])) + '</span></div>').join('')
    + '</div>';
  const ok = '<span class="badge green">ok</span>';
  const pend = '<span class="badge yellow">pendente</span>';
  grid.innerHTML = [
    card('Chatwoot', ok, [
      ['Base URL', d.chatwoot.base_url],
      ['Account ID', d.chatwoot.account_id],
      ['Inbox ID', d.chatwoot.inbox_id],
    ]),
    card('Calendly', d.calendly.secret_configurado ? ok : pend, [
      ['Link', d.calendly.link],
      ['Webhook secret', d.calendly.secret_configurado ? 'configurado' : 'pendente'],
    ]),
    card('Google Calendar', d.google.oauth2_configurado ? ok : pend, [
      ['Calendar ID', (d.google.calendar_id || '').slice(0, 30) + '...'],
      ['OAuth2', d.google.oauth2_configurado ? 'ativo (Meet links habilitados)' : 'pendente'],
    ]),
    card('Kanban', ok, [
      ['Board ID', d.kanban.board_id],
      ['Etapas', Object.keys(d.kanban.etapas).length],
    ]),
    card('OpenAI', ok, [
      ['Modelo principal', d.openai.modelo],
      ['Modelo formatter', d.openai.modelo_formatter],
    ]),
    card('Gestores', ok, [
      ['Thiago', d.gestores.thiago],
      ['Leticia', d.gestores.leticia],
    ]),
  ].join('');
}

// ========== Relatórios ==========
function baixarCsv() {
  if (!state.leads) { alert('Carregue os leads primeiro'); return; }
  const linhas = [['ID', 'Lead', 'Etapa', 'Email', 'Telefone', 'Dias na etapa', 'Dias desde criação', 'Última atividade'].join(',')];
  for (const l of state.leads) {
    linhas.push([l.id, '"' + (l.titulo || '').replace(/"/g, '""') + '"', '"' + l.etapa_nome + '"', l.email || '', l.telefone || '', l.dias_na_etapa, l.dias_desde_criacao, l.ultima_atividade_relativa].join(','));
  }
  const blob = new Blob([linhas.join('\\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'leads-vetrik-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ========== Search global ==========
document.getElementById('global_search').addEventListener('input', (e) => {
  state.buscaLead = e.target.value;
  if (state.view !== 'leads') navegarPara('leads');
  else renderLeadsCompleto();
});

document.getElementById('leads_search').addEventListener('input', (e) => {
  state.buscaLead = e.target.value;
  renderLeadsCompleto();
});

// ========== Helpers ==========
function escape(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
}

// Init
const viewInicial = (location.hash || '#dashboard').replace('#', '');
navegarPara(viewInicial, false);
setInterval(() => { if (state.view === 'dashboard') carregarStats(); }, 60000);
</script>
</body>
</html>`;
