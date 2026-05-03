import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { listarEventos, temConflito } from '../lib/google-calendar.ts';
import { parseISO, agora } from '../lib/datas.ts';
import { gerarJanelasCandidatas } from '../dominio/disponibilidade.ts';
import { calendarIdParaProfissional } from '../dominio/id-agendas.ts';
import { createChildLogger } from '../lib/logger.ts';
import type { JanelaDisponivel } from '../tipos.ts';

const log = createChildLogger({ modulo: 'tool.buscarJanelas' });

export function criarBuscarJanelasDisponiveis() {
  return tool(
    async ({ id_profissional, tamanho_janela_minutos, periodo_inicio, periodo_fim }) => {
      log.debug({ id_profissional, tamanho_janela_minutos, periodo_inicio, periodo_fim }, 'buscarJanelas chamado');

      const dtInicio = parseISO(periodo_inicio);
      const dtFim = parseISO(periodo_fim);
      const agr = agora();

      if (!dtInicio.isValid || !dtFim.isValid) {
        return JSON.stringify({ erro: 'Datas inválidas. Use formato YYYY-MM-DDThh:mm:ssTZD.' });
      }
      if (dtInicio < agr) {
        return JSON.stringify({ erro: 'periodo_inicio está no passado.' });
      }
      if (dtFim.diff(dtInicio, 'minutes').minutes < tamanho_janela_minutos) {
        return JSON.stringify({ erro: 'Período menor que o tamanho da janela.' });
      }

      const calendarId = calendarIdParaProfissional(id_profissional);

      const candidatas = gerarJanelasCandidatas(dtInicio, dtFim, tamanho_janela_minutos);
      if (candidatas.length === 0) {
        return JSON.stringify({ janelas: [], mensagem: 'Nenhum horário disponível no período.' });
      }

      const eventos = await listarEventos({
        calendarId,
        timeMin: periodo_inicio,
        timeMax: periodo_fim,
      });

      const livres: JanelaDisponivel[] = candidatas
        .filter(({ inicio, fim }) => {
          const iniISO = inicio.toISO()!;
          const fimISO = fim.toISO()!;
          return !eventos.some((ev) =>
            temConflito(iniISO, fimISO, ev.start?.dateTime, ev.end?.dateTime),
          );
        })
        .map(({ inicio, fim }) => ({
          inicio_janela: inicio.toISO()!,
          fim_janela: fim.toISO()!,
          id_agenda: calendarId,
        }));

      log.debug({ total: candidatas.length, livres: livres.length }, 'buscarJanelas ok');
      return JSON.stringify({ janelas: livres });
    },
    {
      name: 'Buscar_janelas_disponiveis',
      description: `Utilize essa ferramenta para buscar as janelas disponíveis no um período especificado. Evite utilizar com janelas de tamanho muito grandes e muito pequenas. Por exemplo, considerando disponibilidade já informada das 08h às 19h:

* Para janelas maiores, não busque com período fora do horário de disponibilidade já informado nas instruções.

"Quais janelas estão disponíveis amanhã?"
- Período início: 08h, período fim: 19h
- (Ao invés de 00h às 00h do dia seguinte)

* Para janelas menores, insira uma margem antes e depois do horário desejado.

"O horário das 12h está disponível?"
- Período início: 10h, período fim: 14h
- (Ao invés de 12h às 12h30, para tamanho de janela de 30m)

* Para janelas muito próximas do horário atual, certifique-se de não consultar com período início no passado.

"Tem algum horário agora de manhã?" (Mensagem recebida às 09:40)
- Período início: 10h, período fim: 12h
- (Ao invés de 09h às 12h, pois 09h já passou)`,
      schema: z.object({
        id_profissional: z.string().describe('ID do profissional conforme listado nas instruções.'),
        tamanho_janela_minutos: z.number(),
        periodo_inicio: z.string().describe('Deve ser uma data e horário no futuro. Datas passadas são inválidas. A data deve ser no formato: `YYYY-MM-DDThh:mm:ssTZD`. Utilize o fuso horário conforme a data atual.'),
        periodo_fim: z.string().describe('Deve ser uma data e horário no futuro. Datas passadas são inválidas. A data deve ser no formato: `YYYY-MM-DDThh:mm:ssTZD`. Utilize o fuso horário conforme a data atual.'),
      }),
    },
  );
}
