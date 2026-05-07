/**
 * Constantes de domínio — VETRIK / Ísys SDR
 */

export interface Profissional {
  id: string;
  nome: string;
  papel: string;
}

export const PROFISSIONAIS: readonly Profissional[] = [
  { id: 'thiago-vetrik', nome: 'Thiago Figueredo', papel: 'Fundador e Arquiteto de Soluções' },
] as const;

export const ID_PROFISSIONAL_PADRAO = 'thiago-vetrik';

export interface Servico {
  id: string;
  nome: string;
  descricao: string;
}

export const SERVICOS: readonly Servico[] = [
  { id: 'diagnostico', nome: 'Diagnóstico de Operação', descricao: 'Identificação de gargalos e mapeamento do cenário atual' },
  { id: 'processos', nome: 'Estruturação de Processos', descricao: 'Definição e padronização de fluxos operacionais' },
  { id: 'sistemas', nome: 'Desenvolvimento de Sistemas', descricao: 'Sistemas sob medida para a operação do cliente' },
  { id: 'integracoes', nome: 'Integrações via API', descricao: 'Conexão entre plataformas e ferramentas do cliente' },
  { id: 'automacao', nome: 'Automação (n8n)', descricao: 'Automação de processos manuais e repetitivos' },
  { id: 'ia', nome: 'Implementação de IA', descricao: 'IA aplicada para ganho de velocidade e controle' },
  { id: 'infra', nome: 'Infraestrutura Técnica', descricao: 'VPS, containers, deploy e gestão de ambiente' },
  { id: 'execucao', nome: 'Execução Completa', descricao: 'Da estratégia ao resultado — implementação end-to-end' },
] as const;

// Sessão Estratégica — único tipo de reunião disponível
export const SESSAO_ESTRATEGICA = {
  nome: 'Sessão Estratégica Vetrik',
  duracaoMinutos: 45, // ajustar após confirmação do Thiago
  descricao: 'Diagnóstico do cenário atual + direcionamento estratégico + possíveis soluções personalizadas',
} as const;

// Etapas do funil (IDs correspondem ao Chatwoot Kanban — Pipeline VETRIK)
export const ETAPAS_FUNIL = {
  novoLead: 'Novo Lead',
  qualificado: 'Qualificado',
  diagnosticoAgendado: 'Diagnóstico Agendado',
  diagnosticoFeito: 'Diagnóstico Feito',
  propostaEnviada: 'Proposta Enviada',
  fechado: 'Fechado',
  perdido: 'Perdido',
  clienteAtivo: 'Cliente Ativo',
} as const;

export const ETIQUETAS = {
  agenteOff: 'agente-off',
  testandoAgente: 'testando-agente',
} as const;

// Telefone do Thiago — modo assistente pessoal
export const TELEFONE_THIAGO = '+5562998311402';
