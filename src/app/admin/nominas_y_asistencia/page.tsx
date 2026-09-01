"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "../../../components/Sidebar";
import { Icon } from "../../../components/icons";
import { ModalOverlay } from "../../../components/ModalOverlay";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentAdminId } from "../../../lib/currentAdmin";

interface Empleado {
  id: string;
  nombre: string;
  color?: string | null;
  area?: string | null;
  nivel?: string | null;
  rol?: string | null;
}

// "Convenio" = practicante / servicio social: llevan horas, no reciben raya semanal.
const ROLES_CONVENIO = ["Practicante", "Servicio Social"];
const esConvenio = (e?: Empleado | null) =>
  !!e && ROLES_CONVENIO.includes(e.rol || "");

interface RayaSemana {
  id: string;
  semana_inicio: string;
  estado: string;
  nota?: string | null;
  created_at: string;
}

interface RayaDetalle {
  id: string;
  semana_id: string;
  empleado_id: string;
  dias_trabajados: number;
  pago_dia: number;
  extras: number;
  descuentos: number;
  asistencia: Record<string, boolean> | null;
  nota?: string | null;
  total: number;
}

const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
const DIAS_LABEL: Record<string, string> = {
  lun: "L",
  mar: "A",
  mie: "M",
  jue: "J",
  vie: "V",
  sab: "S",
  dom: "D",
};
const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

