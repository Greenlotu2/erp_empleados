"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Sidebar from "../../../components/Sidebar";
import { Icon } from "../../../components/icons";
import { supabase } from "../../../lib/supabase";
import { formatFechaLimite } from "../../../lib/dates";

interface Tarea {
  id: string;
  proyecto: string;
  titulo: string;
  responsable: string | null;
  estado: string;
  fechaLimite: string | null;
  porcentajeAvance: number;
}

type Motivo =
  | { tipo: "atrasada"; diasAtraso: number }
  | { tipo: "esperando_aprobacion" }
  | { tipo: "reagendada" }
  | { tipo: "sin_asignar" }
  | { tipo: "por_vencer"; diasRestantes: number };

const MOTIVO_INFO: Record<
  Motivo["tipo"],
  { color: string; bg: string; border: string; dot: string; etiqueta: string }
> = {
  atrasada: {
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
    dot: "bg-rose-500",
    etiqueta: "Atrasada",
  },
  esperando_aprobacion: {
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    dot: "bg-purple-500",
    etiqueta: "Esperando aprobación",
  },
  reagendada: {
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    dot: "bg-amber-500",
    etiqueta: "Reagendada",
  },
  sin_asignar: {
    color: "text-slate-600",
    bg: "bg-slate-100",
    border: "border-slate-300",
    dot: "bg-slate-400",
    etiqueta: "Sin nadie asignado",
  },
  por_vencer: {
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    dot: "bg-yellow-500",
    etiqueta: "Por vencer pronto",
  },
};

// Compara fechas por sus componentes YYYY-MM-DD (evita el bug de zona horaria de
// `new Date(string)`, que puede correr el día en zonas negativas como México).
const diferenciaDias = (fechaLimite: string): number => {
  const [y, m, d] = fechaLimite.slice(0, 10).split("-").map(Number);
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const limiteUTC = Date.UTC(y, m - 1, d);
  return Math.round((limiteUTC - hoyUTC) / 86400000);
};

const getMotivo = (t: Tarea): Motivo | null => {
  // El estado real en la BD no siempre tiene la misma capitalización
  // ("Completada" vs "completada") — se normaliza igual que en la vista técnica.
  const estado = t.estado.toLowerCase();
  if (estado.includes("completa")) return null;
  if (t.fechaLimite) {
    const dias = diferenciaDias(t.fechaLimite);
    if (dias < 0) return { tipo: "atrasada", diasAtraso: -dias };
  }
  if (estado.includes("revisi")) return { tipo: "esperando_aprobacion" };
  if (estado.includes("posterga") || estado.includes("reagenda"))
    return { tipo: "reagendada" };
  if (!t.responsable) return { tipo: "sin_asignar" };
  if (t.fechaLimite) {
    const dias = diferenciaDias(t.fechaLimite);
    if (dias >= 0 && dias <= 3)
      return { tipo: "por_vencer", diasRestantes: dias };
  }
  return null;
};

const PRIORIDAD: Record<Motivo["tipo"], number> = {
  atrasada: 0,
  esperando_aprobacion: 1,
  reagendada: 2,
  sin_asignar: 3,
  por_vencer: 4,
};

