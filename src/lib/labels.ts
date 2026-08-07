const orderLabels: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  delivered: 'Entregado',
};

const quoteLabels: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  expired: 'Vencido',
};

export function getStatusLabel(status: string): string {
  return orderLabels[status] ?? quoteLabels[status] ?? status;
}