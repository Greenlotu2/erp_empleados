"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar, DeslizarParaActualizar, ErrorCarga } from "../../_componentes/comunes";
import { EsqueletoEquipo } from "../../_componentes/esqueletos";
import {
  esPorRevisar,
  SIN_AREA,
  urgencia,
  useDatosEquipo,
  type EmpleadoMovil,
  type TareaMovil,
} from "../../_lib/equipo";

type Filtro = "todos" | "disponibles" | "ocupados";
const DIRECCION = "Dirección";

interface Carga {
  activas: number;
  porRevisar: number;
  urgentes: number;
}

export default function EquipoPage() {
  const { datos, error, recargar } = useDatosEquipo();
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const cargaPorId = useMemo(() => {
    const m: Record<string, Carga> = {};
    (datos?.tareas || []).forEach((t: TareaMovil) => {
      const c = (m[t.empleado_id] ||= { activas: 0, porRevisar: 0, urgentes: 0 });
      c.activas++;
      if (esPorRevisar(t)) c.porRevisar++;
      if (urgencia(t)) c.urgentes++;
    });
    return m;
  }, [datos]);

  // Gerencia va en "Dirección"; los demás en cada una de sus áreas (alguien
  // con dos áreas aparece en las dos).
  const grupos = useMemo(() => {
    const mapa = new Map<string, EmpleadoMovil[]>();
    (datos?.empleados || [])
      .filter((e) =>
        filtro === "todos"
          ? true
          : filtro === "disponibles"
            ? e.disponibilidad
            : !e.disponibilidad,
      )
      .forEach((e) => {
        const areas =
          e.nivel === "Gerencia"
            ? [DIRECCION]
            : e.area && e.area.length > 0
              ? e.area
              : [SIN_AREA];
        areas.forEach((a) => mapa.set(a, [...(mapa.get(a) || []), e]));
      });
    const peso = (a: string) => (a === DIRECCION ? 0 : a === SIN_AREA ? 2 : 1);
    return Array.from(mapa.entries()).sort(
      ([a], [b]) => peso(a) - peso(b) || a.localeCompare(b, "es"),
    );
  }, [datos, filtro]);

  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  if (!datos) return <EsqueletoEquipo />;

  const total = datos.empleados.length;
  const disponibles = datos.empleados.filter((e) => e.disponibilidad).length;

  return (
    <DeslizarParaActualizar onActualizar={recargar}>
      <header className="bg-white border-b border-slate-200 px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">Equipo</h1>
          <Link
            href="/movil/asignar"
            className="ml-auto h-[34px] px-3 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[13px] font-semibold flex items-center gap-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Asignar
          </Link>
        </div>
        <p className="text-[13px] text-slate-400 mt-0.5">
          {total} integrantes · {datos.tareas.length} tareas activas
        </p>
        <div className="flex gap-4 mt-2 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {disponibles} disponibles
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {total - disponibles} ocupados
          </span>
        </div>
      </header>

      <div className="flex gap-1.5 px-4 pt-3 pb-2">
        {(
          [
            ["todos", "Todos"],
            ["disponibles", "Disponibles"],
            ["ocupados", "Ocupados"],
          ] as const
        ).map(([clave, texto]) => (
          <button
            key={clave}
            type="button"
            onClick={() => setFiltro(clave)}
            className={`px-3.5 py-2 rounded-full text-[13px] cursor-pointer ${
              filtro === clave
                ? "bg-blue-600 text-white font-semibold"
                : "bg-white border border-slate-200 text-slate-600 font-medium"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      <div className="px-4 pt-1 flex flex-col gap-3">
        {grupos.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-10">
            Nadie con ese estado.
          </p>
        )}
        {grupos.map(([area, personas]) => (
          <section key={area}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
              {area}
            </h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {personas.map((e) => (
                <FilaPersona
                  key={e.id}
                  empleado={e}
                  carga={cargaPorId[e.id]}
                  esYo={e.id === datos.yo.id}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </DeslizarParaActualizar>
  );
}

function FilaPersona({
  empleado: e,
  carga,
  esYo,
}: {
  empleado: EmpleadoMovil;
  carga?: Carga;
  esYo: boolean;
}) {
  // "General" era el valor por defecto heredado; no distingue a nadie.
  const especialidad = e.especialidad !== "General" ? e.especialidad : null;
  const puesto = especialidad || e.rol || e.nivel || "";
  const activas = carga?.activas || 0;
  return (
    <Link
      href={`/movil/asignar?persona=${e.id}`}
      className="flex items-center gap-3 px-3.5 py-2.5 active:bg-slate-50"
    >
      <Avatar nombre={e.nombre} color={e.color} foto={e.avatar_url} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 leading-tight truncate">
          {e.nombre}
          {esYo && <span className="font-normal text-slate-400"> (tú)</span>}
        </div>
        <div className="text-xs text-slate-400 mt-px">
          {puesto && <>{puesto} · </>}
          {activas === 0
            ? "sin tareas"
            : `${activas} ${activas === 1 ? "activa" : "activas"}`}
          {!!carga?.porRevisar && (
            <span className="text-blue-600 font-semibold"> · {carga.porRevisar} por revisar</span>
          )}
          {!!carga?.urgentes && (
            <span className="text-red-600 font-semibold"> · {carga.urgentes} urgente{carga.urgentes > 1 ? "s" : ""}</span>
          )}
        </div>
      </div>
      <span
        className={`flex items-center gap-1.5 text-xs font-medium shrink-0 ${
          e.disponibilidad ? "text-emerald-700" : "text-amber-700"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            e.disponibilidad ? "bg-emerald-500" : "bg-amber-500"
          }`}
        />
        {e.disponibilidad ? "Disponible" : "Ocupado"}
      </span>
    </Link>
  );
}
