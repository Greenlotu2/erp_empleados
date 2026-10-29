// Pagos de Nóminas y Asistencia:
//  - Trabajadores (planta): raya semanal, se paga cada sábado.
//  - Prácticas y convenios: una beca al mes, por ciclos que corren desde el día
//    en que empezó su contrato (empezó el 10 → se le paga cada 10), con el
//    monto del contrato.

// Primer vencimiento que maneja el sistema: ciclos que vencieron antes se dan
// por pagados y no aparecen como pendientes.
export const INICIO_PAGOS_CONVENIO = "2026-10-01";

// "$3000 MXN / mes" → 3000. "Sin Apoyo" o vacío → 0.
export function montoMensual(texto?: string | null): number {
  const m = (texto || "").match(/\$?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

// "YYYY-MM-DD" + n meses, conservando el día del mes de la fecha original (si el
// mes destino es más corto cae en su último día: 31 ene + 1 mes = 28 feb).
export function sumaMeses(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dia = Math.min(d, new Date(anio, mes, 0).getDate());
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

const diaAnterior = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${dosDigitos(dt.getMonth() + 1)}-${dosDigitos(dt.getDate())}`;
};

const dmy = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
};

// "10/10/2026 – 09/11/2026": el periodo que cubre un ciclo que empieza en `inicio`.
export function rangoCiclo(inicio: string) {
  return `${dmy(inicio)} – ${dmy(diaAnterior(sumaMeses(inicio, 1)))}`;
}

export interface CicloBeca {
  inicio: string; // primer día del ciclo (también es la clave del pago)
  vence: string; // día en que se paga: un mes después del inicio
}

// Ciclos de beca cuyo vencimiento cae entre INICIO_PAGOS_CONVENIO y `hasta`.
export function ciclosBeca(
  inicioContrato: string | null | undefined,
  hasta: string,
): CicloBeca[] {
  const base = (inicioContrato || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return [];
  const ciclos: CicloBeca[] = [];
  for (let k = 0; k < 240; k++) {
    const vence = sumaMeses(base, k + 1);
    if (vence > hasta) break;
    if (vence >= INICIO_PAGOS_CONVENIO) {
      ciclos.push({ inicio: sumaMeses(base, k), vence });
    }
  }
  return ciclos;
}

// Ciclos que ya vencieron (a `hoy`) y no tienen pago registrado.
export function ciclosAdeudados(
  inicioContrato: string | null | undefined,
  hoyYmd: string,
  pagados: Set<string>,
): CicloBeca[] {
  return ciclosBeca(inicioContrato, hoyYmd).filter(
    (c) => !pagados.has(c.inicio),
  );
}
