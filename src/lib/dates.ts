// Formatea una fecha límite (columna que a veces llega como "YYYY-MM-DD" y a veces
// como timestamp completo, ej. "2026-08-17T00:00:00+00:00") a "DD/MM/YYYY" sin pasar
// por `new Date(...)`. Parsear con Date interpreta la fecha en UTC y puede mostrar un
// día antes en zonas horarias negativas (México y similares) — con substring no hay
// conversión de zona horaria de por medio, así que nunca se corre.
export function formatFechaLimite(value?: string | null): string {
  if (!value) return '';
  const soloFecha = value.slice(0, 10); // "YYYY-MM-DD"
  const partes = soloFecha.split('-');
  if (partes.length !== 3) return value;
  const [yyyy, mm, dd] = partes;
  return `${dd}/${mm}/${yyyy}`;
}
