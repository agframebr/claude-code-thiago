export interface Profissional {
  id: string;
  nome: string;
  papel: string;
}

export const PROFISSIONAIS: readonly Profissional[] = [
  { id: 'thiago-vetrik', nome: 'Thiago Figueredo', papel: 'Fundador e Arquiteto de Soluções' },
] as const;

export const ID_PROFISSIONAL_PADRAO = 'thiago-vetrik';

export const SESSAO_ESTRATEGICA = {
  nome: 'Sessão Estratégica Vetrik',
  duracaoMinutos: 45,
  descricao: 'Diagnóstico do cenário atual + direcionamento estratégico + soluções personalizadas',
} as const;

// IDs reais do Kanban "Prospecção VETRIK" (board ID: 2)
export const ETAPAS_FUNIL = {
  mapeado:          { id: 9,  nome: 'Mapeado' },
  contatoFeito:     { id: 10, nome: 'Contato Feito' },
  respondeu:        { id: 11, nome: 'Respondeu' },
  reuniaoAgendada:  { id: 16, nome: 'Reunião Agendada' },
  callRealizada:    { id: 17, nome: 'Call Realizada' },
  propostaEnviada:  { id: 12, nome: 'Proposta Enviada' },
  negociando:       { id: 13, nome: 'Negociando' },
  fechado:          { id: 14, nome: 'Fechado' },
  perdido:          { id: 15, nome: 'Perdido' },
} as const;

// Etapas onde a Ísys está ativa
export const ETAPAS_ISYS_ATIVA = new Set([
  ETAPAS_FUNIL.mapeado.id,
  ETAPAS_FUNIL.contatoFeito.id,
  ETAPAS_FUNIL.respondeu.id,
  ETAPAS_FUNIL.reuniaoAgendada.id,
  ETAPAS_FUNIL.callRealizada.id,
]);

// Etapas onde a Ísys para e o Thiago assume
export const ETAPAS_THIAGO_ASSUME = new Set([
  ETAPAS_FUNIL.propostaEnviada.id,
  ETAPAS_FUNIL.negociando.id,
  ETAPAS_FUNIL.fechado.id,
  ETAPAS_FUNIL.perdido.id,
]);

export const ETIQUETAS = {
  agenteOff: 'agente-off',
  testandoAgente: 'testando-agente',
} as const;

// Telefone do Thiago — modo assistente pessoal
export const TELEFONE_THIAGO = '+5562998311402';
export const TELEFONE_LETICIA = '+5562999358918';

export const KANBAN_BOARD_ID = 2;

/**
 * Normaliza número de telefone BR para formato canônico (com o 9 de mobile).
 * WhatsApp/Chatwoot às vezes manda no formato antigo (sem o 9 após o DDD).
 *
 * Exemplo: "+556298311402" → "+5562998311402"
 *          "+5562999358918" → "+5562999358918" (já canônico)
 */
export function normalizarTelefoneBR(telefone: string): string {
  if (!telefone) return telefone;
  const digits = telefone.replace(/\D/g, '');
  // Formato antigo BR mobile: 55 + DDD(2) + 8 dígitos = 12 dígitos → falta o 9
  if (digits.startsWith('55') && digits.length === 12) {
    return '+' + digits.slice(0, 4) + '9' + digits.slice(4);
  }
  // Já tem 13 ou outro formato
  return digits.startsWith('55') ? '+' + digits : telefone.startsWith('+') ? telefone : '+' + digits;
}

/** Verifica se o telefone (em qualquer formato BR) é de um gestor da Vetrik. */
export function ehGestor(telefone: string): { isGestor: boolean; perfil: 'thiago' | 'leticia' | null } {
  const norm = normalizarTelefoneBR(telefone);
  if (norm === TELEFONE_THIAGO) return { isGestor: true, perfil: 'thiago' };
  if (norm === TELEFONE_LETICIA) return { isGestor: true, perfil: 'leticia' };
  return { isGestor: false, perfil: null };
}
