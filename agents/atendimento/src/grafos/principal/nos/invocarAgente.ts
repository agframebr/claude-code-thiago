/**
 * Nó "invocar_agente" — agente Maria via createReactAgent.
 * - Carrega histórico de n8n_historico_mensagens (últimas 50)
 * - Monta tools com contexto da conversa
 * - Invoca ReAct com prompt VERBATIM da Maria
 * - Persiste HumanMessage do paciente + AIMessage final na memória
 */
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { EstadoPrincipalType } from '../estado.ts';
import { llmPrincipal } from '../../../lib/openai.ts';
import { carregarHistorico, salvarMensagem, salvarToolCallsXml } from '../../../lib/memoria-chat.ts';
import { getCheckpointer } from '../../../lib/checkpointer.ts';
import { createLangfuseHandler, flushLangfuseHandler } from '../../../lib/langfuse.ts';
import { criarFerramentas } from '../../../ferramentas/index.ts';
import { buildPromptIsys } from '../prompts/isys-system.ts';
import { createChildLogger } from '../../../lib/logger.ts';
import { consultar } from '../../../lib/db.ts';
import type { ContextoAgente } from '../../../tipos.ts';

const log = createChildLogger({ no: 'invocar_agente' });

const OUTPUT_INVALIDO = 'Agent stopped due to max iterations.';

async function limparCheckpointer(threadId: string): Promise<void> {
  try {
    await consultar('DELETE FROM checkpoint_blobs WHERE thread_id = $1', [threadId]);
    await consultar('DELETE FROM checkpoint_writes WHERE thread_id = $1', [threadId]);
    await consultar('DELETE FROM checkpoints WHERE thread_id = $1', [threadId]);
    log.info({ threadId }, 'checkpointer limpo');
  } catch (err) {
    log.warn({ err }, 'falha ao limpar checkpointer');
  }
}

export async function invocarAgente(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  const inicio = Date.now();
  const historico = await carregarHistorico(estado.telefone, 50);

  const ctx: ContextoAgente = {
    telefone: estado.telefone,
    idConta: estado.id_conta,
    idContato: estado.id_contato,
    idConversa: estado.id_conversa,
    idInbox: estado.id_inbox,
    idMensagem: Number(estado.id_mensagem),
    nome: estado.nome,
    tarefa: estado.tarefa,
    funil: estado.funil,
    mensagensColetadas: estado.mensagens_coletadas ?? '',
  };

  const tools = criarFerramentas(ctx);
  const checkpointer = await getCheckpointer();
  const promptSistema = buildPromptIsys({ tarefa: estado.tarefa, funil: estado.funil, telefone: estado.telefone });

  const agente = createReactAgent({
    llm: llmPrincipal(),
    tools,
    checkpointSaver: checkpointer,
    stateModifier: promptSistema,
  });

  const modoAssistente = estado.telefone === (await import('../../../dominio/vetrik.ts')).TELEFONE_THIAGO;
  const handler = createLangfuseHandler('agente-isys', {
    sessionId: estado.telefone,
    userId: `chatwoot-${estado.id_contato}`,
    tags: ['vetrik', modoAssistente ? 'assistente' : 'sdr'],
  });

  const inputMessage = new HumanMessage(estado.mensagens_coletadas ?? '');

  let outputAgente = '';
  const stepsIntermediarios: Array<{ action: { log: string }; observation: unknown }> = [];

  try {
    const resp = await agente.invoke(
      { messages: [...historico, inputMessage] },
      {
        configurable: { thread_id: estado.telefone },
        callbacks: handler ? [handler] : undefined,
        recursionLimit: 25,
      },
    );

    const msgs = resp.messages ?? [];

    // Coleta tool_calls intermediárias (AIMessage com tool_calls + ToolMessage seguinte)
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i] as { _getType?: () => string; tool_calls?: unknown[]; content?: unknown };
      const tipo = m._getType?.();
      if (tipo === 'ai' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
        for (const tc of m.tool_calls as Array<{ name: string; args: unknown }>) {
          // Acha o ToolMessage correspondente (próximo na sequência)
          const toolMsg = msgs[i + 1] as { content?: unknown } | undefined;
          stepsIntermediarios.push({
            action: { log: `${tc.name}(${JSON.stringify(tc.args)})` },
            observation: toolMsg?.content ?? '',
          });
        }
      }
    }

    const ultima = msgs[msgs.length - 1];
    outputAgente = ultima
      ? typeof ultima.content === 'string'
        ? ultima.content
        : JSON.stringify(ultima.content)
      : '';
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const ehCorrupcaoToolMsg = errMsg.includes("role 'tool'") || errMsg.includes("role \"tool\"");
    if (ehCorrupcaoToolMsg) {
      log.warn({ err }, 'state corrompido (tool sem precedente) — limpando e retentando');
      await limparCheckpointer(estado.telefone);
      try {
        const respRetry = await agente.invoke(
          { messages: [...historico, inputMessage] },
          { configurable: { thread_id: estado.telefone }, recursionLimit: 25 },
        );
        const msgsRetry = respRetry.messages ?? [];
        const ultimaRetry = msgsRetry[msgsRetry.length - 1];
        outputAgente = ultimaRetry
          ? typeof ultimaRetry.content === 'string'
            ? ultimaRetry.content
            : JSON.stringify(ultimaRetry.content)
          : '';
      } catch (retryErr) {
        log.error({ err: retryErr }, 'erro no retry após limpar checkpointer');
        outputAgente = '';
      }
    } else {
      log.error({ err }, 'erro invocando agente maria');
      outputAgente = '';
    }
  } finally {
    await flushLangfuseHandler(handler);
  }

  log.info({ duracaoMs: Date.now() - inicio, len: outputAgente.length, tools: stepsIntermediarios.length }, 'agente maria respondeu');

  if (!outputAgente || outputAgente.trim() === OUTPUT_INVALIDO) {
    log.warn('output inválido — não persistir nem responder');
    return { output_agente: '', steps_intermediarios: stepsIntermediarios };
  }

  // Persistir conversa na memória (HumanMessage + AIMessage final)
  try {
    await salvarMensagem(estado.telefone, inputMessage);
    await salvarMensagem(estado.telefone, new AIMessage({ content: outputAgente }));
  } catch (err) {
    log.warn({ err }, 'falha ao persistir mensagens — continua mesmo assim');
  }

  return { output_agente: outputAgente, steps_intermediarios: stepsIntermediarios };
}

export async function salvarToolCallsNo(
  estado: EstadoPrincipalType,
): Promise<Partial<EstadoPrincipalType>> {
  if (!estado.steps_intermediarios?.length) return {};
  try {
    await salvarToolCallsXml(estado.telefone, estado.steps_intermediarios);
  } catch (err) {
    log.warn({ err }, 'falha ao salvar tool calls XML');
  }
  return {};
}
