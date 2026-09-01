// Paleta única de colores para trabajadores. La usa el Calendario de Revisiones
// para pintar tarjetas/popover/badges y el Panel Principal para pre-asignar un
// color libre al registrar un nuevo integrante (así no se repiten y el calendario
// respeta el color guardado sin tener que reasignarlo por colisión).

export const PALETA_EMPLEADOS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
  "#0d9488",
  "#9333ea",
  "#e11d48",
  "#059669",
  "#c026d3",
  "#ca8a04",
  "#0284c7",
  "#b45309",
];

// Celeste "sin color" heredado — se trata como no asignado.
export const COLOR_DEFECTO = "#0ea5e9";

const norm = (c?: string | null) => (c || "").trim().toLowerCase();

// Primer color de la paleta que nadie más use (case-insensitive). Si están todos
// tomados, genera un tono estable por ángulo áureo a partir de `semilla`.
export function colorLibreEmpleado(
  usados: (string | null | undefined)[],
  semilla = 0,
): string {
  const tomados = new Set(
    usados.map(norm).filter((c) => c && c !== COLOR_DEFECTO),
  );
  const libre = PALETA_EMPLEADOS.find((c) => !tomados.has(c.toLowerCase()));
  if (libre) return libre;
  return `hsl(${Math.round((semilla * 137.508) % 360)} 68% 45%)`;
}
