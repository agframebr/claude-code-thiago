import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { buildPgUrl } from './db.ts';
import { createChildLogger } from './logger.ts';

const log = createChildLogger({ modulo: 'checkpointer' });

let _saver: PostgresSaver | null = null;
let _setupRealizado = false;

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (_saver && _setupRealizado) return _saver;

  if (!_saver) {
    log.info('inicializando PostgresSaver');
    _saver = PostgresSaver.fromConnString(buildPgUrl());
  }

  if (!_setupRealizado) {
    log.info('rodando setup() do checkpointer (idempotente)');
    await _saver.setup();
    _setupRealizado = true;
    log.info('checkpointer pronto');
  }

  return _saver;
}
