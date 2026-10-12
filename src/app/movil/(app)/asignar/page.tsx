"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, Cargando, ErrorCarga } from "../../_componentes/comunes";
import { apiMovil, SesionExpirada } from "../../_lib/api";
import {
  primerNombre,
  useDatosEquipo,
  type EmpleadoMovil,
} from "../../_lib/equipo";

const PRIORIDADES = ["Baja", "Media", "Alta", "Urgente"] as const;
const TONO_PRIORIDAD: Record<string, string> = {
  Baja: "bg-slate-100 border-slate-400 text-slate-700",
  Media: "bg-blue-50 border-blue-500 text-blue-700",
  Alta: "bg-amber-50 border-amber-500 text-amber-800",
  Urgente: "bg-red-50 border-red-500 text-red-700",
};

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// useSearchParams necesita un límite de Suspense en una página cliente.
export default function AsignarPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <Asignar />
    </Suspense>
  );
}

function Asignar() {
  const router = useRouter();
  const personaInicial = useSearchParams().get("persona") || "";
  const { datos, error, recargar } = useDatosEquipo();

  const [empleadoId, setEmpleadoId] = useState(personaInicial);
  const [eligiendo, setEligiendo] = useState(!personaInicial);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [prioridad, setPrioridad] = useState<string>("Media");
  const [colaboradores, setColaboradores] = useState<string[]>([]);
  const [dependeDe, setDependeDe] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ id: number; aviso: string | null } | null>(null);

  const activasPorId = useMemo(() => {
    const m: Record<string, number> = {};
    (datos?.tareas || []).forEach((t) => (m[t.empleado_id] = (m[t.empleado_id] || 0) + 1));
    return m;
  }, [datos]);

  const personas = datos?.empleados || [];
  const responsable = personas.find((e) => e.id === empleadoId);
  const tareasDelResponsable = (datos?.tareas || []).filter((t) => t.empleado_id === empleadoId);

  if (error) return <ErrorCarga mensaje={error} reintentar={recargar} />;
  if (!datos) return <Cargando />;

  const enviar = async () => {
    setErrorEnvio(null);
    if (!empleadoId) return setErrorEnvio("Elige a quién asignarla.");
    if (!titulo.trim()) return setErrorEnvio("Escribe el título de la tarea.");
    if (!proyectoId) return setErrorEnvio("Elige el proyecto.");
    setEnviando(true);
    try {
      const r = await apiMovil<{ id: number; avisoCalendario: string | null }>("/api/movil/tareas", {
        method: "POST",
        body: JSON.stringify({
          empleadoId,
          titulo,
          descripcion,
          proyectoId,
          prioridad,
          fechaLimite: fechaLimite || null,
          colaboradoresIds: colaboradores,
          dependeDeId: dependeDe || null,
        }),
      });
      setHecho({ id: r.id, aviso: r.avisoCalendario });
    } catch (err: any) {
      if (err instanceof SesionExpirada) router.replace("/movil/login");
      else setErrorEnvio(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const encabezado = (
    <header className="bg-white border-b border-slate-200 px-4 pt-5 pb-3.5 flex items-center gap-3 sticky top-0 z-10">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/movil"))}
        aria-label="Cerrar"
        className="w-10 h-10 -ml-2 flex items-center justify-center cursor-pointer"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <h1 className="text-base font-semibold text-slate-900">Asignar tarea</h1>
    </header>
  );

  if (hecho) {
    return (
      <>
        {encabezado}
        <div className="px-6 pt-14 flex flex-col items-center text-center">
          <span className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h2 className="text-lg font-semibold text-slate-900 mt-4">Tarea asignada</h2>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
            {responsable ? primerNombre(responsable.nombre) : "La persona"} ya la ve en su extensión
            {fechaLimite ? " y la fecha límite quedó en el calendario." : "."}
          </p>
          {hecho.aviso && (
            <p className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              {hecho.aviso}
            </p>
          )}
          <div className="w-full flex flex-col gap-2.5 mt-8">
            <Link href={`/movil/tarea/${hecho.id}`} className="h-[50px] rounded-xl bg-blue-600 text-white text-[15px] font-semibold flex items-center justify-center">
              Ver seguimiento
            </Link>
            <Link href="/movil" className="h-12 rounded-xl bg-white border border-slate-200 text-slate-700 text-[15px] font-medium flex items-center justify-center">
              Volver a tareas
            </Link>
          </div>
        </div>
      </>
    );
  }

  const campo = "w-full h-12 rounded-xl border border-slate-300 px-3 text-[15px] text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500";
  const etiqueta = "block text-xs font-semibold text-slate-600 mb-1.5";

  return (
    <>
      {encabezado}

      <div className="px-4 py-3 flex flex-col gap-3.5 pb-44">
        {/* Responsable */}
        <div>
          <span className={etiqueta}>Responsable</span>
          {eligiendo || !responsable ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {personas.map((e) => (
                <FilaPersona
                  key={e.id}
                  empleado={e}
                  activas={activasPorId[e.id] || 0}
                  onElegir={() => {
                    setEmpleadoId(e.id);
                    setColaboradores((c) => c.filter((id) => id !== e.id));
                    setDependeDe("");
                    setEligiendo(false);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white border border-blue-300 rounded-xl">
              <FilaPersona
                empleado={responsable}
                activas={activasPorId[responsable.id] || 0}
                accion="Cambiar"
                onElegir={() => setEligiendo(true)}
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="titulo" className={etiqueta}>Título</label>
          <input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Qué hay que hacer" className={campo} />
        </div>

        <div>
          <label htmlFor="descripcion" className={etiqueta}>
            Descripción <span className="font-normal text-slate-400">· opcional</span>
          </label>
          <textarea
            id="descripcion"
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[15px] text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1 min-w-0">
            <label htmlFor="proyecto" className={etiqueta}>Proyecto</label>
            <select id="proyecto" value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className={campo}>
              <option value="">Elegir…</option>
              {datos.proyectos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label htmlFor="fecha" className={etiqueta}>
              Fecha límite <span className="font-normal text-slate-400">· opcional</span>
            </label>
            <input id="fecha" type="date" min={hoyLocal()} value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className={campo} />
          </div>
        </div>

        <div>
          <span className={etiqueta}>Prioridad</span>
          <div className="flex gap-1.5">
            {PRIORIDADES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrioridad(p)}
                className={`flex-1 h-10 rounded-[10px] border text-[13px] cursor-pointer ${
                  prioridad === p ? `${TONO_PRIORIDAD[p]} font-semibold` : "bg-white border-slate-200 text-slate-600 font-medium"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Colaboradores */}
        <div>
          <span className={etiqueta}>
            Colaboradores <span className="font-normal text-slate-400">· opcional</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {colaboradores.map((id) => {
              const c = personas.find((e) => e.id === id);
              if (!c) return null;
              return (
                <span key={id} className="flex items-center gap-1.5 pl-1 pr-1.5 h-9 rounded-full bg-white border border-slate-200">
                  <Avatar nombre={c.nombre} color={c.color} foto={c.avatar_url} tam={26} />
                  <span className="text-[13px] text-slate-700">{primerNombre(c.nombre)}</span>
                  <button
                    type="button"
                    aria-label={`Quitar a ${c.nombre}`}
                    onClick={() => setColaboradores((x) => x.filter((v) => v !== id))}
                    className="w-6 h-6 flex items-center justify-center text-slate-400 cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              );
            })}
            <select
              value=""
              onChange={(e) => e.target.value && setColaboradores((x) => [...x, e.target.value])}
              className="h-9 rounded-full border border-dashed border-slate-400 px-3 text-[13px] text-slate-600 bg-white"
            >
              <option value="">+ Agregar</option>
              {personas
                .filter((e) => e.id !== empleadoId && !colaboradores.includes(e.id))
                .map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
            </select>
          </div>
        </div>

        {/* Depende de */}
        {responsable && tareasDelResponsable.length > 0 && (
          <div>
            <label htmlFor="depende" className={etiqueta}>
              Depende de otra tarea <span className="font-normal text-slate-400">· opcional</span>
            </label>
            <select id="depende" value={dependeDe} onChange={(e) => setDependeDe(e.target.value)} className={campo}>
              <option value="">Ninguna</option>
              {tareasDelResponsable.map((t) => (
                <option key={t.id} value={t.id}>{t.titulo}</option>
              ))}
            </select>
            {dependeDe && (
              <p className="text-xs text-slate-500 mt-1.5">
                Quedará en “Pendiente” hasta que se complete la tarea anterior.
              </p>
            )}
          </div>
        )}

        {errorEnvio && (
          <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorEnvio}</p>
        )}
      </div>

      {/* Asignar */}
      <div className="fixed inset-x-0 bottom-[76px] z-10 bg-white border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          disabled={enviando}
          onClick={enviar}
          className="w-full h-[52px] rounded-xl bg-blue-600 text-white text-[16px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
          </svg>
          {enviando ? "Asignando…" : responsable ? `Asignar a ${primerNombre(responsable.nombre)}` : "Asignar"}
        </button>
        <p className="text-[11px] text-slate-400 text-center mt-2">
          Le aparece en su extensión{fechaLimite ? " y la fecha límite se agrega al calendario" : ""}.
        </p>
      </div>
    </>
  );
}

function FilaPersona({
  empleado: e,
  activas,
  accion,
  onElegir,
}: {
  empleado: EmpleadoMovil;
  activas: number;
  accion?: string;
  onElegir: () => void;
}) {
  return (
    <button type="button" onClick={onElegir} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left cursor-pointer active:bg-slate-50">
      <Avatar nombre={e.nombre} color={e.color} foto={e.avatar_url} tam={38} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-900 truncate">{e.nombre}</span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className={`w-[7px] h-[7px] rounded-full ${e.disponibilidad ? "bg-emerald-500" : "bg-amber-500"}`} />
          {e.disponibilidad ? "Disponible" : "Ocupado"} · {activas === 0 ? "sin tareas" : `${activas} ${activas === 1 ? "tarea activa" : "tareas activas"}`}
        </span>
      </span>
      {accion && <span className="text-[13px] font-semibold text-blue-600">{accion}</span>}
    </button>
  );
}
