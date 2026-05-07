/**
 * Constantes de domínio — Clínica Moreira (extraídas dos prompts do n8n).
 *
 * IDs de profissional são strings estáveis usadas pelo agente nas tools.
 */

export interface Profissional {
  id: string;
  nome: string;
  especialidade: string;
}

export const PROFISSIONAIS: readonly Profissional[] = [
  { id: 'dra-ana-costa', nome: 'Dra. Ana Costa', especialidade: 'Clínico Geral' },
  { id: 'dr-ricardo-lima', nome: 'Dr. Ricardo Lima', especialidade: 'Endodontia' },
  { id: 'dra-beatriz-souza', nome: 'Dra. Beatriz Souza', especialidade: 'Ortodontia' },
  { id: 'dr-felipe-torres', nome: 'Dr. Felipe Torres', especialidade: 'Implantodontia' },
] as const;

export const ID_POR_PROFISSIONAL: Record<string, Profissional> = Object.fromEntries(
  PROFISSIONAIS.map((p) => [p.id, p]),
);

export interface Procedimento {
  nome: string;
  duracaoMinutos: number;
}

/** Duração padrão de procedimentos (ajustar conforme cliente). */
export const PROCEDIMENTOS: readonly Procedimento[] = [
  { nome: 'Avaliação inicial', duracaoMinutos: 30 },
  { nome: 'Limpeza', duracaoMinutos: 45 },
  { nome: 'Restauração', duracaoMinutos: 60 },
  { nome: 'Tratamento de canal', duracaoMinutos: 60 },
] as const;

export const ETAPAS_KANBAN_NOMES = [
  'Lead',
  'Qualificado',
  'Agendado',
  'Compareceu',
  'No-show',
  'Pós-venda',
] as const;

export type EtapaKanbanNome = (typeof ETAPAS_KANBAN_NOMES)[number];

export const NOME_FUNIL_PADRAO = 'Clinica de Odontologia';

export const ETIQUETAS = {
  agenteOff: 'agente-off',
  testandoAgente: 'testando-agente',
} as const;