const money = (n: number) =>
  (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

// "YYYY-MM-DD" -> lunes de esa semana, sin conversión de zona horaria.
const lunesDe = (fecha: string) => {
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const diff = dt.getDay() === 0 ? -6 : 1 - dt.getDay();
  dt.setDate(dt.getDate() + diff);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

const fmtRango = (semanaInicio: string) => {
  const [y, m, d] = semanaInicio.split("-").map(Number);
  const ini = new Date(y, m - 1, d);
  const fin = new Date(y, m - 1, d + 6);
  const mismoMes = ini.getMonth() === fin.getMonth();
  return mismoMes
    ? `${ini.getDate()}–${fin.getDate()} ${MESES[ini.getMonth()]} ${ini.getFullYear()}`
    : `${ini.getDate()} ${MESES[ini.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`;
};

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const totalFila = (d: {
  dias_trabajados: number;
  pago_dia: number;
  extras: number;
  descuentos: number;
}) =>
  (Number(d.dias_trabajados) || 0) * (Number(d.pago_dia) || 0) +
  (Number(d.extras) || 0) -
  (Number(d.descuentos) || 0);

export default function NominasAsistenciaPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [plantillaIds, setPlantillaIds] = useState<string[]>([]);
  const [semanas, setSemanas] = useState<RayaSemana[]>([]);
  const [detallePorSemana, setDetallePorSemana] = useState<
    Record<string, RayaDetalle[]>
  >({});
  const [expandidaId, setExpandidaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  const [nuevaSemanaOpen, setNuevaSemanaOpen] = useState(false);
  const [nuevaSemanaFecha, setNuevaSemanaFecha] = useState("");
  const [creandoSemana, setCreandoSemana] = useState(false);
  const [altaOpen, setAltaOpen] = useState(false);
  const [altaEmpId, setAltaEmpId] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    titulo: string;
    mensaje: string;
    onConfirmar: () => void;
  } | null>(null);

  useEffect(() => {
    getCurrentAdminId().then(setCurrentAdminId);
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [
        { data: empData },
        { data: plData },
        { data: semData },
        { data: detData },
      ] = await Promise.all([
        (supabase.from("empleados") as any)
          .select("id, nombre, color, area, nivel, rol")
          .order("nombre"),
        (supabase.from("raya_plantilla") as any).select("empleado_id"),
        (supabase.from("raya_semanas") as any)
          .select("*")
          .order("semana_inicio", { ascending: false }),
        (supabase.from("raya_detalle") as any).select("*"),
      ]);
      setEmpleados(empData || []);
      setPlantillaIds((plData || []).map((r: any) => r.empleado_id));
      setSemanas(semData || []);
      const map: Record<string, RayaDetalle[]> = {};
      (detData || []).forEach((r: any) => {
        (map[r.semana_id] ||= []).push(r);
      });
      setDetallePorSemana(map);
    } catch (err) {
      console.error("Error cargando Nóminas y Asistencia:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const plantilla = plantillaIds
    .map((id) => empleados.find((e) => e.id === id))
    .filter((e): e is Empleado => Boolean(e));
  // El picker de ALTA solo ofrece personal pagable (excluye convenio).
  const fueraDePlantilla = empleados.filter(
    (e) => !plantillaIds.includes(e.id) && !esConvenio(e),
  );
  // Personal de convenio (no recibe raya) — se lista aparte, solo informativo.
  const personalConvenio = empleados.filter(esConvenio);

  const totalDeSemana = (semanaId: string) =>
    (detallePorSemana[semanaId] || []).reduce((s, d) => s + totalFila(d), 0);
  const semanasEmitidas = semanas.filter((s) => s.estado === "Emitida");
  const gastoAcumulado = semanasEmitidas.reduce(
    (s, sem) => s + totalDeSemana(sem.id),
    0,
  );
  const gastoTotalTodo = semanas.reduce(
    (s, sem) => s + totalDeSemana(sem.id),
    0,
  );

  // --- Handlers ---
  const handleAltaPlantilla = async () => {
    if (!altaEmpId) return;
    setPlantillaIds((prev) => [...prev, altaEmpId]);
    setAltaEmpId("");
    setAltaOpen(false);
    try {
      const { error } = await (supabase.from("raya_plantilla") as any).insert({
        empleado_id: altaEmpId,
      });
      if (error) throw error;
    } catch (err: any) {
      alert("No se pudo agregar a la plantilla: " + (err.message || "Error"));
      await fetchAll();
    }
  };

  const handleQuitarPlantilla = async (empId: string) => {
    setPlantillaIds((prev) => prev.filter((id) => id !== empId));
    try {
      const { error } = await (supabase.from("raya_plantilla") as any)
        .delete()
        .eq("empleado_id", empId);
      if (error) throw error;
    } catch (err: any) {
      alert("No se pudo quitar de la plantilla: " + (err.message || "Error"));
      await fetchAll();
    }
  };

  const handleNuevaSemana = async () => {
    if (!nuevaSemanaFecha) return;
    const semanaInicio = lunesDe(nuevaSemanaFecha);
    if (semanas.some((s) => s.semana_inicio === semanaInicio)) {
      alert("Ya existe una lista de raya para esa semana.");
      return;
    }
    try {
      setCreandoSemana(true);
      const { data: sem, error } = await (supabase.from("raya_semanas") as any)
        .insert({
          semana_inicio: semanaInicio,
          estado: "Borrador",
          creado_por: currentAdminId,
        })
        .select("*")
        .single();
      if (error) throw error;

      if (plantillaIds.length > 0) {
        const filas = plantillaIds.map((empId) => ({
          semana_id: sem.id,
          empleado_id: empId,
          dias_trabajados: 0,
          pago_dia: 0,
          extras: 0,
          descuentos: 0,
        }));
        const { error: detErr } = await (
          supabase.from("raya_detalle") as any
        ).insert(filas);
        if (detErr) throw detErr;
      }

      setNuevaSemanaOpen(false);
      setNuevaSemanaFecha("");
      await fetchAll();
      setExpandidaId(sem.id);
    } catch (err: any) {
      alert("No se pudo crear la semana: " + (err.message || "Error"));
    } finally {
      setCreandoSemana(false);
    }
  };

  const patchDetalleLocal = (
    semanaId: string,
    detId: string,
    cambios: Partial<RayaDetalle>,
  ) => {
    setDetallePorSemana((prev) => ({
      ...prev,
      [semanaId]: (prev[semanaId] || []).map((d) =>
        d.id === detId ? { ...d, ...cambios } : d,
      ),
    }));
  };

  // Normaliza el valor de un campo numérico: nunca negativo, y los días topados en 7.
  const clampCampo = (campo: string, raw: number) => {
    const n = Number.isFinite(raw) ? raw : 0;
    if (campo === "dias_trabajados") return Math.min(7, Math.max(0, n));
    return Math.max(0, n);
  };

  const handleGuardarFila = async (
    semanaId: string,
    det: RayaDetalle,
    campo: keyof RayaDetalle,
  ) => {
    const valor = clampCampo(campo as string, Number((det as any)[campo]));
    // Refleja el clamp en la UI antes de persistir.
    patchDetalleLocal(semanaId, det.id, { [campo]: valor } as any);
    try {
      const { data, error } = await (supabase.from("raya_detalle") as any)
        .update({ [campo]: valor })
        .eq("id", det.id)
        .select("*")
        .single();
      if (error) throw error;
      patchDetalleLocal(semanaId, det.id, { total: data.total });
    } catch (err: any) {
      alert("No se pudo guardar: " + (err.message || "Error"));
      await fetchAll();
    }
  };

  const toggleDia = async (semanaId: string, det: RayaDetalle, dia: string) => {
    const prev = det.asistencia || {};
    const asistencia = { ...prev, [dia]: !prev[dia] };
    const dias = DIAS.filter((d) => asistencia[d]).length;
    patchDetalleLocal(semanaId, det.id, { asistencia, dias_trabajados: dias });
    try {
      const { data, error } = await (supabase.from("raya_detalle") as any)
        .update({ asistencia, dias_trabajados: dias })
        .eq("id", det.id)
        .select("total")
        .single();
      if (error) throw error;
      if (data) patchDetalleLocal(semanaId, det.id, { total: data.total });
    } catch (err: any) {
      // Revertir el toggle local si la BD lo rechazó.
      patchDetalleLocal(semanaId, det.id, {
        asistencia: prev,
        dias_trabajados: DIAS.filter((d) => prev[d]).length,
      });
      alert("No se pudo guardar la asistencia: " + (err.message || "Error"));
    }
  };

  const cambiarEstadoSemana = async (sem: RayaSemana, estado: string) => {
    setSemanas((prev) =>
      prev.map((s) => (s.id === sem.id ? { ...s, estado } : s)),
    );
    try {
      const { error } = await (supabase.from("raya_semanas") as any)
        .update({ estado })
        .eq("id", sem.id);
      if (error) throw error;
    } catch (err: any) {
      alert("No se pudo cambiar el estado: " + (err.message || "Error"));
      await fetchAll();
    }
  };

  const handleEliminarSemana = async (sem: RayaSemana) => {
    setSemanas((prev) => prev.filter((s) => s.id !== sem.id));
    if (expandidaId === sem.id) setExpandidaId(null);
    try {
      const { error } = await (supabase.from("raya_semanas") as any)
        .delete()
        .eq("id", sem.id);
      if (error) throw error;
    } catch (err: any) {
      alert("No se pudo eliminar: " + (err.message || "Error"));
      await fetchAll();
    }
  };

  const exportarCSV = (sem: RayaSemana) => {
    const filas = detallePorSemana[sem.id] || [];
    const head = [
      "Colaborador",
      "Dias",
      "Pago/dia",
      "Extras",
      "Descuentos",
      "Total",
    ];
    const lineas = filas.map((d) => {
      const emp = empleados.find((e) => e.id === d.empleado_id);
      return [
        (emp?.nombre || "—").replace(/"/g, "'"),
        d.dias_trabajados,
        d.pago_dia,
        d.extras,
        d.descuentos,
        totalFila(d),
      ].join(",");
    });
    const csv = [
      `Raya semana ${fmtRango(sem.semana_inicio)}`,
      head.join(","),
      ...lineas,
      `,,,,Total,${totalDeSemana(sem.id)}`,
    ].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raya_${sem.semana_inicio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const imprimirPDF = (sem: RayaSemana) => {
    setExpandidaId(sem.id);
    setTimeout(() => window.print(), 60);
  };

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #raya-print, #raya-print * { visibility: visible !important; }
          #raya-print { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
          .no-print { display: none !important; }
        }
      `}</style>
      <Sidebar />

      <main className="flex-1 flex flex-col p-1.5 md:p-2 overflow-hidden h-full min-w-0">
        {/* Encabezado */}
        <div className="shrink-0 mb-1.5 flex items-center justify-between flex-wrap gap-1 pb-1.5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Icon name="banknote" size={15} />
            </span>
            <div>
              <h1 className="m-0 text-[15px] font-semibold text-slate-900 tracking-tight leading-tight">
                Nóminas y Asistencia
              </h1>
              <p className="m-0 text-[11px] text-slate-500 leading-tight">
                Listas de raya semanal · toda la empresa
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNuevaSemanaOpen(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-[12px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            <Icon name="plus" size={14} />
            Nueva semana
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-xs font-bold text-slate-500 gap-1">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Cargando…
          </div>
        ) : (
          <>
            {/* Fila 1: resumen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 shrink-0 mb-2">
              <div className="bg-slate-900 text-white rounded-lg p-3">
                <span className="text-[10px] uppercase tracking-wider font-medium text-slate-400">
                  Gasto en raya acumulado
                </span>
                <div className="text-[22px] font-semibold text-emerald-400 leading-tight mt-1 tabular-nums">
                  {money(gastoAcumulado)}
                </div>
                <span className="text-[10px] text-slate-500">
                  Semanas emitidas · {money(gastoTotalTodo)} incl. borradores
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-slate-900">
                    Listas de raya emitidas
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Semanas cerradas y auditadas.
                  </p>
                </div>
                <span className="shrink-0 text-lg font-semibold text-blue-700 bg-blue-50 rounded-lg px-3 py-1 tabular-nums">
                  {semanasEmitidas.length}
                </span>
              </div>
            </div>

            {/* Fila 2: historial + plantilla */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 flex-1 min-h-0">
              {/* Historial */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-2 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between gap-1 shrink-0 pb-1.5 border-b border-slate-100">
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-slate-900">
                      Historial Agrupado por Semanas
                    </div>
                    <p className="text-[10.5px] text-slate-400">
                      Clic en una semana para ver el desglose.
                    </p>
                  </div>
                  {expandidaId && (
                    <div className="flex items-center gap-1 shrink-0 no-print">
                      <button
                        type="button"
                        onClick={() => {
                          const s = semanas.find((x) => x.id === expandidaId);
                          if (s) exportarCSV(s);
                        }}
                        className="text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg cursor-pointer transition-colors"
                      >
                        Exportar Raya
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const s = semanas.find((x) => x.id === expandidaId);
                          if (s) imprimirPDF(s);
                        }}
                        className="text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 px-2 py-1 rounded-lg cursor-pointer transition-colors"
                      >
                        Imprimir PDF
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 pt-1.5 space-y-1">
                  {semanas.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center px-4">
                      <span className="text-[12px] text-slate-400 italic">
                        No hay reportes de nómina o asistencia registrados.
                      </span>
                    </div>
                  ) : (
                    semanas.map((sem) => {
                      const abierta = expandidaId === sem.id;
                      const filas = detallePorSemana[sem.id] || [];
                      const bloqueada = sem.estado === "Emitida";
                      return (
                        <div
                          key={sem.id}
                          className="border border-slate-200 rounded-lg overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandidaId(abierta ? null : sem.id)
                            }
                            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <Icon
                                name="chevron-right"
                                size={14}
                                className={`text-slate-400 transition-transform ${abierta ? "rotate-90" : ""}`}
                              />
                              <span className="text-[12px] font-bold text-slate-800 truncate">
                                {fmtRango(sem.semana_inicio)}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1 py-0.5 rounded-full border ${
                                  bloqueada
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}
                              >
                                {sem.estado}
                              </span>
                            </span>
                            <span className="shrink-0 text-[12px] font-extrabold text-slate-900">
                              {money(totalDeSemana(sem.id))}
                            </span>
                          </button>

                          {abierta && (
                            <div
                              id="raya-print"
                              className="border-t border-slate-100 p-1.5"
                            >
                              <div className="hidden print:block mb-2 text-sm font-bold">
                                Raya · {fmtRango(sem.semana_inicio)}
                              </div>
                              {filas.length === 0 ? (
                                <p className="text-[11px] text-slate-400 py-2 text-center">
                                  No hay personal en la plantilla. Agrega
                                  colaboradores en "Plantilla Oficial".
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-[11px] border-collapse">
                                    <thead>
                                      <tr className="text-[9.5px] uppercase text-slate-400 text-left">
                                        <th className="py-1 pr-2 font-semibold">
                                          Colaborador
                                        </th>
                                        <th className="py-1 px-1 font-semibold text-center">
                                          Asistencia
                                        </th>
                                        <th className="py-1 px-1 font-semibold w-12">
                                          Días
                                        </th>
                                        <th className="py-1 px-1 font-semibold w-16">
                                          Pago/día
                                        </th>
                                        <th className="py-1 px-1 font-semibold w-16">
                                          Extras
                                        </th>
                                        <th className="py-1 px-1 font-semibold w-16">
                                          Desc.
                                        </th>
                                        <th className="py-1 pl-1 font-semibold text-right w-20">
                                          Total
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {filas.map((d) => {
                                        const emp = empleados.find(
                                          (e) => e.id === d.empleado_id,
                                        );
                                        return (
                                          <tr
                                            key={d.id}
                                            className="border-t border-slate-100"
                                          >
                                            <td className="py-1 pr-2">
                                              <span className="flex items-center gap-1.5">
                                                <span
                                                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                                                  style={{
                                                    backgroundColor:
                                                      emp?.color || "#64748b",
                                                  }}
                                                >
                                                  {iniciales(
                                                    emp?.nombre || "?",
                                                  )}
                                                </span>
                                                <span className="font-semibold text-slate-800 truncate">
                                                  {emp?.nombre || "—"}
                                                </span>
                                              </span>
                                            </td>
                                            <td className="py-1 px-1">
                                              <span className="flex items-center gap-0.5 justify-center no-print">
                                                {DIAS.map((dia) => (
                                                  <button
                                                    key={dia}
                                                    type="button"
                                                    disabled={bloqueada}
                                                    onClick={() =>
                                                      toggleDia(sem.id, d, dia)
                                                    }
                                                    className={`w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center transition-colors ${
                                                      d.asistencia?.[dia]
                                                        ? "bg-blue-600 text-white"
                                                        : "bg-slate-100 text-slate-400"
                                                    } ${bloqueada ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-blue-100"}`}
                                                  >
                                                    {DIAS_LABEL[dia]}
                                                  </button>
                                                ))}
                                              </span>
                                            </td>
                                            {(
                                              [
                                                "dias_trabajados",
                                                "pago_dia",
                                                "extras",
                                                "descuentos",
                                              ] as const
                                            ).map((campo) => (
                                              <td
                                                key={campo}
                                                className="py-1 px-1"
                                              >
                                                <input
                                                  type="number"
                                                  min="0"
                                                  max={
                                                    campo === "dias_trabajados"
                                                      ? 7
                                                      : undefined
                                                  }
                                                  step={
                                                    campo === "dias_trabajados"
                                                      ? "0.5"
                                                      : "1"
                                                  }
                                                  disabled={bloqueada}
                                                  value={(d as any)[campo] ?? 0}
                                                  onChange={(e) =>
                                                    patchDetalleLocal(
                                                      sem.id,
                                                      d.id,
                                                      {
                                                        [campo]:
                                                          e.target.value === ""
                                                            ? 0
                                                            : Number(
                                                                e.target.value,
                                                              ),
                                                      } as any,
                                                    )
                                                  }
                                                  onBlur={() =>
                                                    handleGuardarFila(
                                                      sem.id,
                                                      d,
                                                      campo,
                                                    )
                                                  }
                                                  className="w-full bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-[11px] text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-60"
                                                />
                                              </td>
                                            ))}
                                            <td className="py-1 pl-1 text-right font-extrabold text-slate-900">
                                              {money(totalFila(d))}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-slate-200">
                                        <td
                                          colSpan={6}
                                          className="py-1 pr-2 text-right text-[10px] uppercase font-bold text-slate-400"
                                        >
                                          Total de la semana
                                        </td>
                                        <td className="py-1 pl-1 text-right text-[13px] font-extrabold text-emerald-600">
                                          {money(totalDeSemana(sem.id))}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}

                              <div className="flex items-center justify-end gap-1 pt-1.5 mt-1 border-t border-slate-100 no-print">
                                {bloqueada ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      cambiarEstadoSemana(sem, "Borrador")
                                    }
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg cursor-pointer"
                                  >
                                    <Icon name="undo" size={13} /> Reabrir
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      cambiarEstadoSemana(sem, "Emitida")
                                    }
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded-lg cursor-pointer"
                                  >
                                    <Icon name="check" size={13} /> Emitir
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDialog({
                                      titulo: "Eliminar semana",
                                      mensaje: `¿Eliminar la lista de raya de ${fmtRango(sem.semana_inicio)}? Se borra también su desglose.`,
                                      onConfirmar: () =>
                                        handleEliminarSemana(sem),
                                    })
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg cursor-pointer"
                                >
                                  <Icon name="trash" size={13} /> Eliminar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Plantilla Oficial */}
              <div className="bg-white border border-slate-200 rounded-lg p-2 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between gap-1 shrink-0 pb-1.5 border-b border-slate-100">
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-slate-900">
                      Plantilla Oficial
                    </div>
                    <p className="text-[10.5px] text-slate-400">
                      Personal activo asignado · {plantilla.length}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAltaOpen((v) => !v)}
                    className="shrink-0 inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                  >
                    <Icon name="user-plus" size={13} />
                    Alta
                  </button>
                </div>

                {altaOpen && (
                  <div className="flex gap-1 py-1.5 shrink-0 border-b border-slate-100">
                    <select
                      value={altaEmpId}
                      onChange={(e) => setAltaEmpId(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-50 border border-slate-200 text-slate-700 text-[11px] py-1 px-1 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">Elegir persona…</option>
                      {fueraDePlantilla.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                          {e.rol ? ` · ${e.rol}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAltaPlantilla}
                      disabled={!altaEmpId}
                      className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white text-[11px] font-semibold px-2 py-1 rounded-lg cursor-pointer transition-colors"
                    >
                      Agregar
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto min-h-0 pt-1.5 flex flex-col gap-0.5">
                  {plantilla.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic px-1 py-2 text-center">
                      Sin personal en la plantilla todavía.
                    </span>
                  ) : (
                    plantilla.map((e) => {
                      const convenio = esConvenio(e);
                      return (
                        <div
                          key={e.id}
                          className="group flex items-center gap-1.5 px-1 py-1 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          <span
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: e.color || "#64748b" }}
                          >
                            {iniciales(e.nombre)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[12px] font-medium text-slate-800 truncate">
                              {e.nombre}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-[9.5px] text-slate-400 truncate">
                                {e.rol || e.area || e.nivel || "—"}
                              </span>
                              {convenio && (
                                <span className="text-[8px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1 py-0 shrink-0">
                                  SIN RAYA
                                </span>
                              )}
                            </span>
                          </span>
                          <button
                            type="button"
                            title="Quitar de la plantilla"
                            onClick={() =>
                              setConfirmDialog({
                                titulo: "Quitar de la plantilla",
                                mensaje: `¿Quitar a ${e.nombre} de la plantilla oficial? No afecta las semanas ya registradas.`,
                                onConfirmar: () => handleQuitarPlantilla(e.id),
                              })
                            }
                            className="shrink-0 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5"
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })
                  )}

                  {personalConvenio.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                      <span className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wide px-1 pb-1">
                        Convenio · no reciben raya ({personalConvenio.length})
                      </span>
                      {personalConvenio.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center gap-1.5 px-1 py-0.5 opacity-70"
                        >
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                            style={{ backgroundColor: e.color || "#94a3b8" }}
                          >
                            {iniciales(e.nombre)}
                          </span>
                          <span className="flex-1 min-w-0 text-[11px] text-slate-500 truncate">
                            {e.nombre}
                          </span>
                          <span className="text-[9px] text-slate-400 shrink-0">
                            {e.rol}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Modal: nueva semana */}
      {nuevaSemanaOpen && (
        <ModalOverlay onClose={() => setNuevaSemanaOpen(false)}>
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-[13px] font-semibold text-slate-900">
                Nueva lista de raya
              </h3>
              <button
                onClick={() => {
                  setNuevaSemanaOpen(false);
                  setNuevaSemanaFecha("");
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="text-xs">
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Semana (cualquier día de esa semana)
              </label>
              <input
                type="date"
                value={nuevaSemanaFecha}
                onChange={(e) => setNuevaSemanaFecha(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {nuevaSemanaFecha && (
                <p className="mt-1 text-[10.5px] text-slate-400">
                  Se registrará la semana {fmtRango(lunesDe(nuevaSemanaFecha))}{" "}
                  · {plantillaIds.length} colaborador(es) de la plantilla.
                </p>
              )}
            </div>
            <div className="flex gap-1 pt-1.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setNuevaSemanaOpen(false);
                  setNuevaSemanaFecha("");
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleNuevaSemana}
                disabled={creandoSemana || !nuevaSemanaFecha}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white py-1.5 rounded-xl font-bold cursor-pointer text-xs"
              >
                {creandoSemana ? "Creando…" : "Crear semana"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: confirmación */}
      {confirmDialog && (
        <ModalOverlay onClose={() => setConfirmDialog(null)}>
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-[13px] font-semibold text-slate-900">
                {confirmDialog.titulo}
              </h3>
              <button
                onClick={() => setConfirmDialog(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-600">{confirmDialog.mensaje}</p>
            <div className="flex gap-1 pt-1.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirmar();
                  setConfirmDialog(null);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded-xl font-bold cursor-pointer text-xs"
              >
                Sí, continuar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
