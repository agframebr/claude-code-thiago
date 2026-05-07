/**
 * Nós de processamento da mensagem:
 * - processar_tipo_mensagem: detecta áudio/imagem/texto, transcreve áudio
 * - extrair_mensagem: aplica lógica VERBATIM do nó "Extrair mensagem" do n8n
 * - salvar_transcricao: persiste transcrição/descrição no anexo Chatwoot
 * - verificar_mensagem_referenciada: busca conteúdo da mensagem citada
 */
import type { EstadoPrincipalType } from '../estado.ts';
import { baixarAnexo, atualizarMetadadosAnexo, listarMensagens } from '../../../lib/chatwoot.ts';
import { transcreverAudio } from '../../../lib/openai.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'processar_tipo_mensagem' });

export async function processarTipoMensagem(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  if (estado.mensagem_de_audio) {
    if (!estado.url_arquivo) {
      log.warn('áudio sem url_arquivo');
      return { tipo_mensagem: 'audio', transcricao: '' };
    }
    try {
      const buffer = await baixarAnexo(estado.url_arquivo);
      const texto = await transcreverAudio(buffer, { mimeType: 'audio/ogg', idioma: 'pt' });
      log.debug({ len: texto.length }, 'áudio transcrito');
      return { tipo_mensagem: 'audio', transcricao: texto };
    } catch (err) {
      log.error({ err }, 'falha ao transcrever áudio');
      return { tipo_mensagem: 'audio', transcricao: '' };
    }
  }

  if (estado.tipo_arquivo === 'image') {
    return { tipo_mensagem: 'imagem' };
  }
  if (estado.tipo_arquivo && estado.tipo_arquivo !== 'image') {
    return { tipo_mensagem: 'outro' };
  }
  return { tipo_mensagem: 'texto' };
}

export async function extrairMensagem(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  const tipo = estado.tipo_mensagem;
  let transcricao = estado.transcricao ?? '';
  // Whisper às vezes alucina "Amara.org" em silêncio
  if (transcricao.includes('Amara.org')) transcricao = '';

  const mensagemBruta = estado.mensagem_bruta ?? '';
  let mensagemProcessada: string;

  if (tipo === 'audio') {
    if (!transcricao) {
      mensagemProcessada = '<mensagem de áudio não audível>';
    } else {
      mensagemProcessada = `<mensagem-de-audio>${transcricao}</mensagem-de-audio>`;
    }
  } else if (tipo === 'imagem') {
    mensagemProcessada = `${mensagemBruta}\n<usuário enviou uma imagem. peça que envie a informação por áudio ou texto>`;
  } else if (tipo === 'outro') {
    mensagemProcessada = `${mensagemBruta}\n<usuário enviou um arquivo do tipo '${estado.tipo_arquivo}'>`;
  } else if (mensagemBruta) {
    mensagemProcessada = mensagemBruta;
  } else {
    mensagemProcessada = '<mensagem não suportada. solicitar que usuário envie informação por áudio ou texto>';
  }

  log.debug({ tipo, len: mensagemProcessada.length }, 'mensagem extraída');
  return { mensagem_processada: mensagemProcessada, transcricao };
}

export async function salvarTranscricao(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  if ((estado.tipo_mensagem !== 'audio' && estado.tipo_mensagem !== 'imagem') || !estado.id_anexo) {
    return {};
  }
  const texto = estado.transcricao ?? '';
  if (!texto) return {};
  try {
    await atualizarMetadadosAnexo(
      estado.id_conta,
      estado.id_conversa,
      Number(estado.id_mensagem),
      estado.id_anexo,
      { transcribed_text: texto },
    );
    log.debug('transcrição salva no anexo');
  } catch (err) {
    log.warn({ err }, 'falha ao salvar transcrição');
  }
  return {};
}

export async function verificarMensagemReferenciada(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  if (!estado.id_mensagem_referenciada) return { mensagem_referenciada: '' };
  try {
    const msgs = await listarMensagens(estado.id_conta, estado.id_conversa, 50);
    const alvo = msgs.find((m) => String(m.id) === String(estado.id_mensagem_referenciada));
    const conteudo = alvo?.content ?? '';
    log.debug({ achou: !!alvo, len: conteudo.length }, 'mensagem referenciada buscada');
    return { mensagem_referenciada: conteudo };
  } catch (err) {
    log.warn({ err }, 'falha ao buscar mensagem referenciada');
    return { mensagem_referenciada: '' };
  }
}
