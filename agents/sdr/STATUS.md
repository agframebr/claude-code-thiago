# Ísys SDR — Status atual (atualizado 2026-05-07)

Snapshot completo do que está funcionando e o que ficou pendente. Use como ponto de partida pra continuar em outra sessão.

---

## 🚀 Stack & Deploy

- **App**: `agents/sdr/` (TypeScript + Bun + ElysiaJS + LangGraph)
- **URL pública**: `https://sdr.vetrik.com.br` (HTTPS via Coolify Traefik)
- **Coolify UUID**: `i4whdgeubhqdv2zq0dvxid0d`
- **Coolify URL**: `https://coolify.vetrik.com.br`
- **Coolify API token**: `6|wwe3KdBfU1PxRPjoRN1QZ7FFefNreHgwVIamgBfy5335a5a4`
- **VPS Coolify+Apps**: `177.7.50.171` (mesmo IP de chatwoot.vetrik.com.br)
- **DNS sdr.vetrik.com.br** → 177.7.50.171
- **Postgres interno**: `ownsowplry4s16cv9a6ixcui` (no Coolify)

### Variáveis sensíveis no Coolify env (já configuradas)

- `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.2`, `OPENAI_MODEL_FORMATTER=gpt-4.1-mini`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID=33B4UnXyTNbgLmdEDh5P`
- `CHATWOOT_BASE_URL=https://chatwoot.vetrik.com.br`, `CHATWOOT_API_TOKEN=vjRSDFqAHzJQKXK7wt4vFjGo`
- `CALENDLY_WEBHOOK_SECRET=7ea2bd31456796ad6e155c0fe83ab026070e1a85daf100268bb22f78f6f8d18d`
- `GOOGLE_OAUTH2_REFRESH_TOKEN` (configurado — Meet links funcionando)
- `LANGFUSE_PUBLIC_KEY/SECRET_KEY` (creds podem estar erradas, vejo erro 401 nos logs)

### Deploy
```bash
git push origin main
curl -X POST "https://coolify.vetrik.com.br/api/v1/applications/i4whdgeubhqdv2zq0dvxid0d/start" \
  -H "Authorization: Bearer 6|wwe3KdBfU1PxRPjoRN1QZ7FFefNreHgwVIamgBfy5335a5a4"
```

---

## 🤖 Agentes (perfis)

Identificação por **telefone normalizado BR** (vetrik.ts: `normalizarTelefoneBR()` adiciona o 9 do mobile se vier formato antigo). Função `ehGestor()` retorna o perfil:

| Telefone | Perfil | Tools disponíveis |
|---|---|---|
| `+5562998311402` (Thiago) | `assistente` | Tudo: Listar_minha_agenda, Criar_agendamento, Cancelar_agendamento, Cancelar_compromissos, Gerar_relatorio, Notificar_responsavel, Atualizar_*, Agendar_mensagem, Refletir |
| `+5562999358918` (Leticia) | `gestora` | Listar_minha_agenda, Buscar_*, Atualizar_*, Gerar_relatorio, Refletir |
| Outros | `sdr` | Tudo de prospecção + Escalar_humano |

**Importante:** gestores **nunca** podem ser escalados (Escalar_humano não está nos tools deles, e tem guard defensivo no `escalarHumano.ts`). Isso era o bug crítico que bloqueava o Thiago.

---

## ✅ Implementado e funcionando

### Núcleo SDR
- Webhook Chatwoot (msg do lead → grafo principal → resposta)
- Webhook Calendly (booking → atualiza Chatwoot + Kanban + manda Meet link)
- Áudio bidirecional: lead manda áudio → Whisper transcreve → Ísys responde em áudio (TTS ElevenLabs). Gestor manda áudio → Ísys responde em texto (mais rápido).
- **Reactions nativas WhatsApp** — endpoint correto é `POST /messages/{id}/reactions` com `{"emoji":"❤️"}`. Era `is_reaction:true` que era ignorado pelo Chatwoot.
- Kanban auto-create pra novos leads em "Contato Feito"
- Auto-move pra "Reunião Agendada" após `Criar_agendamento`
- Follow-up automático (sem resposta + pós-call) baseado em webhooks `kanban_task_overdue` e `kanban_task_updated`
- Calendly webhook captura **telefone** das `questions_and_answers` ("Telefone (WhatsApp)" como required no event type)

