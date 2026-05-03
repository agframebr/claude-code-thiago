# CLAUDE.md — Regras do Projeto VETRIK / Thiago

---

## Quem é o Thiago

Arquiteto de soluções com visão de negócio. Atua entre estratégia e execução técnica — entra em operações, identifica gargalos e define o que precisa ser construído. Lidera a execução através da VETRIK.

**Contexto**
- Forte atuação em tecnologia, automação e sistemas
- Integra APIs, infraestrutura, automação e IA aplicada em negócios
- Usa IA como alavanca de controle e velocidade

**Valores**
- Eficiência > esforço
- Sistema > improviso
- Clareza > complexidade
- Resultado > teoria
- Controle da operação

**Tom de voz e estilo**
- Direto e estratégico
- Sem enrolação
- Sem linguagem acadêmica
- Foco em execução

**O que evitar**
- Respostas genéricas
- Explicação longa sem ação
- Perguntas excessivas
- Sugestão rasa
- Ignorar contexto técnico + negócio

---

## Negócio — VETRIK

**O que é**
Braço de execução das soluções desenhadas pelo Thiago. A VETRIK executa o que o Thiago projeta.
- Sistemas sob medida
- Automação
- Integrações
- IA aplicada

**Público-alvo**
Empresas que já operam mas estão travadas — processos manuais, falta de estrutura, dificuldade de escalar.

**Posicionamento**
> "A gente entra no negócio, encontra o gargalo e constrói a solução — seja sistema, automação ou IA."

**Serviços**
- Diagnóstico de operação
- Estruturação de processos
- Desenvolvimento de sistemas
- Integrações via API
- Automação (n8n)
- Implementação de IA
- Infraestrutura técnica
- Execução completa

**Objetivo atual**
- Fechar projetos high ticket
- Consolidar posicionamento tech
- Criar cases
- Evoluir para implementação + recorrência

---

## Stack Técnica

**Infraestrutura**
- VPS em nuvem
- Coolify (gestão de deploy)
- Docker (containers quando necessário)

**Ferramentas**
- n8n → automação
- Chatwoot → atendimento
- Kanban → gestão
- Integrações via API

**WhatsApp**
- Produção: API oficial da Meta (WhatsApp Business API) — prioriza estabilidade, conformidade e escalabilidade
- Dev/testes: APIs alternativas quando necessário

**Linguagens**
- TypeScript
- JavaScript

**Em produção hoje**
- Infra ativa em VPS com deploy via Coolify
- Automações via n8n
- Atendimento integrado (Chatwoot + API oficial WhatsApp)
- Sistemas próprios em desenvolvimento

---

## Regras — Claude

**Sempre**
- Responder em PT-BR
- Ser direto, sem enrolação
- Foco em execução

**Quando perguntar vs agir**
- Perguntar → falta info crítica para avançar
- Agir → quando o padrão for claro

**Formato de resposta**
- Simples → curto e direto
- Estratégia → estruturado
- Implementação → técnico com detalhes
- Quando necessário → código

---

## Obsidian / Memória

**Salvar no Obsidian** (`/home/claude/obsidian-vault/`)
- Processos, arquiteturas, fluxos e modelos

**Salvar na Memória do Claude** (`~/.claude/projects/.../memory/`)
- Preferências, decisões e contexto de conversas

---

## Onde salvar cada coisa

### 🤖 agents/
Código de agentes de IA (LangGraph, CrewAI, etc).
- `agents/sdr/` → agente SDR, prospecção, qualificação de leads
- `agents/atendimento/` → agente de atendimento ao cliente
- `agents/templates/` → estruturas base reutilizáveis de agentes

### 👤 clientes/
Projetos específicos por cliente.
- `clientes/ativos/nome-cliente/` → cliente em andamento
- `clientes/arquivados/nome-cliente/` → cliente encerrado ou pausado

### 🎨 conteudo/
Criação de conteúdo para redes sociais da VETRIK e Thiago.
- `conteudo/roteiros/` → roteiros de vídeos, reels, stories
- `conteudo/posts/` → textos de posts, legendas, carrosséis
- `conteudo/artes/` → referências visuais, briefings de design

