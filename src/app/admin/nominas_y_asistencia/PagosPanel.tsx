"use client";

import React from "react";
import { Icon } from "../../../components/icons";

export interface Pago {
  clave: string;
  tipo: "raya" | "convenio";
  empleadoId: string;
  // raya: id del renglón de raya_detalle · convenio: id del pago ya hecho
  // (vacío mientras el mes siga pendiente).
  refId: string;
  mes?: string; // convenio: "YYYY-MM-01"
  empleadoNombre: string;
  color?: string | null;
  concepto: string;
  monto: number;
  fecha: string; // "YYYY-MM-DD": fin de la semana o del mes
  pagado: boolean;
  fechaPago?: string | null;
}

const money = (n: number) =>
  (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const fechaCorta = (valor: string) => {
  const [y, m, d] = valor.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

// Lista de pagos por persona: cada renglón es un pago (una semana de raya o un
// mes de beca de convenio) con su botón de pagar.
export function PagosPanel({
  pagos,
  vista,
  ocupadoClave,
  onPagar,
  onDeshacer,
  onPagarTodo,
}: {
  pagos: Pago[];
  vista: "porPagar" | "pagados";
  ocupadoClave: string | null;
  onPagar: (p: Pago) => void;
  onDeshacer: (p: Pago) => void;
  onPagarTodo: (lista: Pago[]) => void;
}) {
  const porPagar = vista === "porPagar";
  const lista = pagos
    .filter((p) => p.pagado === !porPagar)
    .sort((a, b) =>
      porPagar
        ? a.fecha.localeCompare(b.fecha) ||
          a.empleadoNombre.localeCompare(b.empleadoNombre, "es")
        : (b.fechaPago || "").localeCompare(a.fechaPago || ""),
    );
  const total = lista.reduce((s, p) => s + p.monto, 0);

  if (lista.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-center px-4">
        <span className="text-[12px] text-slate-400 italic">
          {porPagar
            ? "No hay pagos pendientes. Todo al día."
            : "Aún no hay pagos registrados."}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {porPagar && lista.length > 1 && (
        <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
          <span className="text-[11px] text-slate-600">
            {lista.length} pagos pendientes ·{" "}
            <strong className="text-slate-900">{money(total)}</strong>
          </span>
          <button
            type="button"
            onClick={() => onPagarTodo(lista)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded-lg cursor-pointer"
          >
            <Icon name="check-circle" size={13} /> Pagar todo
          </button>
        </div>
      )}

      {lista.map((p) => (
        <div
          key={p.clave}
          className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 py-1.5"
        >
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
            style={{ backgroundColor: p.color || "#64748b" }}
          >
            {iniciales(p.empleadoNombre)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-slate-800 truncate">
              {p.empleadoNombre}
            </div>
            <div className="text-[10.5px] text-slate-500 flex items-center gap-1 flex-wrap">
              <span
                className={`text-[9px] font-bold px-1 py-0.5 rounded-full border ${
                  p.tipo === "raya"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-violet-50 text-violet-700 border-violet-200"
                }`}
              >
                {p.tipo === "raya" ? "Raya" : "Beca mensual"}
              </span>
              {p.concepto}
              {porPagar
                ? ` · desde ${fechaCorta(p.fecha)}`
                : p.fechaPago
                  ? ` · pagado el ${fechaCorta(p.fechaPago)}`
                  : ""}
            </div>
          </div>
          <span className="shrink-0 text-[13px] font-extrabold text-slate-900 tabular-nums">
            {money(p.monto)}
          </span>
          {porPagar ? (
            <button
              type="button"
              disabled={ocupadoClave === p.clave}
              onClick={() => onPagar(p)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-2 py-1 rounded-lg cursor-pointer"
            >
              <Icon name="banknote" size={13} /> Pagar
            </button>
          ) : (
            <button
              type="button"
              disabled={ocupadoClave === p.clave}
              onClick={() => onDeshacer(p)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 px-2 py-1 rounded-lg cursor-pointer"
            >
              <Icon name="undo" size={13} /> Deshacer
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