### Calendly
- Personal Access Token gravado, webhook registrado em `https://api.calendly.com/webhook_subscriptions/e40022fe-1ba5-4647-9b86-36c1bb1f3065`
- Event type ID: `ab459c54-9038-4db0-a85d-063c3a62ffd0`
- User URI: `https://api.calendly.com/users/a6d8807a-1abf-491b-a5f3-fee6325a5a97`

### Calendar
- OAuth2 do Thiago configurado — Meet links funcionando em agendamentos manuais
- `idAgendas['thiago-vetrik']` = `'primary'` (calendário pessoal do Thiago) — Calendly e manuais convivem no mesmo calendar, então conflitos de horário funcionam

### Dashboard (`https://sdr.vetrik.com.br/dashboard?token=<CALENDLY_WEBHOOK_SECRET>`)
SPA com 7 views funcionais:
- **Dashboard** — KPIs, pipeline, gráfico 14d, atividade recente
- **Pipeline** — leads filtráveis por etapa (chips)
- **Agenda** — eventos agrupados por dia (7/14/30), com cancel button
- **Leads** — busca global (nome/email/tel/desc) + dropdown "Mover ▾" pra trocar etapa
- **Follow-ups** — leads com due_date vencido/próximo
- **Relatórios** — taxas + export CSV
- **Configurações** — status integrações

Endpoints `/dashboard/api/*`: `stats`, `leads`, `agenda`, `leads/:id`, `leads/:id/move`, `leads/:id/perdido`, `eventos/:id/cancelar`, `config`

Estilo dark premium (referência salva em `referencias/exemplos/`), azul `#3B82F6→#1D4ED8`.

### Briefing diário 8h
- `setInterval` checa hora a cada minuto
- Janela 08:00-08:05 BRT, dispara 1x/dia
- Manda no WhatsApp do Thiago: agenda + pipeline + alertas
- Endpoints admin: `GET /admin/briefing-preview?token=...` e `POST /admin/briefing-enviar?token=...&para=thiago`

### Pré-briefing 1h antes da call
- Scheduler verifica calls a cada 5min (janela 55-65min antes)
- Gera dossier com LLM: contexto + dor + fit + perguntas táticas
- Lê histórico Chatwoot do lead + notas do card Kanban
- Anti-duplicação por `eventId+data`

### Pós-call inteligente
- Thiago manda `/poscall <nome ou email do lead>` + relato (texto ou áudio transcrito)
- Bypass do agente ReAct: intercepta direto no `invocarAgente`
- Gera notas estruturadas: resumo, dores, soluções, fit, próximo passo, etapa
- Atualiza descrição do card preservando histórico anterior
- Move card automaticamente pra etapa sugerida (Proposta Enviada/Negociando/Fechado/Perdido)

### Admin endpoints
- `POST /admin/limpar-memoria?token=...&telefone=+...` — apaga histórico chat + checkpoints LangGraph
- `/oauth2/start` e `/oauth2/callback` — fluxo OAuth2 do Google

---

## 🐛 Bugs corrigidos no caminho

1. **Telefone formato antigo BR** (sem o 9 do mobile) — Chatwoot mandava `+556298311402`, config tinha `+5562998311402`. Comparação falhava → caía em perfil SDR. Fixed via `normalizarTelefoneBR()`.
2. **Webhook Chatwoot apontando pro agente atendimento antigo** — webhook 11/12 apontavam pra UUID errado/IP errado. Limpei tudo, recriei webhook 13 apontando pra `https://sdr.vetrik.com.br/webhook/chatwoot`. Atendimento agent foi parado no Coolify.
3. **DNS sdr.vetrik.com.br errado** — apontava pra IP do `.env` (`177.7.49.251`) que não existia, real é `177.7.50.171`.
4. **Reactions ignoradas pelo Chatwoot** — `is_reaction:true` no body é ignorado. Endpoint certo é `/messages/{id}/reactions`.
5. **Calendar conflicts** — eventos manuais iam pro group calendar mas Calendly checa primary. Mudei `idAgendas['thiago-vetrik']` pra `'primary'`.
6. **Webhook Calendly payload** — usa `payload.scheduled_event.location.join_url`, não `payload.event.location` (era v1, agora é v2).
7. **`changed_attributes` como objeto** — extrairPayload tratava como array, dava `.find is not a function`. Aceita ambos agora.
8. **Email do lead não cadastrado no Chatwoot** — webhook resiliente, sempre notifica Thiago + cria contato/conversa novos automaticamente se tem telefone do Calendly.

---

## 📋 Decisões em aberto (a próxima sessão decide)