### 📚 docs/
Documentação técnica do projeto.
- `docs/arquitetura/` → diagramas, decisões de arquitetura, ADRs
- `docs/api/` → documentação de APIs e integrações
- `docs/guias/` → guias de uso, onboarding, tutoriais internos

### 🪝 hooks/
Automações que disparam em eventos.
- `hooks/claude-code/` → hooks do Claude Code
- `hooks/pre-commit/` → scripts que rodam antes de commits git
- `hooks/n8n/` → webhooks e triggers usados em flows n8n

### 🔌 integracoes/
Código de integração com plataformas externas.
- `integracoes/chatwoot/` → integração com Chatwoot (atendimento)
- `integracoes/whatsapp/` → integração com WhatsApp / Evolution API
- `integracoes/apis/` → outras APIs (OpenAI, ElevenLabs, etc)

### 🔒 pessoal/
Projetos e reflexões pessoais do Thiago.
- `pessoal/ideias/` → ideias soltas, brainstorms
- `pessoal/metas/` → metas pessoais e profissionais
- `pessoal/estudos/` → materiais de estudo, anotações de cursos

### 📁 projetos/
Projetos em andamento (não vinculados a um cliente específico).
- `projetos/ativos/` → projetos sendo desenvolvidos agora
- `projetos/pausados/` → projetos em espera
- `projetos/concluidos/` → projetos finalizados

### ⌨️ prompts/
System prompts e templates de prompt.
- `prompts/sistema/` → system prompts de agentes em produção
- `prompts/usuario/` → prompts de usuário, exemplos de interação
- `prompts/testes/` → prompts em teste/experimento

### 📖 referencias/
Material de referência e pesquisa.
- `referencias/apis/` → docs de APIs, exemplos de uso
- `referencias/artigos/` → artigos, posts técnicos salvos
- `referencias/tutoriais/` → tutoriais e passo a passos
- `referencias/exemplos/` → exemplos de código de referência

### 🔧 scripts/
Scripts utilitários e automações de terminal.
- `scripts/deploy/` → scripts de deploy e CI/CD
- `scripts/backup/` → scripts de backup
- `scripts/automacao/` → automações diversas (cron, shell, etc)

### 🔌 skills/
Skills do Claude Code organizadas por domínio.
- `skills/n8n/` → skills relacionadas a n8n
- `skills/langchain/` → skills de LangChain / LangGraph
- `skills/chatwoot/` → skills de Chatwoot
- `skills/custom/` → skills customizadas da VETRIK

### 📋 templates/
Templates reutilizáveis prontos para usar.
- `templates/agentes/` → estruturas base de agentes
- `templates/prompts/` → templates de prompts
- `templates/workflows/` → templates de flows n8n
- `templates/propostas/` → propostas comerciais, decks
- `templates/emails/` → templates de email (follow-up, onboarding, etc)

### 🔄 workflows/
Flows do n8n exportados em JSON.

### ⚙️ Pastas de configuração
- `.github/workflows/` → GitHub Actions (CI/CD)
- `.husky/` → Git hooks via Husky
- `.vscode/` → configurações do VS Code (não editar manualmente)

---

## Regras automáticas

- Novo agente ou bot → `agents/` na subpasta correta
- Conversão n8n → LangGraph → `agents/` (código) + `workflows/` (JSON original)
- Flow n8n exportado → `workflows/`
- Integração com plataforma externa → `integracoes/`
- Algo de cliente específico → `clientes/ativos/nome-cliente/`
- System prompt de produção → `prompts/sistema/`
- Roteiro ou post de rede social → `conteudo/roteiros/` ou `conteudo/posts/`
- Script de terminal → `scripts/automacao/` (ou subpasta adequada)
- Referência ou doc externa salva → `referencias/`
- Template reutilizável → `templates/` na subpasta correta
- Nota pessoal, ideia ou meta → `pessoal/`
