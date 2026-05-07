/**
 * Pós-call inteligente — Thiago manda áudio com prefixo "/poscall <lead>"
 * pra processar notas após Sessão Estratégica.
 *
 * Fluxo:
 * 1. Detecta gatilho na mensagem (texto ou transcrição de áudio)
 * 2. Pega o lead pelo nome/email
 * 3. Usa transcrição do áudio + histórico do lead
 * 4. Gera estrutura: resumo, dores levantadas, fit, próximos passos, primeira versão de proposta
 * 5. Atualiza descrição do card Kanban
 * 6. Move pro estágio adequado (Negociando ou Proposta Enviada)
 * 7. Devolve resumo pro Thiago
 */
import { config } from '../config.ts';
import { llmPrincipal } from './openai.ts';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  listarTarefasKanban,
  atualizarTarefa as apiAtualizarTarefa,
  enviarMensagem,
  buscarConversaPorTelefone,
} from './chatwoot.ts';
import { carregarHistorico } from './memoria-chat.ts';
import { TELEFONE_THIAGO, ETAPAS_FUNIL } from '../dominio/vetrik.ts';
import { createChildLogger } from './logger.ts';
import type { TarefaKanban } from '../tipos.ts';

const log = createChildLogger({ modulo: 'posCallInteligente' });

const PROMPT_POSCALL = `Você é a Ísys, assistente da Vetrik. Acabou de acontecer uma Sessão Estratégica e o Thiago tá te passando o que rolou. Sua missão: gerar notas estruturadas pra ficarem no card Kanban + sugerir próximo passo.

Estruture exatamente assim (preencha cada campo):

📋 RESUMO DA SESSÃO
[1-2 frases do que foi conversado]

💢 DORES LEVANTADAS
- [dor 1]
- [dor 2]
- [dor 3 — se houver]

🎯 SOLUÇÕES PROPOSTAS
- [solução 1 da Vetrik discutida]
- [solução 2 — se houver]

📊 SINAIS DE FIT
[alto/médio/baixo + 1 frase justificando]

🎬 PRÓXIMO PASSO
[ação concreta — ex: "enviar proposta com escopo X", "agendar segunda call com sócio", "perdido por falta de fit"]

🏷️ ETAPA SUGERIDA
[uma destas: Proposta Enviada, Negociando, Fechado, Perdido]

Tom direto, executivo. Sem rodeio. Use o histórico de conversa anterior + o que o Thiago acabou de relatar pra montar tudo.`;

const ETAPAS_POSCALL: Record<string, number> = {
  'Proposta Enviada': ETAPAS_FUNIL.propostaEnviada.id,
  'Negociando': ETAPAS_FUNIL.negociando.id,
  'Fechado': ETAPAS_FUNIL.fechado.id,
  'Perdido': ETAPAS_FUNIL.perdido.id,
};

function detectarGatilho(texto: string): { isPosCall: boolean; identificador: string } {
  const m = texto.match(/\/(poscall|pos-call|pós-call|poscal)\s+(.+)/i);
  if (!m) return { isPosCall: false, identificador: '' };
  return { isPosCall: true, identificador: m[2]?.trim() ?? '' };
}

async function acharCard(identificador: string): Promise<TarefaKanban | null> {
  const lower = identificador.toLowerCase();
  const tarefas = await listarTarefasKanban(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID).catch(() => []);
  const found = tarefas.find((t) => {
    const titulo = (t.title ?? '').toLowerCase();
    const desc = (t.description ?? '').toLowerCase();
    return titulo.includes(lower) || desc.includes(lower);
  });
  return found ?? null;
}

