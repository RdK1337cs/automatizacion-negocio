import { getDeposito, getPuntoVenta } from './pos';
import { getBase } from './catalogo';

export interface ContextNames {
  posId: number;
  baseId: number;
  depositoId: number;
  pos: string;
  base: string;
  deposito: string;
  label: string;
}

export function nameOf(posId: number, baseId: number, depositoId: number): ContextNames {
  let posName = `POS #${posId}`;
  let baseName = `Base #${baseId}`;
  let depositoName = `Depósito #${depositoId}`;
  try {
    posName = getPuntoVenta(posId).name;
  } catch {
    /* noop */
  }
  try {
    baseName = getBase(baseId).name;
  } catch {
    /* noop */
  }
  try {
    depositoName = getDeposito(depositoId).name;
  } catch {
    /* noop */
  }
  return {
    posId,
    baseId,
    depositoId,
    pos: posName,
    base: baseName,
    deposito: depositoName,
    label: `${posName} · ${baseName} · ${depositoName}`,
  };
}