### Dashboard — features extras pedidas pelo Thiago

Ele perguntou se ia conseguir 3 coisas pelo dashboard:

1. **Mover leads entre etapas** ✅ Implementado (dropdown "Mover ▾")
2. **Cadastrar atendentes** ❌ Não implementado — dá pra fazer via Chatwoot agents API. Levaria ~1h pra implementar listar+convidar+papel.
3. **Responder pelo dashboard** ❌ Não implementado — viraria mini-Chatwoot. Levaria ~3-4h pra fazer chat decente. Minha sugestão foi **não fazer** porque o Chatwoot já é melhor pra chat. O dashboard tem botão "Chat" em cada lead que abre direto a conversa lá.

### Próximos passos sugeridos (não priorizados ainda)

Da lista que apresentei e ele aprovou em geral:

- ✅ Dashboard premium (feito)
- ✅ Briefing diário 8h (feito)
- ✅ Comando por voz pro gestor (feito — texto ao invés de áudio)
- ✅ Pré-briefing 1h antes (feito)
- ✅ Pós-call /poscall (feito)
- ⏳ Score automático por lead (1-10) — não feito
- ⏳ Reativação de leads frios automática
- ⏳ Análise de imagem (lead manda print)
- ⏳ Resumo de conversa por demanda
- ⏳ Pesquisa em linguagem natural no pipeline
- ⏳ Detecção de sentimento em áudio
- ⏳ Geração de proposta automática
- ⏳ Alertas inteligentes (lead parado, conversão caindo)
- ⏳ Conteúdo automático (posts/reels)

---

## 🔑 Tokens & secrets pra bater na API

```
COOLIFY_TOKEN=6|wwe3KdBfU1PxRPjoRN1QZ7FFefNreHgwVIamgBfy5335a5a4
COOLIFY_BASE=https://coolify.vetrik.com.br
SDR_APP_UUID=i4whdgeubhqdv2zq0dvxid0d

CHATWOOT_TOKEN=vjRSDFqAHzJQKXK7wt4vFjGo
CHATWOOT_BASE=https://chatwoot.vetrik.com.br
CHATWOOT_ACCOUNT=1
CHATWOOT_INBOX=1

DASHBOARD_TOKEN=7ea2bd31456796ad6e155c0fe83ab026070e1a85daf100268bb22f78f6f8d18d  # = CALENDLY_WEBHOOK_SECRET

CALENDLY_PAT=eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJodHRwczovL2F1dGguY2FsZW5kbHkuY29tIiwiaWF0IjoxNzc4MTMyODQxLCJqdGkiOiJlNDE4YTM5MS0yMGJkLTQwNzUtODNhYi1kZGE5Y2M0ZjljMDUiLCJ1c2VyX3V1aWQiOiJhNmQ4ODA3YS0xYWJmLTQ5MWItYTVmMy1mZWU2MzI1YTVhOTciLCJzY29wZSI6ImF2YWlsYWJpbGl0eTpyZWFkIGF2YWlsYWJpbGl0eTp3cml0ZSBldmVudF90eXBlczpyZWFkIGV2ZW50X3R5cGVzOndyaXRlIGxvY2F0aW9uczpyZWFkIHJvdXRpbmdfZm9ybXM6cmVhZCBzaGFyZXM6d3JpdGUgc2NoZWR1bGVkX2V2ZW50czpyZWFkIHNjaGVkdWxlZF9ldmVudHM6d3JpdGUgc2NoZWR1bGluZ19saW5rczp3cml0ZSBncm91cHM6cmVhZCBvcmdhbml6YXRpb25zOnJlYWQgb3JnYW5pemF0aW9uczp3cml0ZSB1c2VyczpyZWFkIGFjdGl2aXR5X2xvZzpyZWFkIGRhdGFfY29tcGxpYW5jZTp3cml0ZSBvdXRnb2luZ19jb21tdW5pY2F0aW9uczpyZWFkIHdlYmhvb2tzOnJlYWQgd2ViaG9va3M6d3JpdGUifQ.c6bf3prZJNe38BEmxIqLY6FotDFspGDTW5CqOTcwBfSQHRjBWlb-CAUAwOkuH8jKacM6HrukpA69ydLKxN3Imw
CALENDLY_USER_URI=https://api.calendly.com/users/a6d8807a-1abf-491b-a5f3-fee6325a5a97
```

---

## 📂 Arquivos importantes

