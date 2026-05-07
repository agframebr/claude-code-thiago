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
import { criarListarMinhaAgenda } from './listarMinhaAgenda.ts';

export type PerfilAgente = 'sdr' | 'assistente' | 'gestora';

export function criarFerramentas(ctx: ContextoAgente, perfil: PerfilAgente = 'sdr') {
  // Ferramentas comuns a TODOS os perfis (sem Escalar_humano — gestores não podem ser escalados)
  const comuns = [
    criarBuscarJanelasDisponiveis(),
    criarBuscarAgendamentosDoContato(ctx),
    criarRefletir(),
    criarReagirMensagem(ctx),
    criarAtualizarTarefa(ctx),
    criarAtualizarContato(ctx),
  ];

  if (perfil === 'gestora') {
    return [...comuns, criarGerarRelatorio(), criarListarMinhaAgenda()];
  }

  if (perfil === 'assistente') {
    return [
      ...comuns,
      criarCriarAgendamento(ctx),
      criarAgendarMensagem(ctx),
      criarNotificarThiago(),
      criarGerarRelatorio(),
      criarCancelarCompromissos(),
      criarListarMinhaAgenda(),
    ];
  }

  // sdr — perfil padrão (lead externo). Único que pode escalar para humano.
  return [
    ...comuns,
    criarEscalarHumano(ctx),
    criarCriarAgendamento(ctx),
    criarAgendarMensagem(ctx),
    criarNotificarThiago(),
  ];
}

export type Ferramentas = ReturnType<typeof criarFerramentas>;
