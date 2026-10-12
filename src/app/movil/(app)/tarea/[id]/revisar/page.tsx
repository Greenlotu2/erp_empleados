"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Archivo, Avatar, Cargando, Contactar, ErrorCarga } from "../../../../_componentes/comunes";
import { apiMovil, SesionExpirada } from "../../../../_lib/api";
import { esPorRevisar, fechaCorta, primerNombre } from "../../../../_lib/equipo";
import { especialidadVisible, fechaHora, useDetalleTarea } from "../../../../_lib/tarea";

type Modo = "decidir" | "corregir";

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function RevisarPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { datos, error, cargar } = useDetalleTarea(id);

  const [modo, setModo] = useState<Modo>("decidir");
  const [comentario, setComentario] = useState("");
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [hecho, setHecho] = useState<"Aprobado" | "Rechazado" | null>(null);

  const volver = () =>
    window.history.length > 1 ? router.back() : router.push(`/movil/tarea/${id}`);

  const enviar = async (decision: "Aprobado" | "Rechazado") => {
    setErrorEnvio(null);
    if (decision === "Rechazado") {
      if (!comentario.trim()) return setErrorEnvio("Escribe qué hay que corregir.");
      if (!nuevaFecha) return setErrorEnvio("Elige la nueva fecha límite.");
    }
    setEnviando(true);
    try {
      await apiMovil(`/api/movil/tareas/${id}/revision`, {
        method: "POST",
        body: JSON.stringify({ decision, comentario, nuevaFecha }),
      });
      setHecho(decision);
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
        onClick={volver}
        aria-label="Volver"
        className="w-10 h-10 -ml-2 flex items-center justify-center cursor-pointer"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
      </button>
      <h1 className="text-base font-semibold text-slate-900">Revisión pendiente</h1>
    </header>
  );

  if (error) return <>{encabezado}<ErrorCarga mensaje={error} reintentar={cargar} /></>;
  if (!datos) return <>{encabezado}<Cargando /></>;

  const { tarea: t, hilo } = datos;
  const r = t.responsable;
  const nombre = r ? primerNombre(r.nombre) : "el responsable";

  // Resultado: confirmación y regreso.
  if (hecho) {
    const aprobada = hecho === "Aprobado";
    return (
      <>
        {encabezado}
        <div className="px-6 pt-14 flex flex-col items-center text-center">
          <span className={`w-16 h-16 rounded-full flex items-center justify-center ${aprobada ? "bg-emerald-50" : "bg-orange-50"}`}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={aprobada ? "#059669" : "#ea580c"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {aprobada ? <path d="M20 6 9 17l-5-5" /> : <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4" />}
            </svg>
          </span>
          <h2 className="text-lg font-semibold text-slate-900 mt-4">
            {aprobada ? "Entrega aprobada" : "Correcciones enviadas"}
          </h2>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
            {aprobada
              ? `${nombre} verá la aprobación${comentario.trim() ? " y tu comentario" : ""} en su extensión.`
              : `La tarea regresó a ${nombre} con tu comentario y nueva fecha límite: ${fechaCorta(nuevaFecha)}.`}
          </p>
          <div className="w-full flex flex-col gap-2.5 mt-8">
            <Link href="/movil" className="h-[50px] rounded-xl bg-blue-600 text-white text-[15px] font-semibold flex items-center justify-center">
              Volver a tareas
            </Link>
            <Link href={`/movil/tarea/${t.id}`} className="h-12 rounded-xl bg-white border border-slate-200 text-slate-700 text-[15px] font-medium flex items-center justify-center">
              Ver seguimiento
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Ya no está en revisión (otro revisor, la web, o ya se decidió).
  if (!esPorRevisar(t)) {
    return (
      <>
        {encabezado}
        <div className="mx-4 mt-6 bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
          <p>Esta entrega ya fue revisada o ya no está en revisión (estado actual: {t.estado}).</p>
          <Link href={`/movil/tarea/${t.id}`} className="inline-block mt-3 font-semibold text-blue-600">
            Ver seguimiento
          </Link>
        </div>
      </>
    );
  }

  // Última entrega = envío a revisión más reciente del hilo.
  const entrega = hilo.find((e) => e.tipo === "revision");
  const correccionesPrevias = hilo.filter((e) => e.tipo === "decision" && !e.aprobada).length;

  return (
    <>
      {encabezado}

      <div className="px-4 py-3 flex flex-col gap-2.5 pb-44">
        {/* Quién y qué */}
        <section className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          {r && (
            <div className="flex items-center gap-3">
              <Avatar nombre={r.nombre} color={r.color} foto={r.avatar_url} tam={42} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{r.nombre}</p>
                <p className="text-xs text-slate-400">
                  {entrega ? `Entregó ${fechaHora(entrega.fecha)}` : "Envió a revisión"}
                  {especialidadVisible(r) ? ` · ${especialidadVisible(r)}` : ""}
                </p>
              </div>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-slate-100">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-50 border border-blue-100 px-[7px] py-[3px] rounded-md">
              {t.proyecto || "Sin proyecto"}
            </span>
            <h2 className="text-[17px] font-semibold text-slate-900 leading-snug mt-2">{t.titulo}</h2>
            {correccionesPrevias > 0 && (
              <p className="text-xs text-orange-700 mt-1.5">
                Ya regresó {correccionesPrevias === 1 ? "1 vez" : `${correccionesPrevias} veces`} a corrección.
              </p>
            )}
          </div>
        </section>

        {/* Revisar a distancia */}
        {r?.celular && (
          <section className="bg-slate-900 rounded-xl px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Revisar a distancia</p>
            <p className="text-[13px] text-slate-300 mt-1 mb-3">¿Fuera de oficina? Habla con {nombre} antes de decidir.</p>
            <Contactar telefono={r.celular} />
          </section>
        )}

        {/* La entrega */}
        <section className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Entrega</p>
          {entrega?.cuerpo && (
            <p className="text-[13px] text-slate-600 mt-1.5 whitespace-pre-wrap">{entrega.cuerpo}</p>
          )}
          {entrega?.archivo?.url ? (
            <Archivo nombre={entrega.archivo.nombre} url={entrega.archivo.url} />
          ) : (
            <p className="text-[13px] text-slate-400 mt-1.5">Sin evidencia adjunta.</p>
          )}
        </section>

        {/* Comentario */}
        <section className="bg-white border border-slate-200 rounded-xl px-4 py-3.5">
          <label htmlFor="comentario" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Comentario para {nombre}
          </label>
          <textarea
            id="comentario"
            rows={4}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder={
              modo === "corregir"
                ? "Qué hay que corregir (obligatorio)"
                : "Opcional si apruebas, obligatorio si pides correcciones…"
            }
            className="w-full mt-2 rounded-xl border border-slate-300 px-3 py-2.5 text-[15px] text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
          {modo === "corregir" && (
            <div className="mt-3">
              <label htmlFor="fecha" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Nueva fecha límite
                {t.fecha_limite && <span className="font-normal text-slate-400"> · actual {fechaCorta(t.fecha_limite)}</span>}
              </label>
              <input
                id="fecha"
                type="date"
                min={hoyLocal()}
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
                className="w-full h-12 rounded-xl border border-slate-300 px-3 text-[15px] text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {errorEnvio && (
            <p className="mt-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errorEnvio}
            </p>
          )}
        </section>
      </div>

      {/* Decisión */}
      <div className="fixed inset-x-0 bottom-[76px] z-10 bg-white border-t border-slate-200 px-4 py-3 flex gap-2.5">
        {modo === "decidir" ? (
          <>
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                setErrorEnvio(null);
                setModo("corregir");
              }}
              className="flex-1 h-[52px] rounded-xl bg-white border border-red-200 text-red-700 text-[15px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h11a5 5 0 0 1 0 10h-4" />
              </svg>
              Corregir
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => enviar("Aprobado")}
              className="flex-1 h-[52px] rounded-xl bg-emerald-600 text-white text-[15px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {enviando ? "Guardando…" : "Aprobar"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                setErrorEnvio(null);
                setModo("decidir");
              }}
              className="h-[52px] px-4 rounded-xl bg-white border border-slate-200 text-slate-600 text-[15px] font-medium cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => enviar("Rechazado")}
              className="flex-1 h-[52px] rounded-xl bg-orange-600 text-white text-[15px] font-semibold cursor-pointer disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Enviar correcciones"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
