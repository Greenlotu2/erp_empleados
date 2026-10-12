// Las rutas /api/cron/* solo las puede disparar quien tenga CRON_SECRET:
// Vercel Cron lo manda solo como "Authorization: Bearer <CRON_SECRET>".
export function esCronAutorizado(req: Request) {
  const secreto = process.env.CRON_SECRET;
  return Boolean(secreto) && req.headers.get("authorization") === `Bearer ${secreto}`;
}

const DIA = 24 * 3600 * 1000;

// "YYYY-MM-DD" en hora de México (UTC-6 fijo) a `dias` de hoy.
export function fechaMx(dias = 0) {
  return new Date(Date.now() - 6 * 3600 * 1000 + dias * DIA).toISOString().slice(0, 10);
}

// Estados de una reunión que todavía va a ocurrir: "Programada" al crearla y
// "Ajuste por tiempo" cuando se movió o editó en el calendario.
export const REUNION_ACTIVA = ["Programada", "Ajuste por tiempo"];
