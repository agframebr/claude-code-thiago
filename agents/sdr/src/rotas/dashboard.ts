import { type Elysia } from 'elysia';
import { config } from '../config.ts';
import {
  calcularMetricasPipeline,
  calcularMetricasAgenda,
  calcularAtividadeRecente,
  calcularSerieTemporal,
} from '../lib/metricas.ts';
import { createChildLogger } from '../lib/logger.ts';

const log = createChildLogger({ rota: 'dashboard' });
const TOKEN_ADMIN = config.CALENDLY_WEBHOOK_SECRET;

export function rotaDashboard(app: Elysia) {
  return app
    .get('/dashboard/api/stats', async ({ query, set }) => {
      const token = (query.token as string) ?? '';
      if (token !== TOKEN_ADMIN) {
        set.status = 401;
        return { erro: 'unauthorized' };
      }
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
    .get('/dashboard', ({ query, set }) => {
      const token = (query.token as string) ?? '';
      if (token !== TOKEN_ADMIN) {
        set.status = 401;
        set.headers['content-type'] = 'text/html; charset=utf-8';
        return `<!DOCTYPE html><html><head><title>Acesso negado</title><style>body{font-family:system-ui;text-align:center;padding:60px;background:#0a0a0a;color:#eee}</style></head><body><h1>🔒 Acesso negado</h1><p>Token inválido. Adicione <code>?token=...</code> na URL.</p></body></html>`;
      }
      set.headers['content-type'] = 'text/html; charset=utf-8';
      return DASHBOARD_HTML.replace('{{TOKEN}}', token);
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

  /* ==== Layout ==== */
  .app { display: grid; grid-template-columns: 250px 1fr; min-height: 100vh; }
  .sidebar {
    background: var(--bg-2);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    padding: 20px 16px;
    position: sticky; top: 0; height: 100vh;
  }
  .main { padding: 22px 28px; overflow-x: auto; }

  /* ==== Sidebar ==== */
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
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    color: var(--text-2);
    font-size: 13px;
    margin-bottom: 18px;
    display: flex; align-items: center; gap: 8px;
  }
  .search input {
    background: transparent; border: none; outline: none;
    color: var(--text); flex: 1; font-size: 13px;
  }
  .search kbd {
    background: var(--bg-4); padding: 2px 6px; border-radius: 4px;
    font-size: 11px; font-family: inherit; color: var(--text-3);
  }

  .nav-section { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-3); padding: 14px 8px 6px; font-weight: 600; }
  .nav-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; margin: 2px 0;
    border-radius: 8px;
    color: var(--text-2);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    text-decoration: none;
    font-size: 13.5px;
  }
  .nav-item:hover { background: var(--bg-3); color: var(--text); }
  .nav-item.active { background: var(--bg-3); color: var(--text); }
  .nav-item .ico { width: 18px; height: 18px; flex-shrink: 0; opacity: 0.85; }

  .upgrade-card {
    margin-top: auto;
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    padding: 16px;
    border-radius: 12px;
    color: white;
    box-shadow: 0 8px 24px var(--accent-soft);
  }
  .upgrade-card h4 { font-size: 13px; margin-bottom: 4px; }
  .upgrade-card p { font-size: 11px; opacity: 0.9; line-height: 1.4; margin-bottom: 10px; }
  .upgrade-card a {
    display: inline-block;
    background: rgba(255,255,255,0.2);
    padding: 5px 10px;
    border-radius: 6px;
    color: white;
    text-decoration: none;
    font-size: 11px;
    font-weight: 600;
  }

  /* ==== Top header ==== */
  .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; flex-wrap: wrap; gap: 12px; }
  .crumbs { color: var(--text-3); font-size: 13px; }
  .crumbs strong { color: var(--text); font-weight: 600; }
  .topbar-right { display: flex; gap: 8px; align-items: center; }
  .icon-btn {
    width: 36px; height: 36px;
    border-radius: 8px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    display: grid; place-items: center;
    color: var(--text-2);
    cursor: pointer;
    transition: all 0.15s;
    font-size: 14px;
  }
  .icon-btn:hover { background: var(--bg-3); color: var(--text); }
  .live-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 14px; font-size: 11px; font-weight: 600; background: #10b98122; color: var(--green); }
  .live-badge::before { content: '●'; animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% {opacity:1} 50% {opacity:0.4} }

  /* ==== Section ==== */
  .section-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: 12px; }
  .section-head h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.4px; }
  .section-head p { color: var(--text-3); font-size: 13px; margin-top: 2px; }
  .filters { display: flex; gap: 8px; }
  .filter-btn {
    padding: 7px 12px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-2);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .filter-btn:hover { background: var(--bg-3); color: var(--text); }

  /* ==== KPI grid ==== */
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
  .kpi-card {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 18px 20px;
    position: relative;
    overflow: hidden;
  }
  .kpi-card.highlight {
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    border-color: transparent;
    box-shadow: 0 12px 32px var(--accent-soft);
  }
  .kpi-card.highlight .kpi-label,
  .kpi-card.highlight .kpi-extra { color: rgba(255,255,255,0.85); }
  .kpi-card.highlight .kpi-value { color: white; }

  .kpi-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; }
  .kpi-icon {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: var(--bg-3);
    display: grid; place-items: center;
    font-size: 14px;
  }
  .kpi-card.highlight .kpi-icon { background: rgba(255,255,255,0.18); }
  .kpi-menu { color: var(--text-3); cursor: pointer; padding: 4px; }
  .kpi-label { font-size: 12px; color: var(--text-2); margin-bottom: 4px; font-weight: 500; }
  .kpi-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
  .kpi-card.highlight .kpi-title { color: white; }
  .kpi-value { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.1; }
  .kpi-badge {
    display: inline-block;
    background: rgba(255,255,255,0.22);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    margin-left: 6px;
    vertical-align: middle;
  }
  .kpi-extra { font-size: 12px; color: var(--text-3); margin-top: 8px; }
  .kpi-extra.green { color: var(--green); }
  .kpi-extra.red { color: var(--red); }

  /* ==== Pipeline + Chart row ==== */
  .row-2 { display: grid; grid-template-columns: 1fr 1.5fr; gap: 14px; margin-bottom: 18px; }
  .panel {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 18px 20px;
  }
  .panel-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .panel-title h3 { font-size: 16px; font-weight: 600; }
  .panel-title .meta { color: var(--text-3); font-size: 12px; }
  .panel-action {
    background: var(--accent); color: white;
    border: none; padding: 6px 12px; border-radius: 8px;
    font-size: 11px; font-weight: 600; cursor: pointer;
  }

  .stage-list { display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto; }
  .stage-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-radius: 10px; background: var(--bg-3);
    border-left: 3px solid var(--cor);
  }
  .stage-row .name { font-size: 13px; font-weight: 500; color: var(--text); }
  .stage-row .count { font-size: 18px; font-weight: 700; color: var(--text); }
  .stage-row.zero .count { color: var(--text-3); }

  /* ==== Chart ==== */
  .chart-area { height: 220px; position: relative; padding-top: 10px; }
  .chart-value { font-size: 28px; font-weight: 700; margin-bottom: 12px; }
  .chart-bars { display: flex; align-items: end; gap: 6px; height: 160px; padding-bottom: 28px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: end; gap: 4px; height: 100%; position: relative; }
  .bar {
    width: 100%; max-width: 24px;
    background: var(--bg-4);
    border-radius: 4px 4px 0 0;
    transition: all 0.2s;
    min-height: 2px;
    position: relative;
  }
  .bar.active {
    background: linear-gradient(180deg, var(--accent), var(--accent-strong));
    box-shadow: 0 0 12px var(--accent-soft);
  }
  .bar-label { font-size: 10px; color: var(--text-3); position: absolute; bottom: -22px; }

  /* ==== Activity table ==== */
  .activity-row {
    display: grid; grid-template-columns: 30px 1fr auto auto;
    gap: 12px; align-items: center;
    padding: 10px 8px; border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
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

  /* ==== Responsive ==== */
  @media (max-width: 900px) {
    .app { grid-template-columns: 1fr; }
    .sidebar { position: static; height: auto; }
    .kpi-grid { grid-template-columns: 1fr; }
    .row-2 { grid-template-columns: 1fr; }
  }

  /* Scrollbar */
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
      <input placeholder="Buscar..." />
      <kbd>⌘K</kbd>
    </div>

    <a class="nav-item active"><span class="ico">▦</span> Dashboard</a>
    <a class="nav-item"><span class="ico">📊</span> Pipeline</a>
    <a class="nav-item"><span class="ico">📅</span> Agenda</a>
    <a class="nav-item"><span class="ico">👥</span> Leads</a>

    <div class="nav-section">Operação</div>
    <a class="nav-item"><span class="ico">🔁</span> Follow-ups</a>
    <a class="nav-item"><span class="ico">📈</span> Relatórios</a>
    <a class="nav-item"><span class="ico">⚙️</span> Configurações</a>

    <div class="upgrade-card" id="proxima_sessao_card">
      <h4>📌 Próxima sessão</h4>
      <p id="proxima_sessao_info">Carregando...</p>
      <a id="proxima_sessao_link" href="#" target="_blank" style="display:none">Abrir Meet →</a>
    </div>
  </aside>

  <main class="main">
    <div class="topbar">
      <div class="crumbs">Vetrik · <strong>Dashboard</strong></div>
      <div class="topbar-right">
        <span class="live-badge" id="status">ao vivo</span>
        <div class="icon-btn" title="Notificações">🔔</div>
        <div class="icon-btn" title="Atualizar" onclick="carregar()">↻</div>
      </div>
    </div>

    <div class="section-head">
      <div>
        <h2>Visão geral</h2>
        <p>Resumo do funil de prospecção e operação</p>
      </div>
      <div class="filters">
        <button class="filter-btn">Este mês ▾</button>
        <button class="filter-btn">Reset</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card highlight">
        <div class="kpi-head">
          <div class="kpi-icon">📅</div>
          <div class="kpi-menu">⋯</div>
        </div>
        <div class="kpi-title">Reuniões Agendadas</div>
        <div class="kpi-value">
          <span id="reuniao_agendada">—</span>
          <span class="kpi-badge" id="novos_24h_badge">+0</span>
        </div>
        <div class="kpi-extra">Sessões marcadas no pipeline</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-head">
          <div class="kpi-icon">🎯</div>
          <div class="kpi-menu">⋯</div>
        </div>
        <div class="kpi-title">Calls Realizadas</div>
        <div class="kpi-value" id="call_realizada">—</div>
        <div class="kpi-extra">Sessões já executadas</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-head">
          <div class="kpi-icon">💚</div>
          <div class="kpi-menu">⋯</div>
        </div>
        <div class="kpi-title">Fechados</div>
        <div class="kpi-value" id="fechado">—</div>
        <div class="kpi-extra green" id="conv_fechado_extra">—</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Leads</div>
        <div class="kpi-value" id="total_leads">—</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Novos 7 dias</div>
        <div class="kpi-value" id="novos_7d">—</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Parados +7d</div>
        <div class="kpi-value" id="parados_7d" style="color:var(--red)">—</div>
        <div class="kpi-extra">leads sem ação</div>
      </div>
    </div>

    <div class="row-2">
      <div class="panel">
        <div class="panel-title">
          <h3>Pipeline por etapa</h3>
          <span class="meta" id="total_etapas">—</span>
        </div>
        <div class="stage-list" id="stage_list"></div>
      </div>

      <div class="panel">
        <div class="panel-title">
          <h3>Conversão · 14 dias</h3>
          <button class="panel-action">Detalhes →</button>
        </div>
        <div class="chart-area">
          <div class="chart-value" id="chart_total">—</div>
          <div class="chart-bars" id="chart_bars"></div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">
        <h3>Atividade recente</h3>
        <span class="meta">últimas 7 dias</span>
      </div>
      <div id="atividade_lista"></div>
    </div>

  </main>
</div>

<script>
const TOKEN = '{{TOKEN}}';

async function carregar() {
  document.getElementById('status').textContent = 'carregando';
  document.getElementById('status').style.background = '#f59e0b22';
  document.getElementById('status').style.color = '#f59e0b';
  try {
    const r = await fetch('/dashboard/api/stats?token=' + encodeURIComponent(TOKEN));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    aplicar(d);
    document.getElementById('status').textContent = 'ao vivo';
    document.getElementById('status').style.background = '#10b98122';
    document.getElementById('status').style.color = 'var(--green)';
  } catch (e) {
    document.getElementById('status').textContent = 'erro';
    document.getElementById('status').style.background = '#ef444422';
    document.getElementById('status').style.color = 'var(--red)';
  }
}

function aplicar(d) {
  const p = d.pipeline;
  const a = d.agenda;
  const at = d.atividade ?? [];
  const s = d.serie ?? { labels: [], novos_leads: [], fechados: [], agendamentos: [] };

  // KPIs
  document.getElementById('reuniao_agendada').textContent = p.reuniao_agendada_total;
  document.getElementById('novos_24h_badge').textContent = '+' + p.novos_24h + ' 24h';
  document.getElementById('call_realizada').textContent = p.call_realizada_total;
  document.getElementById('fechado').textContent = p.fechado_total;
  document.getElementById('conv_fechado_extra').textContent = p.taxa_conversao_reuniao_para_fechado + '% conv. reunião → fechado';
  document.getElementById('total_leads').textContent = p.total_leads;
  document.getElementById('novos_7d').textContent = p.novos_7d;
  document.getElementById('parados_7d').textContent = p.parados_7d;

  // Próxima sessão (sidebar)
  const ps = a.proxima_sessao;
  if (ps) {
    document.getElementById('proxima_sessao_info').textContent = ps.titulo + ' · ' + ps.inicio_formatado;
    if (ps.link_meet) {
      const link = document.getElementById('proxima_sessao_link');
      link.href = ps.link_meet;
      link.style.display = 'inline-block';
    }
  } else {
    document.getElementById('proxima_sessao_info').textContent = 'Sem sessão agendada.';
  }

  // Pipeline list
  const stageList = document.getElementById('stage_list');
  stageList.innerHTML = p.por_etapa.map(s =>
    '<div class="stage-row ' + (s.total === 0 ? 'zero' : '') + '" style="--cor:' + s.cor + '">' +
    '<span class="name">' + s.nome + '</span>' +
    '<span class="count">' + s.total + '</span>' +
    '</div>'
  ).join('');
  document.getElementById('total_etapas').textContent = p.total_leads + ' leads';

  // Chart bars
  const bars = document.getElementById('chart_bars');
  const dadosBar = s.novos_leads ?? [];
  const max = Math.max(1, ...dadosBar);
  const idxAtivo = dadosBar.length - 1;  // hoje
  bars.innerHTML = dadosBar.map((v, i) => {
    const altura = Math.max(2, (v / max) * 100);
    const ehAtivo = i === idxAtivo;
    return '<div class="bar-col">' +
      '<div class="bar ' + (ehAtivo ? 'active' : '') + '" style="height:' + altura + '%"></div>' +
      (i % 2 === 0 ? '<div class="bar-label">' + (s.labels[i] ?? '') + '</div>' : '') +
      '</div>';
  }).join('');
  const totalSerie = dadosBar.reduce((acc, v) => acc + v, 0);
  document.getElementById('chart_total').innerHTML = totalSerie + ' <span style="font-size:14px;color:var(--text-3);font-weight:500">leads novos</span>';

  // Atividade
  const ativDiv = document.getElementById('atividade_lista');
  if (at.length === 0) {
    ativDiv.innerHTML = '<div class="empty-state">Sem atividade nas últimas 7 dias.</div>';
  } else {
    ativDiv.innerHTML = at.map(item =>
      '<div class="activity-row">' +
      '<div><div class="activity-dot ' + item.cor_status + '"></div></div>' +
      '<div><div class="activity-name">' + escape(item.titulo) + '</div><div class="activity-detail">' + escape(item.detalhe) + '</div></div>' +
      '<div class="activity-when">' + item.quando_relativo + '</div>' +
      '<div></div>' +
      '</div>'
    ).join('');
  }
}

function escape(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
}

carregar();
setInterval(carregar, 60000);
</script>
</body>
</html>`;
