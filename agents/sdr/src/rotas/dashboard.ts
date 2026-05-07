import { type Elysia } from 'elysia';
import { config } from '../config.ts';
import { calcularMetricasPipeline, calcularMetricasAgenda } from '../lib/metricas.ts';
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
        const [pipeline, agenda] = await Promise.all([
          calcularMetricasPipeline(),
          calcularMetricasAgenda(),
        ]);
        return { pipeline, agenda, gerado_em: new Date().toISOString() };
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
        return `<!DOCTYPE html><html><head><title>Acesso negado</title><style>body{font-family:system-ui;text-align:center;padding:60px;background:#0f0f17;color:#eee}</style></head><body><h1>🔒 Acesso negado</h1><p>Token inválido. Adicione <code>?token=...</code> na URL.</p></body></html>`;
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
<title>Dashboard Vetrik — Ísys SDR</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0e1a;
    color: #e8e8f0;
    padding: 24px;
    min-height: 100vh;
  }
  .container { max-width: 1400px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; flex-wrap: wrap; gap: 12px; }
  h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
  h1 .accent { color: #5b9bd5; }
  .timestamp { color: #6b7280; font-size: 13px; }
  .status { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; background: #10b98122; color: #10b981; margin-left: 8px; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .card {
    background: #131a2c;
    border: 1px solid #1f2940;
    border-radius: 12px;
    padding: 18px 20px;
  }
  .card.big { grid-column: span 2; }
  .label { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; font-weight: 600; }
  .value { font-size: 32px; font-weight: 700; color: #e8e8f0; }
  .value.small { font-size: 20px; }
  .value.green { color: #10b981; }
  .value.yellow { color: #f59e0b; }
  .value.red { color: #ef4444; }
  .subtitle { color: #6b7280; font-size: 12px; margin-top: 4px; }

  .section { margin-bottom: 28px; }
  .section h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 12px; font-weight: 600; }

  .pipeline-bar {
    display: flex;
    gap: 6px;
    background: #131a2c;
    border: 1px solid #1f2940;
    border-radius: 12px;
    padding: 16px;
    overflow-x: auto;
  }
  .stage {
    flex: 1;
    min-width: 110px;
    padding: 14px 12px;
    border-radius: 10px;
    background: #1f2940;
    border-left: 3px solid var(--cor);
    text-align: left;
  }
  .stage .stage-name { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px; }
  .stage .stage-count { font-size: 24px; font-weight: 700; color: #e8e8f0; }

  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #1f2940; font-size: 13px; }
  th { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  td a { color: #5b9bd5; text-decoration: none; font-size: 12px; }
  td a:hover { text-decoration: underline; }
  .empty { color: #6b7280; padding: 16px; font-style: italic; text-align: center; }

  .footer { color: #4b5563; font-size: 11px; text-align: center; margin-top: 32px; }
  .reload { background: #5b9bd5; color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
  .reload:hover { background: #4a8bc0; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div>
      <h1><span class="accent">VETRIK</span> · Ísys Dashboard <span class="status" id="status">●  carregando…</span></h1>
      <div class="timestamp" id="timestamp"></div>
    </div>
    <button class="reload" onclick="carregar()">↻ Atualizar</button>
  </header>

  <div class="section">
    <h2>📊 Resumo</h2>
    <div class="grid">
      <div class="card"><div class="label">Total Leads</div><div class="value" id="total_leads">—</div></div>
      <div class="card"><div class="label">Novos 24h</div><div class="value green" id="novos_24h">—</div></div>
      <div class="card"><div class="label">Novos 7d</div><div class="value" id="novos_7d">—</div></div>
      <div class="card"><div class="label">Reuniões Agendadas</div><div class="value" id="reuniao_agendada">—</div></div>
      <div class="card"><div class="label">Calls Realizadas</div><div class="value" id="call_realizada">—</div></div>
      <div class="card"><div class="label">Fechados</div><div class="value green" id="fechado">—</div></div>
    </div>
  </div>

  <div class="section">
    <h2>🔥 Atenção</h2>
    <div class="grid">
      <div class="card"><div class="label">Parados +3 dias</div><div class="value yellow" id="parados_3d">—</div><div class="subtitle">leads ativos sem movimento</div></div>
      <div class="card"><div class="label">Parados +7 dias</div><div class="value red" id="parados_7d">—</div><div class="subtitle">precisam de follow-up urgente</div></div>
      <div class="card"><div class="label">Conversão Respondeu→Reunião</div><div class="value" id="conv_respondeu">—</div><div class="subtitle">% de leads qualificados</div></div>
      <div class="card"><div class="label">Conversão Reunião→Fechado</div><div class="value" id="conv_fechado">—</div><div class="subtitle">% de calls que viram cliente</div></div>
    </div>
  </div>

  <div class="section">
    <h2>🎯 Pipeline</h2>
    <div class="pipeline-bar" id="pipeline_bar"></div>
  </div>

  <div class="section">
    <h2>📅 Agenda de Hoje</h2>
    <div class="card">
      <table>
        <thead><tr><th>Horário</th><th>Compromisso</th><th>Meet</th></tr></thead>
        <tbody id="agenda_hoje"></tbody>
      </table>
    </div>
  </div>

  <div class="footer">Vetrik · atualizado em <span id="atualizado">—</span> · próxima 7d: <span id="proximos_7d">—</span> compromissos</div>
</div>

<script>
const TOKEN = '{{TOKEN}}';

async function carregar() {
  document.getElementById('status').textContent = '● carregando…';
  document.getElementById('status').style.background = '#f59e0b22';
  document.getElementById('status').style.color = '#f59e0b';
  try {
    const r = await fetch('/dashboard/api/stats?token=' + encodeURIComponent(TOKEN));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    aplicar(d);
    document.getElementById('status').textContent = '● ao vivo';
    document.getElementById('status').style.background = '#10b98122';
    document.getElementById('status').style.color = '#10b981';
  } catch (e) {
    document.getElementById('status').textContent = '● erro';
    document.getElementById('status').style.background = '#ef444422';
    document.getElementById('status').style.color = '#ef4444';
  }
}

function aplicar(d) {
  const p = d.pipeline;
  const a = d.agenda;
  document.getElementById('total_leads').textContent = p.total_leads;
  document.getElementById('novos_24h').textContent = p.novos_24h;
  document.getElementById('novos_7d').textContent = p.novos_7d;
  document.getElementById('reuniao_agendada').textContent = p.reuniao_agendada_total;
  document.getElementById('call_realizada').textContent = p.call_realizada_total;
  document.getElementById('fechado').textContent = p.fechado_total;
  document.getElementById('parados_3d').textContent = p.parados_3d;
  document.getElementById('parados_7d').textContent = p.parados_7d;
  document.getElementById('conv_respondeu').textContent = p.taxa_conversao_respondeu_para_reuniao + '%';
  document.getElementById('conv_fechado').textContent = p.taxa_conversao_reuniao_para_fechado + '%';

  const bar = document.getElementById('pipeline_bar');
  bar.innerHTML = p.por_etapa.map(s =>
    '<div class="stage" style="--cor:' + s.cor + '"><div class="stage-name">' + s.nome + '</div><div class="stage-count">' + s.total + '</div></div>'
  ).join('');

  const agendaTBody = document.getElementById('agenda_hoje');
  if (a.hoje.length === 0) {
    agendaTBody.innerHTML = '<tr><td colspan="3" class="empty">Sem compromissos hoje. Aproveita.</td></tr>';
  } else {
    agendaTBody.innerHTML = a.hoje.map(e =>
      '<tr><td><strong>' + e.inicio_formatado + '</strong></td><td>' + e.titulo + '</td><td>' + (e.link_meet ? '<a href="' + e.link_meet + '" target="_blank">abrir →</a>' : '—') + '</td></tr>'
    ).join('');
  }

  document.getElementById('atualizado').textContent = new Date(d.gerado_em).toLocaleTimeString('pt-BR');
  document.getElementById('proximos_7d').textContent = a.proximos_7d;
  document.getElementById('timestamp').textContent = 'Última atualização: ' + new Date(d.gerado_em).toLocaleString('pt-BR');
}

carregar();
setInterval(carregar, 60000);
</script>
</body>
</html>`;
