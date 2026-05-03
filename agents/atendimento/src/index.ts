import { getCheckpointer } from './lib/checkpointer.ts';
import { pingDb } from './lib/db.ts';
import { logger } from './lib/logger.ts';
import { iniciarServidor } from './servidor.ts';

logger.info('inicializando agente vetrik...');

// Pré-aquece conexões antes de abrir o servidor
await pingDb().then(() => logger.info('postgres ok'));
await getCheckpointer().then(() => logger.info('checkpointer ok'));

await iniciarServidor();
