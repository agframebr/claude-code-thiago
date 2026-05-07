import type { EstadoFollowUpType } from '../estado.ts';
import { enviarMensagem, moverTarefa } from '../../../lib/chatwoot.ts';
import { createChildLogger } from '../../../lib/logger.ts';

const log = createChildLogger({ no: 'enviar_mensagem_follow_up' });

export async function enviarMensagemFollowUp(
  estado: EstadoFollowUpType,
): Promise<Partial<EstadoFollowUpType>> {
  if (!estado.mensagem_gerada) {
    log.warn('mensagem_gerada vazia — pulando envio');
    return {};
  }

  await enviarMensagem(estado.id_conta, estado.id_conversa, {
    content: estado.mensagem_gerada,
    splitMessage: true,
    waitBeforeSending: 'dynamic',
  });
  log.debug({ idConversa: estado.id_conversa, len: estado.mensagem_gerada.length }, 'mensagem enviada');

  // Move o card para a etapa alvo após o envio (ex: "Entrar em Contato" → "Contato Feito")
  if (estado.mover_apos_envio && estado.id_tarefa) {
    await moverTarefa(estado.id_conta, estado.id_funil, estado.id_tarefa, estado.mover_apos_envio).catch((err) =>
      log.warn({ err, idTarefa: estado.id_tarefa, etapa: estado.mover_apos_envio }, 'falha ao mover card após envio'),
    );
    log.debug({ idTarefa: estado.id_tarefa, etapa: estado.mover_apos_envio }, 'card movido após envio');
  }

  return {};
}
