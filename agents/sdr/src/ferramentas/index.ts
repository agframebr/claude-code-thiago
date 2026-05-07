import type { ContextoAgente } from '../tipos.ts';
import { criarBuscarJanelasDisponiveis } from './buscarJanelasDisponiveis.ts';
import { criarCriarAgendamento } from './criarAgendamento.ts';
import { criarBuscarAgendamentosDoContato } from './buscarAgendamentosDoContato.ts';
import { criarEscalarHumano } from './escalarHumano.ts';
import { criarRefletir } from './refletir.ts';
import { criarReagirMensagem } from './reagirMensagem.ts';
import { criarAtualizarTarefa } from './atualizarTarefa.ts';
import { criarAtualizarContato } from './atualizarContato.ts';
import { criarAgendarMensagem } from './agendarMensagem.ts';
import { criarNotificarThiago } from './notificarThiago.ts';
import { criarGerarRelatorio } from './gerarRelatorio.ts';
import { criarCancelarCompromissos } from './cancelarCompromissos.ts';

export type PerfilAgente = 'sdr' | 'assistente' | 'gestora';

export function criarFerramentas(ctx: ContextoAgente, perfil: PerfilAgente = 'sdr') {
  const base = [
    criarBuscarJanelasDisponiveis(),
    criarBuscarAgendamentosDoContato(ctx),
    criarEscalarHumano(ctx),
    criarRefletir(),
    criarReagirMensagem(ctx),
    criarAtualizarTarefa(ctx),
    criarAtualizarContato(ctx),
  ];

  if (perfil === 'gestora') {
    return [...base, criarGerarRelatorio()];
  }

  if (perfil === 'assistente') {
    return [
      ...base,
      criarCriarAgendamento(ctx),
      criarAgendarMensagem(ctx),
      criarNotificarThiago(),
      criarGerarRelatorio(),
      criarCancelarCompromissos(),
    ];
  }

  // sdr — ferramentas padrão de prospecção
  return [
    ...base,
    criarCriarAgendamento(ctx),
    criarAgendarMensagem(ctx),
    criarNotificarThiago(),
  ];
}

export type Ferramentas = ReturnType<typeof criarFerramentas>;
