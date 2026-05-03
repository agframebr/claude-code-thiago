import { Annotation } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { TarefaKanban, FunilKanban } from '../../tipos.ts';

export const EstadoPrincipal = Annotation.Root({
  // Entrada bruta do webhook
  payload_webhook: Annotation<Record<string, unknown>>(),

  // Info extraída (corresponde ao nó "Info" do n8n)
  id_mensagem: Annotation<string>(),
  id_mensagem_referenciada: Annotation<string | null>(),
  id_conta: Annotation<number>(),
  id_conversa: Annotation<number>(),
  id_contato: Annotation<number>(),
  id_inbox: Annotation<number>(),
  telefone: Annotation<string>(),
  nome: Annotation<string>(),
  mensagem_bruta: Annotation<string>(),
  mensagem_de_audio: Annotation<boolean>(),
  tipo_arquivo: Annotation<string>(),
  id_anexo: Annotation<string | null>(),
  url_arquivo: Annotation<string | null>(),
  timestamp_msg: Annotation<string>(),
  etiquetas: Annotation<string[]>(),
  atributos_contato: Annotation<Record<string, unknown>>(),
  atributos_conversa: Annotation<Record<string, unknown>>(),
  tarefa: Annotation<TarefaKanban | null>(),
  funil: Annotation<FunilKanban | null>(),

  // Processamento
  mensagem_processada: Annotation<string>(),
  transcricao: Annotation<string | null>(),
  mensagem_referenciada: Annotation<string>(),
  mensagens_coletadas: Annotation<string>(),

  // Roteamento
  acao: Annotation<'reset' | 'habilitar_teste' | 'ignorar' | 'processar'>(),
  tipo_mensagem: Annotation<'audio' | 'imagem' | 'texto' | 'outro'>(),
  encavalada: Annotation<boolean>(),
  recebeu_msg_durante_resposta: Annotation<boolean>(),

  // Resposta do agente
  output_agente: Annotation<string>(),
  steps_intermediarios: Annotation<Array<{ action: { log: string }; observation: unknown }>>(),
  texto_formatado: Annotation<string>(),
  texto_ssml: Annotation<string>(),
  audio_buffer: Annotation<Buffer | null>(),

  // Histórico (mantido para compat — o agente carrega via memoria-chat)
  mensagens_chat: Annotation<BaseMessage[]>({
    reducer: (curr, upd) => upd ?? curr,
    default: () => [],
  }),
});

export type EstadoPrincipalType = typeof EstadoPrincipal.State;
