// Pagos de Nóminas y Asistencia: la raya semanal se paga por persona y los
// convenios (Prácticas, Servicio Social, JCF) reciben su beca una vez al mes,
// con el monto del contrato.

// Primer mes que maneja el sistema: meses anteriores se dan por pagados y no
// aparecen como pendientes.
export const INICIO_PAGOS_CONVENIO = "2026-10";

const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// "$3000 MXN / mes" → 3000. "Sin Apoyo" o vacío → 0.
export function montoMensual(texto?: string | null): number {
  const m = (texto || "").match(/\$?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// "2026-09-01" → "septiembre 2026".
export function nombreMes(mesYmd: string) {
  const [y, m] = mesYmd.split("-").map(Number);
  return `${MESES_LARGOS[m - 1]} ${y}`;
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

// Último día del mes de "YYYY-MM-DD" (o "YYYY-MM") como "YYYY-MM-DD".
export function ultimoDiaDelMes(mesYmd: string) {
  const [y, m] = mesYmd.split("-").map(Number);
  return `${y}-${dosDigitos(m)}-${dosDigitos(new Date(y, m, 0).getDate())}`;
}

// Meses (como "YYYY-MM-01") que ya terminaron, desde el inicio del contrato o el
// primer mes del sistema (lo que sea posterior), y que no tienen pago.
export function mesesAdeudados(
  inicioContrato: string | null | undefined,
  hoyYmd: string,
  mesesPagados: Set<string>,
): string[] {
  const desde = [INICIO_PAGOS_CONVENIO, (inicioContrato || "").slice(0, 7)]
    .filter(Boolean)
    .sort()
    .pop()!;
  let [y, m] = desde.split("-").map(Number);
  const meses: string[] = [];
  for (let i = 0; i < 60; i++) {
    const mes = `${y}-${dosDigitos(m)}-01`;
    if (ultimoDiaDelMes(mes) > hoyYmd) break;
    if (!mesesPagados.has(mes)) meses.push(mes);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return meses;
}