```
agents/sdr/
├── src/
│   ├── config.ts                    # zod parse das envs
│   ├── servidor.ts                  # Elysia + schedulers
│   ├── tipos.ts                     # types compartilhados
│   ├── dominio/
│   │   ├── vetrik.ts                # ETAPAS_FUNIL, telefones gestores, normalizarTelefoneBR, ehGestor
│   │   └── id-agendas.ts            # idAgendas → 'primary'
│   ├── lib/
│   │   ├── chatwoot.ts              # API calls
│   │   ├── google-calendar.ts       # OAuth2 + service account
│   │   ├── google-auth.ts           # auth resolution
│   │   ├── elevenlabs.ts            # TTS
│   │   ├── openai.ts                # LLM clients + Whisper
│   │   ├── memoria-chat.ts          # historico em postgres
│   │   ├── checkpointer.ts          # LangGraph state
│   │   ├── metricas.ts              # cálculo de KPIs e séries
│   │   ├── briefingDiario.ts        # scheduler + envio briefing 8h
│   │   ├── preBriefingCall.ts       # scheduler dossier 1h antes
│   │   └── posCallInteligente.ts    # /poscall handler
│   ├── ferramentas/                 # tools do agente (LangGraph)
│   │   ├── index.ts                 # criarFerramentas(ctx, perfil)
│   │   ├── buscarJanelasDisponiveis.ts
│   │   ├── buscarAgendamentosDoContato.ts
│   │   ├── criarAgendamento.ts      # cria + auto-move kanban
│   │   ├── cancelarAgendamento.ts   # single event
│   │   ├── cancelarCompromissos.ts  # mass + WhatsApp leads
│   │   ├── escalarHumano.ts         # com guard pra gestores
│   │   ├── refletir.ts
│   │   ├── reagirMensagem.ts        # POST /messages/{id}/reactions
│   │   ├── atualizarTarefa.ts
│   │   ├── atualizarContato.ts
│   │   ├── agendarMensagem.ts
│   │   ├── notificarThiago.ts
│   │   ├── gerarRelatorio.ts
│   │   └── listarMinhaAgenda.ts
│   ├── grafos/
│   │   ├── principal/               # fluxo lead/gestor
│   │   │   ├── grafo.ts
│   │   │   ├── estado.ts
│   │   │   ├── nos/
│   │   │   │   ├── extrairInfo.ts            # normaliza tel + auto-cria card
│   │   │   │   ├── invocarAgente.ts          # bypass /poscall + ReAct
│   │   │   │   ├── processarTipoMensagem.ts  # Whisper transcribe
│   │   │   │   ├── formatarEEnviar.ts        # text/SSML/audio
│   │   │   │   ├── debounceLock.ts
│   │   │   │   ├── roteamento.ts
│   │   │   │   └── resetarConversa.ts
│   │   │   └── prompts/
│   │   │       ├── isys-system.ts            # SDR + assistente + gestora
│   │   │       ├── formatar-texto.ts
│   │   │       └── formatar-ssml.ts
│   │   └── follow-up/
│   │       ├── grafo.ts
│   │       ├── estado.ts
│   │       ├── nos/
│   │       │   ├── extrairPayload.ts         # changed_attributes obj/array
│   │       │   ├── buscarInfoFunil.ts
│   │       │   ├── atualizarDataTarefa.ts
│   │       │   ├── agentes.ts
│   │       │   └── enviarMensagem.ts
│   │       └── prompts/
│   │           ├── follow-up-sem-resposta.ts
│   │           └── pos-call.ts
│   └── rotas/
│       ├── saude.ts
│       ├── webhookChatwoot.ts
│       ├── webhookCalendly.ts       # parse scheduled_event + cria contato
│       ├── oauth2Google.ts          # /oauth2/start + /callback
│       ├── admin.ts                 # limpar-memoria + briefing endpoints
│       └── dashboard.ts             # SPA + APIs
├── docker-compose.yml               # expose 3000 (Traefik via labels)
├── Dockerfile
└── PLANO-SDR.md                     # plano original (histórico)
```

---

## 🎯 Pra continuar em outra sessão

Use este prompt inicial:

> Lê `agents/sdr/STATUS.md` pra contexto. Tô continuando trabalho na Ísys SDR. <pedido específico>

Ou pra retomar exatamente onde parou:
> Próximo passo era decidir se implemento gestão de atendentes pelo dashboard (1h, opção B) ou se mantenho como tá (opção A — Chatwoot continua sendo o lugar de chat). Também tenho 8 features de produto na fila pra atacar (score, reativação, análise de imagem, etc).
