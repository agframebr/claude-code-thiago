import { getCheckpointer } from './lib/checkpointer.ts';
import { pingDb } from './lib/db.ts';
import { logger } from './lib/logger.ts';
import { iniciarServidor } from './servidor.ts';

logger.info('inicializando agente Ísys VETRIK...');

// Pré-aquece Postgres — não-fatal: o agente sobe mesmo se o DB demorar a ficar disponível
const tentarPingDb = async (tentativas = 5, intervaloMs = 3000) => {
  for (let i = 1; i <= tentativas; i++) {
    try {
      await pingDb();
      logger.info('postgres ok');
      return;
    } catch (err) {
      logger.warn({ tentativa: i, err: (err as Error).message }, 'postgres ainda não disponível — aguardando');
      if (i < tentativas) await new Promise(r => setTimeout(r, intervaloMs));
    }
  }
  logger.error('postgres não disponível após todas as tentativas — continuando sem pré-aquecimento');
};

const tentarCheckpointer = async (tentativas = 5, intervaloMs = 3000) => {
  for (let i = 1; i <= tentativas; i++) {
    try {
      await getCheckpointer();
      logger.info('checkpointer ok');
      return;
    } catch (err) {
      logger.warn({ tentativa: i, err: (err as Error).message }, 'checkpointer não disponível — aguardando');
      if (i < tentativas) await new Promise(r => setTimeout(r, intervaloMs));
    }
  }
  logger.error('checkpointer não disponível após todas as tentativas — continuando');
};

await tentarPingDb();
await tentarCheckpointer();

await iniciarServidor();