export default function RutaCriticaSimplePage() {
  const [proyectos, setProyectos] = useState<string[]>(["Todos los Proyectos"]);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState(
    "Todos los Proyectos",
  );
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setCargando(true);

        const { data: proyData } = await supabase
          .from("proyectos")
          .select("nombre");
        if (proyData && proyData.length > 0) {
          setProyectos([
            "Todos los Proyectos",
            ...proyData.map((p: any) => p.nombre),
          ]);
        }

        const { data: tareasData, error } = await supabase.from("tareas")
          .select(`
            id, titulo, estado, fecha_limite, porcentaje_avance,
            empleados:empleados!tareas_empleado_id_fkey (nombre),
            proyectos (nombre)
          `);

        if (error) throw error;

        const mapeadas: Tarea[] = (tareasData || []).map((t: any) => ({
          id: t.id ? String(t.id) : `T-${Math.random()}`,
          proyecto: t.proyectos?.nombre || "General",
          titulo: t.titulo || "Tarea sin título",
          responsable: t.empleados?.nombre || null,
          estado: t.estado || "Pendiente",
          fechaLimite: t.fecha_limite || null,
          porcentajeAvance: t.porcentaje_avance ?? 0,
        }));

        setTareas(mapeadas);
      } catch (err) {
        console.error("Error cargando el estado del proyecto:", err);
      } finally {
        setCargando(false);
      }
    };

    fetchData();
  }, []);

  const tareasDelProyecto = tareas.filter(
    (t) =>
      proyectoSeleccionado === "Todos los Proyectos" ||
      t.proyecto.trim().toLowerCase() ===
        proyectoSeleccionado.trim().toLowerCase(),
  );

  const conMotivo = tareasDelProyecto
    .map((t) => ({ tarea: t, motivo: getMotivo(t) }))
    .filter((x): x is { tarea: Tarea; motivo: Motivo } => x.motivo !== null)
    .sort((a, b) => PRIORIDAD[a.motivo.tipo] - PRIORIDAD[b.motivo.tipo]);

  const totalTareas = tareasDelProyecto.length;
  const completadas = tareasDelProyecto.filter((t) =>
    t.estado.toLowerCase().includes("completa"),
  ).length;
  const avanceGeneral =
    totalTareas === 0 ? 0 : Math.round((completadas / totalTareas) * 100);
  const atrasadas = conMotivo.filter(
    (x) => x.motivo.tipo === "atrasada",
  ).length;
  const esperandoAprobacion = conMotivo.filter(
    (x) => x.motivo.tipo === "esperando_aprobacion",
  ).length;
  const sinAsignar = conMotivo.filter(
    (x) => x.motivo.tipo === "sin_asignar",
  ).length;
  const enOrden = totalTareas - completadas - conMotivo.length;

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      <Sidebar />

      <main className="flex-1 flex flex-col p-3 md:p-3 overflow-y-auto h-full min-w-0">
        {/* ENCABEZADO */}
        <header className="flex justify-between items-start mb-3 shrink-0 flex-wrap gap-1.5">
          <div>
            <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">
              ¿Cómo va el proyecto?
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Un vistazo simple a qué está bien y qué necesita tu atención.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={proyectoSeleccionado}
              onChange={(e) => setProyectoSeleccionado(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-1.5 py-1 text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            >
              {proyectos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <Link
              href="/admin/ruta-critica/tecnico"
              className="text-[11px] font-bold text-slate-400 hover:text-blue-600 whitespace-nowrap"
            >
              Ver diagrama técnico (Gantt) →
            </Link>
          </div>
        </header>

        {cargando ? (
          <div className="flex-1 flex items-center justify-center text-xs font-bold text-slate-500 gap-1">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            Revisando el proyecto...
          </div>
        ) : (
          <>
            {/* TARJETAS RESUMEN */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-3 shrink-0">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <p className="text-[11px] font-semibold text-slate-400">
                  Avance general
                </p>
                <h3 className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
                  {totalTareas === 0 ? "—" : `${avanceGeneral}%`}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {completadas} de {totalTareas} tareas completadas
                </p>
              </div>
              <div
                className={`bg-white p-2.5 rounded-lg border ${atrasadas > 0 ? "border-rose-200" : "border-slate-200"}`}
              >
                <p
                  className={`text-[11px] font-semibold ${atrasadas > 0 ? "text-rose-500" : "text-slate-400"}`}
                >
                  Atrasadas
                </p>
                <h3
                  className={`text-xl font-semibold mt-1 tabular-nums ${atrasadas > 0 ? "text-rose-600" : "text-slate-900"}`}
                >
                  {atrasadas}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  ya pasaron su fecha límite
                </p>
              </div>
              <div
                className={`bg-white p-2.5 rounded-lg border ${esperandoAprobacion > 0 ? "border-purple-200" : "border-slate-200"}`}
              >
                <p
                  className={`text-[11px] font-semibold ${esperandoAprobacion > 0 ? "text-purple-500" : "text-slate-400"}`}
                >
                  Esperando tu aprobación
                </p>
                <h3
                  className={`text-xl font-semibold mt-1 tabular-nums ${esperandoAprobacion > 0 ? "text-purple-600" : "text-slate-900"}`}
                >
                  {esperandoAprobacion}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  el equipo ya las entregó
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <p className="text-[11px] font-semibold text-slate-400">
                  Sin nadie asignado
                </p>
                <h3 className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
                  {sinAsignar}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  nadie las está trabajando
                </p>
              </div>
            </div>

            {/* LISTA DE PROBLEMAS */}
            <div className="bg-white rounded-lg border border-slate-200 p-3 flex-1 min-h-0">
              <h2 className="text-[13px] font-semibold text-slate-900 mb-1">
                Lo que necesita tu atención
              </h2>
              <p className="text-[11px] text-slate-400 mb-2">
                Ordenado de lo más urgente a lo menos urgente.
              </p>

              {totalTareas === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
                  <Icon name="clipboard" size={28} className="text-slate-300" />
                  <p className="text-[13px] font-semibold text-slate-700">
                    Sin tareas registradas
                  </p>
                  <p className="text-xs text-slate-400">
                    Este proyecto todavía no tiene tareas asignadas.
                  </p>
                </div>
              ) : conMotivo.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
                  <Icon
                    name="check-circle"
                    size={28}
                    className="text-emerald-400"
                  />
                  <p className="text-[13px] font-semibold text-slate-700">
                    Todo va en orden
                  </p>
                  <p className="text-xs text-slate-400">
                    No hay tareas atrasadas ni pendientes de revisión ahora
                    mismo.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {conMotivo.map(({ tarea, motivo }) => {
                    const info = MOTIVO_INFO[motivo.tipo];
                    return (
                      <div
                        key={tarea.id}
                        className={`flex items-center justify-between gap-1.5 p-1.5 rounded-xl border ${info.border} ${info.bg}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {tarea.titulo}
                            </span>
                            {proyectoSeleccionado === "Todos los Proyectos" && (
                              <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-1 py-0.5 rounded">
                                {tarea.proyecto}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {tarea.responsable
                              ? `Asignada a ${tarea.responsable}`
                              : "Sin persona asignada"}
                            {tarea.fechaLimite &&
                              ` · Fecha límite: ${formatFechaLimite(tarea.fechaLimite)}`}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-1 rounded-lg ${info.color} bg-white border ${info.border} whitespace-nowrap`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${info.dot}`}
                          />
                          {motivo.tipo === "atrasada"
                            ? `Vencida hace ${motivo.diasAtraso} día${motivo.diasAtraso === 1 ? "" : "s"}`
                            : motivo.tipo === "por_vencer"
                              ? motivo.diasRestantes === 0
                                ? "Vence hoy"
                                : `Vence en ${motivo.diasRestantes} día${motivo.diasRestantes === 1 ? "" : "s"}`
                              : info.etiqueta}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {enOrden > 0 && (
                <p className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                  Además, {enOrden} tarea{enOrden === 1 ? "" : "s"} más{" "}
                  {enOrden === 1 ? "va" : "van"} avanzando sin problemas.
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
