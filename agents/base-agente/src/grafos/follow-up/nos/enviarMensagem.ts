import type { EstadoFollowUpType } from '../estado.ts';
import { enviarMensagem } from '../../../lib/chatwoot.ts';
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
  return {};
}
