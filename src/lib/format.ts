export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function money(amount: number, currency = 'ARS'): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$ ${amount.toFixed(2)}`;
  }
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  return iso.replace('T', ' ').slice(0, 19);
}

export function plural(n: number): string {
  return n === 1 ? 'unidad' : 'unidades';
}