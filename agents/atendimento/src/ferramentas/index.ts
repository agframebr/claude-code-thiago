import type { ContextoAgente } from '../tipos.ts';
import { criarBuscarJanelasDisponiveis } from './buscarJanelasDisponiveis.ts';
import { criarCriarAgendamento } from './criarAgendamento.ts';
import { criarBuscarAgendamentosDoContato } from './buscarAgendamentosDoContato.ts';
import { criarAtualizarAgendamento } from './atualizarAgendamento.ts';
import { criarCancelarAgendamento } from './cancelarAgendamento.ts';
import { criarEscalarHumano } from './escalarHumano.ts';
import { criarRefletir } from './refletir.ts';
import { criarReagirMensagem } from './reagirMensagem.ts';
import { criarAtualizarTarefa } from './atualizarTarefa.ts';
import { criarNotificarThiago } from './notificarThiago.ts';

export function criarFerramentas(ctx: ContextoAgente) {
  return [
    criarBuscarJanelasDisponiveis(),
    criarCriarAgendamento(ctx),
    criarBuscarAgendamentosDoContato(ctx),
    criarAtualizarAgendamento(),
    criarCancelarAgendamento(),
    criarEscalarHumano(ctx),
    criarRefletir(),
    criarReagirMensagem(ctx),
    criarAtualizarTarefa(ctx),
    criarNotificarThiago(),
  ];
}

export type Ferramentas = ReturnType<typeof criarFerramentas>;
