"use client";

import React, { useState } from "react";
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
  fecha: string; // "YYYY-MM-DD": día en que se debe pagar (editable)
  fechaBase: string; // el día que le toca por regla (sábado / aniversario)
  claveFecha: string; // clave en fechas_pago si se edita la fecha
  // Raya cuyo día de pago ya llegó pero aún no tiene días capturados.
  faltaCaptura?: boolean;
  semanaId?: string;
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
  onCambiarFecha,
  onCapturar,
}: {
  pagos: Pago[];
  vista: "porPagar" | "pagados";
  ocupadoClave: string | null;
  onPagar: (p: Pago) => void;
  onDeshacer: (p: Pago) => void;
  onPagarTodo: (lista: Pago[]) => void;
  onCambiarFecha: (p: Pago, fecha: string | null) => void;
  onCapturar: (p: Pago) => void;
}) {
  const [editandoFecha, setEditandoFecha] = useState<string | null>(null);
  const porPagar = vista === "porPagar";
  const lista = pagos
    .filter((p) => p.pagado === !porPagar)
    .sort((a, b) =>
      porPagar
        ? a.fecha.localeCompare(b.fecha) ||
          a.empleadoNombre.localeCompare(b.empleadoNombre, "es")
        : (b.fechaPago || "").localeCompare(a.fechaPago || ""),
    );

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

  // Los trabajadores cobran por semana y las prácticas/convenios por mes.
  const porCapturar = porPagar ? lista.filter((p) => p.faltaCaptura) : [];
  const secciones = [
    {
      titulo: "Semanal · trabajadores",
      vacio: porPagar
        ? "Sin raya semanal pendiente."
        : "Aún no hay rayas pagadas.",
      lista: lista.filter((p) => p.tipo === "raya" && !p.faltaCaptura),
    },
    {
      titulo: "Mensual · prácticas y convenios",
      vacio: porPagar ? "Sin becas pendientes." : "Aún no hay becas pagadas.",
      lista: lista.filter((p) => p.tipo === "convenio"),
    },
  ];

  const renglon = (p: Pago) => (
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
        <div className="text-[10.5px] text-slate-500">
          {p.concepto}
          {porPagar ? (
            editandoFecha === p.clave ? (
              <span className="inline-flex items-center gap-1 ml-1">
                <input
                  type="date"
                  autoFocus
                  value={p.fecha}
                  onChange={(e) => {
                    if (e.target.value) onCambiarFecha(p, e.target.value);
                  }}
                  onBlur={() => setEditandoFecha(null)}
                  className="border border-slate-300 rounded px-1 py-0 text-[10.5px] text-slate-800 outline-none focus:border-blue-500"
                />
                {p.fecha !== p.fechaBase && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onCambiarFecha(p, null);
                      setEditandoFecha(null);
                    }}
                    className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                  >
                    Restablecer
                  </button>
                )}
              </span>
            ) : (
              <>
                {" · vence "}
                <button
                  type="button"
                  title="Cambiar la fecha de pago"
                  onClick={() => setEditandoFecha(p.clave)}
                  className={`inline-flex items-center gap-0.5 hover:underline cursor-pointer ${
                    p.fecha < new Date().toISOString().slice(0, 10)
                      ? "text-red-600 font-semibold"
                      : "text-slate-700"
                  }`}
                >
                  {fechaCorta(p.fecha)}
                  {p.fecha !== p.fechaBase ? " (editada)" : ""}
                  <Icon name="pencil" size={10} />
                </button>
              </>
            )
          ) : p.fechaPago ? (
            ` · pagado el ${fechaCorta(p.fechaPago)}`
          ) : (
            ""
          )}
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
  );

  return (
    <div className="flex flex-col gap-3">
      {porCapturar.length > 0 && (
        <section className="flex flex-col gap-1">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-[11px] text-amber-800">
            <strong>Falta capturar la raya</strong> · {porCapturar.length}{" "}
            {porCapturar.length === 1 ? "persona" : "personas"}. Ya llegó su día
            de pago pero no tienen días capturados.
          </div>
          {porCapturar.map((p) => (
            <div
              key={p.clave}
              className="flex items-center gap-2 border border-amber-200 bg-amber-50/40 rounded-lg px-2 py-1.5"
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
                <div className="text-[10.5px] text-slate-500">
                  {p.concepto} · vence {fechaCorta(p.fecha)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onCapturar(p)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-white bg-amber-600 hover:bg-amber-700 px-2 py-1 rounded-lg cursor-pointer"
              >
                <Icon name="pencil" size={13} /> Capturar
              </button>
            </div>
          ))}
        </section>
      )}
      {secciones.map((sec) => {
        const subtotal = sec.lista.reduce((t, p) => t + p.monto, 0);
        return (
          <section key={sec.titulo} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
              <span className="text-[11px] text-slate-600 min-w-0">
                <strong className="text-slate-900">{sec.titulo}</strong> ·{" "}
                {sec.lista.length} {sec.lista.length === 1 ? "pago" : "pagos"} ·{" "}
                <strong className="text-slate-900">{money(subtotal)}</strong>
              </span>
              {porPagar && sec.lista.length > 1 && (
                <button
                  type="button"
                  onClick={() => onPagarTodo(sec.lista)}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded-lg cursor-pointer"
                >
                  <Icon name="check-circle" size={13} /> Pagar todo
                </button>
              )}
            </div>
            {sec.lista.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic px-1">
                {sec.vacio}
              </p>
            ) : (
              sec.lista.map(renglon)
            )}
          </section>
        );
      })}
    </div>
  );
}
