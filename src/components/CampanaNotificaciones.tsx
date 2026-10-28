"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { abrirArchivo } from "../lib/storageUrls";
import { Icon } from "./icons";
import { ModalOverlay } from "./ModalOverlay";

// Avisa a las pantallas abiertas (Panel Principal, etc.) que una solicitud se
// resolvió, para que vuelvan a leer sus datos.
export const EVENTO_NOTIF_RESUELTA = "notificaciones-resueltas";

interface Solicitud {
  id: string;
  employeeName: string;
  taskId?: string;
  taskTitle: string;
  taskDueDate: string | null;
  evidenceUrl: string | null;
  evidenceName: string | null;
  projectName: string;
  timestamp: string;
}

const formatDateTime = (s?: string | null) => {
  if (!s) return "Reciente";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const formatFecha = (s?: string | null) => {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : s;
};

const SELECT_NOTIF = `
  id,
  titulo_tarea,
  estado,
  created_at,
  empleado_id,
  proyecto_id,
  tarea_id,
  empleados (nombre),
  proyectos (nombre),
  tareas (fecha_limite),
  evidencia_url,
  evidencia_nombre
`;

// Campana de solicitudes de revisión: vive en la barra lateral, así que está en
// todas las pantallas de administración. Aprobar completa la tarea; rechazar pide
// nueva fecha límite y el comentario para el trabajador.
export default function CampanaNotificaciones() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [rechazo, setRechazo] = useState<{
    solicitud: Solicitud;
    fecha: string;
    comentario: string;
  } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [revisor, setRevisor] = useState("Administración");

  // `null` = aún no cargamos: así no se dispara una ráfaga de avisos del navegador.
  const vistasRef = useRef<Set<string> | null>(null);
  const contenedorRef = useRef<HTMLDivElement | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("notificaciones")
      .select(SELECT_NOTIF)
      .eq("estado", "Pendiente")
      .order("created_at", { ascending: false });
    if (error || !data) return;

    const lista: Solicitud[] = data.map((n: any) => ({
      id: n.id,
      employeeName: n.empleados?.nombre || "Integrante",
      taskId: n.tarea_id != null ? String(n.tarea_id) : undefined,
      taskTitle: n.titulo_tarea || "Revisión de código",
      taskDueDate: n.tareas?.fecha_limite || null,
      evidenceUrl: n.evidencia_url || null,
      evidenceName: n.evidencia_nombre || null,
      projectName: n.proyectos?.nombre || "Proyecto General",
      timestamp: formatDateTime(n.created_at),
    }));

    if (vistasRef.current !== null) {
      const nuevas = lista.filter((s) => !vistasRef.current!.has(s.id));
      if (
        nuevas.length > 0 &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        nuevas.forEach((s) => {
          const aviso = new Notification("Nueva solicitud de revisión", {
            body: s.taskTitle,
            icon: "/icono_rocal.png",
            tag: s.id,
          });
          aviso.onclick = () => {
            window.focus();
            aviso.close();
          };
        });
      }
    }
    vistasRef.current = new Set(lista.map((s) => s.id));
    setSolicitudes(lista);
  }, []);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }

    cargar();
    const intervalo = setInterval(cargar, 30000);

    // Nombre de quien revisa, tal como lo verá el trabajador en la extensión.
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase
        .from("empleados")
        .select("nombre")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (data?.nombre) setRevisor(data.nombre);
    })();

    return () => clearInterval(intervalo);
  }, [cargar]);

  // Clic fuera cierra la lista.
  useEffect(() => {
    if (!abierta) return;
    const alPresionar = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener("mousedown", alPresionar);
    return () => document.removeEventListener("mousedown", alPresionar);
  }, [abierta]);

  const quitar = (id: string) => {
    setSolicitudes((prev) => prev.filter((s) => s.id !== id));
    setComentarios((prev) => {
      const resto = { ...prev };
      delete resto[id];
      return resto;
    });
    window.dispatchEvent(new Event(EVENTO_NOTIF_RESUELTA));
  };

  const aprobar = async (s: Solicitud) => {
    const taskIdNum = s.taskId ? parseInt(s.taskId, 10) : NaN;
    const comentario = (comentarios[s.id] || "").trim() || null;

    try {
      const { error } = await supabase
        .from("notificaciones")
        .update({ estado: "Aprobado", comentario })
        .eq("id", s.id);
      if (error) throw error;

      if (!isNaN(taskIdNum)) {
        const ahora = new Date().toISOString();
        await (supabase.from("tareas") as any)
          .update({
            estado: "Completada",
            porcentaje_avance: 100,
            fecha_completado: ahora,
            revision_resultado: "Aprobado",
            revision_comentario: comentario,
            revision_por: revisor,
            revision_fecha: ahora,
          })
          .eq("id", taskIdNum);

        await (supabase.from("reuniones") as any)
          .update({ estado: "Completada" })
          .eq("tarea_id", taskIdNum)
          .neq("estado", "Completada");
      }

      quitar(s.id);
    } catch (err: any) {
      console.error("Error resolviendo notificación:", err);
      alert("No se pudo aprobar: " + (err.message || "Error de conexión"));
    }
  };

  const confirmarRechazo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rechazo || !rechazo.fecha) return;
    const { solicitud: s } = rechazo;
    const comentario = rechazo.comentario.trim();
    const taskIdNum = s.taskId ? parseInt(s.taskId, 10) : NaN;
    setGuardando(true);

    try {
      if (!isNaN(taskIdNum)) {
        const { error } = await supabase
          .from("tareas")
          .update({
            fecha_limite: rechazo.fecha,
            estado: "En Proceso",
            revision_resultado: "Rechazado",
            revision_comentario: comentario,
            revision_por: revisor,
            revision_fecha: new Date().toISOString(),
          })
          .eq("id", taskIdNum);
        if (error) throw error;
      }

      await supabase
        .from("notificaciones")
        .update({ estado: "Rechazado", comentario })
        .eq("id", s.id);

      setRechazo(null);
      quitar(s.id);
    } catch (err: any) {
      console.error("Error rechazando la tarea:", err);
      alert(
        "No se pudo rechazar la tarea: " + (err.message || "Error de conexión"),
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        title="Solicitudes y entregas"
        className="relative p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center"
      >
        <Icon name="bell" size={16} />
        {solicitudes.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-semibold h-4 min-w-4 px-0.5 rounded-full flex items-center justify-center">
            {solicitudes.length}
          </span>
        )}
      </button>

      {abierta && (
        <div className="absolute left-full top-0 ml-3 w-80 bg-white text-slate-900 border border-slate-200 rounded-xl shadow-lg z-50 p-2 select-text">
          <div className="flex justify-between items-center pb-1.5 mb-1.5 border-b border-slate-100">
            <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Solicitudes y entregas ({solicitudes.length})
            </h4>
            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
              En vivo
            </span>
          </div>

          {solicitudes.length === 0 ? (
            <p className="text-xs text-slate-400 py-2 text-center">
              Sin solicitudes pendientes
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
              {solicitudes.map((s) => (
                <div
                  key={s.id}
                  className="p-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-slate-900 flex items-center gap-1">
                      <Icon name="user" size={12} className="text-slate-400" />
                      {s.employeeName}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {s.timestamp}
                    </span>
                  </div>

                  <p className="text-slate-700 text-[11px] font-medium leading-snug">
                    {s.taskTitle}
                  </p>

                  <div className="flex items-center gap-1 flex-wrap pt-1">
                    <span className="text-[10px] text-blue-700 font-medium bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 inline-flex items-center gap-1">
                      <Icon name="folder" size={10} /> {s.projectName}
                    </span>
                    {s.taskDueDate && (
                      <span className="text-[10px] text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 inline-flex items-center gap-1">
                        <Icon name="hourglass" size={10} />{" "}
                        {formatFecha(s.taskDueDate)}
                      </span>
                    )}
                    {s.evidenceUrl && (
                      <button
                        type="button"
                        onClick={() => abrirArchivo(s.evidenceUrl)}
                        title={s.evidenceName || "Ver evidencia"}
                        className="text-[10px] text-purple-700 font-medium bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 hover:bg-purple-100 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Icon name="paperclip" size={10} /> Evidencia
                      </button>
                    )}
                  </div>

                  <textarea
                    rows={2}
                    value={comentarios[s.id] || ""}
                    onChange={(e) =>
                      setComentarios((prev) => ({
                        ...prev,
                        [s.id]: e.target.value,
                      }))
                    }
                    placeholder="Comentario para el trabajador (obligatorio si rechazas)"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-1.5 py-1 text-[11px] text-slate-800 bg-white outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  />

                  <div className="flex gap-1 w-full justify-end mt-1">
                    <button
                      type="button"
                      onClick={() => aprobar(s)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-1 py-1 rounded-md transition-colors cursor-pointer"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRechazo({
                          solicitud: s,
                          fecha: "",
                          comentario: comentarios[s.id] || "",
                        })
                      }
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold px-1 py-1 rounded-md transition-colors cursor-pointer"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {rechazo && (
        <ModalOverlay onClose={() => setRechazo(null)}>
          <div className="bg-white text-slate-900 w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2 select-text">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                Rechazar y dar más tiempo
              </h3>
              <button
                type="button"
                onClick={() => setRechazo(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={confirmarRechazo} className="space-y-2 text-xs">
              <p className="text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-1.5 py-1">
                La tarea regresará a "En Proceso" con esta nueva fecha límite.
                Si cierras sin guardar, se cancela el rechazo y la solicitud
                sigue pendiente.
              </p>
              <p className="text-slate-600">
                Nueva fecha límite para{" "}
                <strong className="text-slate-900">
                  "{rechazo.solicitud.taskTitle}"
                </strong>
                {rechazo.solicitud.taskDueDate && (
                  <> (actual: {formatFecha(rechazo.solicitud.taskDueDate)})</>
                )}
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Fecha Límite
                </label>
                <input
                  type="date"
                  required
                  value={rechazo.fecha}
                  onChange={(e) =>
                    setRechazo({ ...rechazo, fecha: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Qué hay que corregir
                </label>
                <textarea
                  required
                  rows={3}
                  value={rechazo.comentario}
                  onChange={(e) =>
                    setRechazo({ ...rechazo, comentario: e.target.value })
                  }
                  placeholder="El trabajador lo verá en su extensión junto a la tarea."
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 bg-white outline-none resize-none"
                />
              </div>

              <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRechazo(null)}
                  className="flex-1 bg-slate-100 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white py-1.5 rounded-xl font-bold cursor-pointer"
                >
                  {guardando ? "Guardando..." : "Rechazar tarea"}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
