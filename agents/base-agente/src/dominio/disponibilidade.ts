/**
 * Disponibilidade do Thiago Figueredo — Sessão Estratégica VETRIK.
 *
 * Seg-Sex: 09:00-12:00 + 14:00-20:00
 * Sáb:     09:00-16:00
 * Dom:     fechado
 */
import { DateTime } from 'luxon';
import { TZ } from '../lib/datas.ts';

export interface IntervaloHorario {
  inicio: string; // 'HH:mm'
  fim: string; // 'HH:mm'
}

/** Chave: 1=Seg, ..., 7=Dom (Luxon weekday). */
export const DISPONIBILIDADE_SEMANAL: Record<number, IntervaloHorario[]> = {
  1: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '20:00' }],
  2: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '20:00' }],
  3: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '20:00' }],
  4: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '20:00' }],
  5: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '20:00' }],
  6: [{ inicio: '09:00', fim: '16:00' }],
  7: [],
};

export const GRANULARIDADE_PADRAO_MINUTOS = 15;

/**
 * Gera todas as janelas candidatas (de tamanho `tamanhoMinutos`) entre
 * `inicio` e `fim`, respeitando a disponibilidade semanal.
 */
export function gerarJanelasCandidatas(
  inicio: DateTime,
  fim: DateTime,
  tamanhoMinutos: number,
  granularidadeMinutos = GRANULARIDADE_PADRAO_MINUTOS,
): Array<{ inicio: DateTime; fim: DateTime }> {
  const janelas: Array<{ inicio: DateTime; fim: DateTime }> = [];
  let cursor = inicio.setZone(TZ);
  const limite = fim.setZone(TZ);

  while (cursor.plus({ minutes: tamanhoMinutos }) <= limite) {
    const fimJanela = cursor.plus({ minutes: tamanhoMinutos });
    if (cabeNaDisponibilidade(cursor, fimJanela)) {
      janelas.push({ inicio: cursor, fim: fimJanela });
    }
    cursor = cursor.plus({ minutes: granularidadeMinutos });
  }

  return janelas;
}

function cabeNaDisponibilidade(inicio: DateTime, fim: DateTime): boolean {
  if (inicio.day !== fim.day) return false; // não cruza dia
  const intervalos = DISPONIBILIDADE_SEMANAL[inicio.weekday] ?? [];
  return intervalos.some((iv) => {
    const [hi, mi] = iv.inicio.split(':').map(Number);
    const [hf, mf] = iv.fim.split(':').map(Number);
    const ivInicio = inicio.set({ hour: hi, minute: mi, second: 0, millisecond: 0 });
    const ivFim = inicio.set({ hour: hf, minute: mf, second: 0, millisecond: 0 });
    return inicio >= ivInicio && fim <= ivFim;
  });
}
