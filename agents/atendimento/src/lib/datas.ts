import { DateTime, Duration } from 'luxon';
import { config } from '../config.ts';

export const TZ = config.APP_TIMEZONE;

export const agora = () => DateTime.now().setZone(TZ);

export const parseISO = (s: string) => DateTime.fromISO(s, { zone: TZ });

export const parseFormato = (s: string, formato: string) =>
  DateTime.fromFormat(s, formato, { zone: TZ });

export const formatarISO = (dt: DateTime) => dt.setZone(TZ).toISO();

export const formatarHumano = (dt: DateTime) =>
  dt.setZone(TZ).setLocale('pt-BR').toFormat("cccc, dd 'de' LLLL 'às' HH:mm");

export const adicionar = (dt: DateTime, dur: Duration | Parameters<typeof Duration.fromObject>[0]) =>
  dt.plus(dur instanceof Duration ? dur : Duration.fromObject(dur));

export const diferencaMinutos = (a: DateTime, b: DateTime) =>
  a.diff(b, 'minutes').minutes;

export { DateTime, Duration };