export async function processarPosCall(textoOuTranscricao: string): Promise<{ ok: boolean; resposta: string }> {
  const { isPosCall, identificador } = detectarGatilho(textoOuTranscricao);
  if (!isPosCall) return { ok: false, resposta: '' };

  if (!identificador) {
    return { ok: true, resposta: '⚠️ Use: /poscall <nome ou email do lead> + descreva o que rolou.' };
  }

  const card = await acharCard(identificador);
  if (!card) {
    return { ok: true, resposta: `⚠️ Não achei card com "${identificador}". Confere o nome/email do lead.` };
  }

  // Tenta extrair telefone da descrição pra puxar histórico
  const desc = card.description ?? '';
  const matchTel = desc.match(/Telefone:\s*(\+\d+)/);
  const tel = matchTel?.[1] ?? '';
  let historicoTexto = '';
  if (tel) {
    try {
      const hist = await carregarHistorico(tel, 50);
      historicoTexto = hist.map((m) => {
        const tipo = m._getType?.() === 'human' ? 'Lead' : 'Ísys';
        const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${tipo}: ${c.slice(0, 300)}`;
      }).join('\n');
    } catch {
      // ignora
    }
  }

  // Extrai relato do Thiago (texto após a tag)
  const relato = textoOuTranscricao.replace(/\/(poscall|pos-call|pós-call|poscal)\s+[^\n]+/i, '').trim();

  const contextoBruto = [
    `Lead: ${card.title}`,
    `Etapa atual: ${card.board_step?.name ?? '?'}`,
    desc ? `\nDescrição/notas atuais do card:\n${desc}` : '',
    historicoTexto ? `\nHistórico de conversa com o lead:\n${historicoTexto.slice(-3000)}` : '',
    `\nRelato do Thiago sobre a call que acabou de acontecer:\n${relato || '(Thiago não detalhou — extraia o que der do histórico)'}`,
  ].filter(Boolean).join('\n');

  const llm = llmPrincipal();
  const resp = await llm.invoke([
    new SystemMessage(PROMPT_POSCALL),
    new HumanMessage(contextoBruto),
  ]);
  const notasGeradas = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);

  // Detecta etapa sugerida
  let novaEtapaId: number | null = null;
  for (const [nome, id] of Object.entries(ETAPAS_POSCALL)) {
    if (notasGeradas.includes(nome)) {
      novaEtapaId = id;
      break;
    }
  }

  // Atualiza card Kanban
  const novaDescricao = `${notasGeradas}\n\n---\n\n${desc}`;
  try {
    await apiAtualizarTarefa(config.CHATWOOT_ACCOUNT_ID, config.KANBAN_BOARD_ID, card.id, {
      description: novaDescricao.slice(0, 5000),
      ...(novaEtapaId ? { board_step_id: novaEtapaId } : {}),
    });
    log.info({ idTarefa: card.id, novaEtapaId }, 'pós-call processado e card atualizado');
  } catch (err) {
    log.error({ err, idTarefa: card.id }, 'falha ao atualizar card');
  }

  const respostaFinal = `✅ Pós-call processado pra *${card.title}*\n\n${notasGeradas}${novaEtapaId ? '\n\n📌 Card movido pra etapa correspondente.' : ''}`;
  return { ok: true, resposta: respostaFinal };
}

/**
 * Bypass do agente: se mensagem do Thiago tiver gatilho /poscall, processa direto e responde.
 * Retorna true se interceptou, false se deve seguir o fluxo normal.
 */
export async function tentarInterceptarPosCall(
  telefoneRemetente: string,
  textoOuTranscricao: string,
): Promise<boolean> {
  if (telefoneRemetente !== TELEFONE_THIAGO) return false;
  const { isPosCall } = detectarGatilho(textoOuTranscricao);
  if (!isPosCall) return false;

  const { resposta } = await processarPosCall(textoOuTranscricao);
  if (!resposta) return false;

  const conversa = await buscarConversaPorTelefone(config.CHATWOOT_ACCOUNT_ID, TELEFONE_THIAGO);
  if (conversa) {
    await enviarMensagem(config.CHATWOOT_ACCOUNT_ID, conversa.id, { content: resposta });
  }
  return true;
}
