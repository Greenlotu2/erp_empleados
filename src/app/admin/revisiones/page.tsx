"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Sidebar from "../../../components/Sidebar";
import CalendarioRevisiones from "../../../components/calendar/CalendarioRevisiones";
import KpisPanel from "../../../components/kpis/KpisPanel";
import { formatFechaLimite } from "../../../lib/dates";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentAdminId } from "../../../lib/currentAdmin";
import { Icon } from "../../../components/icons";
import { ModalOverlay } from "../../../components/ModalOverlay";

// Una tarea que tuvo seguimiento (≥1 reunión y/o ≥1 revisión vinculada por tarea_id).
interface TareaHistorial {
  id: number;
  titulo: string;
  proyecto: string;
  empleado: string;
  empleadoId: string | null;
  estado: string;
  fechaLimite: string | null;
  avance: number | null;
  nReuniones: number;
  nRevisiones: number;
}

// Un evento del hilo de seguimiento de una tarea (se mezclan revisiones, reuniones,
// decisiones de aprobación/rechazo y minutas manuales, ordenados por fecha desc).
interface ThreadEvent {
  key: string;
  tipo: "revision" | "reunion" | "decision" | "minuta";
  fecha: string;
  titulo: string;
  cuerpo?: string;
  meta?: any;
}

interface OptionItem {
  id: string;
  nombre: string;
}

export default function RevisionesPage() {
  const [activeTab, setActiveTab] = useState<"calendario" | "historial">(
    "calendario",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  // 📜 HISTORIAL POR TAREA
  const [tareasHist, setTareasHist] = useState<TareaHistorial[]>([]);
  const [selectedTareaId, setSelectedTareaId] = useState<number | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadRevisiones, setThreadRevisiones] = useState<any[]>([]);
  const [threadReuniones, setThreadReuniones] = useState<any[]>([]);
  const [threadNotifs, setThreadNotifs] = useState<any[]>([]);
  const [threadMinutas, setThreadMinutas] = useState<any[]>([]);
  const [minutaText, setMinutaText] = useState("");
  const [minutaReunionId, setMinutaReunionId] = useState("");
  const [isSavingMinuta, setIsSavingMinuta] = useState(false);
  const [minutaFile, setMinutaFile] = useState<File | null>(null);
  const minutaRef = useRef<HTMLTextAreaElement>(null);
  const minutaFileRef = useRef<HTMLInputElement>(null);

  // Estados del Modal Único
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);
  const [isGeneratingZoom, setIsGeneratingZoom] = useState(false);

  // 🗂️ El modal tiene dos modos independientes: agendar una reunión/revisión, o
  // asignar una tarea nueva (mismo flujo que "Asignar Tarea" del Panel Principal).
  const [scheduleMode, setScheduleMode] = useState<"reunion" | "tarea">(
    "reunion",
  );
  const [isSavingTask, setIsSavingTask] = useState(false);

  const [dbProjects, setDbProjects] = useState<OptionItem[]>([]);
  const [dbEmployees, setDbEmployees] = useState<OptionItem[]>([]);

  // 🔑 ID del administrador con sesión iniciada (quien asigna la tarea). Ya no se
  // pregunta por selector: siempre es quien está usando el panel en ese momento.
  const [currentAdminId, setCurrentAdminId] = useState<string>("");

  const [newTaskFormData, setNewTaskFormData] = useState({
    empleadoId: "",
    proyectoId: "",
    titulo: "",
    descripcion: "",
    prioridad: "Media" as "Baja" | "Media" | "Alta" | "Urgente",
    fechaLimite: "",
  });

  // 🕒 Controla la apertura automática del modal SOLO cuando los datos ya cargaron
  const [dataLoaded, setDataLoaded] = useState(false);
  const [pendingAutoOpen, setPendingAutoOpen] = useState(false);

  // 🔄 Se incrementa cada vez que se crea/edita una reunión desde este formulario,
  // para avisarle al calendario embebido que debe recargar sus datos.
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState(0);

  const [meetingFormData, setMeetingFormData] = useState({
    titulo: "",
    proyectoId: "",
    fechaInicio: "",
    descripcion: "",
    modalidad: "presencial" as "presencial" | "virtual",
    lugar: "Oficina Ing. Luis" as "Oficina Ing. Luis" | "Comedor",
    link: "",
    targetType: "todos",
    selectedEmployeeIds: [] as string[],
    tareaId: "" as string,
    tareaDueDate: "" as string,
  });

  // Carga la lista maestra del Historial: las tareas que tienen al menos una reunión
  // y/o una revisión vinculada (por tarea_id).
  const fetchHistorialTareas = async () => {
    try {
      setLoading(true);

      const { data: projData } = await (
        supabase.from("proyectos") as any
      ).select("id, nombre");
      if (projData) setDbProjects(projData);

      const { data: empData } = await (
        supabase.from("empleados") as any
      ).select("id, nombre, rol");
      if (empData) setDbEmployees(empData);

      const projName = new Map<string, string>();
      (projData || []).forEach((p: any) =>
        projName.set(String(p.id), p.nombre),
      );
      const empName = new Map<string, string>();
      (empData || []).forEach((e: any) => empName.set(String(e.id), e.nombre));

      const [reuRes, revRes] = await Promise.all([
        (supabase.from("reuniones") as any)
          .select("tarea_id")
          .not("tarea_id", "is", null),
        (supabase.from("revisiones") as any)
          .select("tarea_id")
          .not("tarea_id", "is", null),
      ]);

      const reuCount = new Map<number, number>();
      const revCount = new Map<number, number>();
      (reuRes.data || []).forEach((r: any) =>
        reuCount.set(
          Number(r.tarea_id),
          (reuCount.get(Number(r.tarea_id)) || 0) + 1,
        ),
      );
      (revRes.data || []).forEach((r: any) =>
        revCount.set(
          Number(r.tarea_id),
          (revCount.get(Number(r.tarea_id)) || 0) + 1,
        ),
      );

      const ids = Array.from(new Set([...reuCount.keys(), ...revCount.keys()]));
      if (ids.length === 0) {
        setTareasHist([]);
        return;
      }

      // Sin embeds de PostgREST: `tareas` tiene 2 FKs a `empleados` (empleado_id y
      // asignada_por) y eso hace ambigua la relación. Se resuelven los nombres a mano
      // con los mapas de arriba.
      const { data: tareasData, error } = await (supabase.from("tareas") as any)
        .select(
          "id, titulo, estado, fecha_limite, porcentaje_avance, proyecto_id, empleado_id",
        )
        .in("id", ids);

      if (error) throw error;

      const mapped: TareaHistorial[] = (tareasData || []).map((t: any) => {
        const pn =
          t.proyecto_id != null
            ? projName.get(String(t.proyecto_id))
            : undefined;
        const en =
          t.empleado_id != null
            ? empName.get(String(t.empleado_id))
            : undefined;
        return {
          id: Number(t.id),
          titulo: t.titulo || "Sin título",
          proyecto: pn ? ` ${pn}` : "Sin proyecto",
          empleado: en ? en : "Sin asignar",
          empleadoId: t.empleado_id ? String(t.empleado_id) : null,
          estado: t.estado || "En Proceso",
          fechaLimite: t.fecha_limite || null,
          avance: t.porcentaje_avance ?? null,
          nReuniones: reuCount.get(Number(t.id)) || 0,
          nRevisiones: revCount.get(Number(t.id)) || 0,
        };
      });

      mapped.sort((a, b) => {
        if (!a.fechaLimite) return 1;
        if (!b.fechaLimite) return -1;
        return b.fechaLimite.localeCompare(a.fechaLimite);
      });

      setTareasHist(mapped);
    } catch (err: any) {
      console.error(
        "Error cargando historial de tareas:",
        err?.message || err,
        err,
      );
    } finally {
      setLoading(false);
      setDataLoaded(true);
    }
  };

  // Carga el hilo de seguimiento de una tarea concreta.
  const fetchThread = async (tareaId: number) => {
    try {
      setLoadingThread(true);
      const [rev, reu, notif, min] = await Promise.all([
        (supabase.from("revisiones") as any)
          .select("*")
          .eq("tarea_id", tareaId),
        (supabase.from("reuniones") as any)
          .select("id, titulo, descripcion, fecha_inicio, estado, link, lugar")
          .eq("tarea_id", tareaId),
        (supabase.from("notificaciones") as any)
          .select(
            "id, titulo_tarea, estado, created_at, evidencia_url, evidencia_nombre",
          )
          .eq("tarea_id", tareaId)
          .in("estado", ["Aprobado", "Rechazado"]),
        (supabase.from("tarea_minutas") as any)
          .select("*")
          .eq("tarea_id", tareaId)
          .order("created_at", { ascending: false }),
      ]);

      setThreadRevisiones(rev.data || []);
      setThreadReuniones(reu.data || []);
      setThreadNotifs(notif.data || []);
      setThreadMinutas(min.data || []);
    } catch (err) {
      console.error("Error cargando el hilo de la tarea:", err);
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    fetchHistorialTareas();
  }, []);

  useEffect(() => {
    if (selectedTareaId != null) {
      fetchThread(selectedTareaId);
      setMinutaText("");
      setMinutaReunionId("");
    } else {
      setThreadRevisiones([]);
      setThreadReuniones([]);
      setThreadNotifs([]);
      setThreadMinutas([]);
    }
  }, [selectedTareaId]);

  useEffect(() => {
    getCurrentAdminId().then((id) => {
      if (id) setCurrentAdminId(id);
    });
  }, []);

  // 📌 REDIRECCIÓN DESDE NOTIFICACIONES DEL DASHBOARD
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const agendar = params.get("agendar");

      if (agendar === "true") {
        const rawTitulo = params.get("titulo") || "";
        const empleadoIdParam = params.get("empleadoId") || "";
        const proyectoIdParam = params.get("proyectoId") || "";
        const taskIdParam = params.get("taskId") || "";
        const taskDueDateParam = params.get("taskDueDate") || "";

        let cleanTitle = rawTitulo;
        if (cleanTitle.includes(":")) {
          cleanTitle = cleanTitle
            .split(":")
            .slice(1)
            .join(":")
            .replace(/[""]/g, "")
            .trim();
        }

        setMeetingFormData((prev) => ({
          ...prev,
          titulo: cleanTitle ? `Revisión: ${cleanTitle}` : prev.titulo,
          proyectoId: proyectoIdParam || prev.proyectoId,
          targetType: empleadoIdParam ? "seleccionados" : "todos",
          selectedEmployeeIds: empleadoIdParam ? [empleadoIdParam] : [],
          tareaId: taskIdParam || prev.tareaId,
          tareaDueDate: taskDueDateParam || prev.tareaDueDate,
        }));

        setPendingAutoOpen(true);
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
      }
    }
  }, []);

  useEffect(() => {
    if (dataLoaded && pendingAutoOpen) {
      setIsScheduleModalOpen(true);
      setPendingAutoOpen(false);
    }
  }, [dataLoaded, pendingAutoOpen]);

  const refreshHistorial = async () => {
    await fetchHistorialTareas();
    if (selectedTareaId != null) await fetchThread(selectedTareaId);
  };

  // 🎯 CAMBIAR ESTATUS DE UNA REUNIÓN DEL HILO (ACTUALIZA REUNIONES Y, SI SE COMPLETA,
  // SINCRONIZA LA TAREA SELECCIONADA).
  const handleUpdateStatusInHistorial = async (
    id: string,
    nuevoEstado: string,
  ) => {
    try {
      setLoading(true);

      // 1. Actualización en la tabla 'reuniones'
      const { error: reunErr } = await (supabase.from("reuniones") as any)
        .update({ estado: nuevoEstado })
        .eq("id", id);

      if (reunErr) throw reunErr;

      // 2. Si se marca como Completada, completar SOLO la tarea del hilo (no todas las
      // del empleado) y liberar disponibilidad solo si ya no le quedan tareas activas.
      const targetTarea = tareasHist.find((t) => t.id === selectedTareaId);
      if (nuevoEstado === "Completada" && targetTarea) {
        const empId = targetTarea.empleadoId;
        const cleanTitle = (targetTarea.titulo || "")
          .replace(/^Revisión:\s*/i, "")
          .trim();

        await (supabase.from("tareas") as any)
          .update({
            estado: "Completada",
            porcentaje_avance: 100,
            fecha_completado: new Date().toISOString(),
          })
          .eq("id", targetTarea.id);

        if (empId) {
          // Liberar disponibilidad solo si no le quedan otras tareas en curso.
          try {
            const { data: tareasPendientes } = await (
              supabase.from("tareas") as any
            )
              .select("id")
              .eq("empleado_id", empId)
              .in("estado", ["En Proceso", "En Revisión", "Postergada"])
              .neq("id", targetTarea.id);

            if (!tareasPendientes || tareasPendientes.length === 0) {
              await (supabase.from("empleados") as any)
                .update({ disponibilidad: true })
                .eq("id", empId);
            }
          } catch (e) {
            console.warn("Omitiendo actualización de disponibilidad:", e);
          }

          // Notificación
          try {
            await (supabase.from("notificaciones") as any).insert([
              {
                empleado_id: empId,
                titulo_tarea: `Revisión Aprobada: ${cleanTitle}`,
                estado: "Aprobado",
              },
            ]);
          } catch (e) {
            console.warn("Omitiendo notificación opcional:", e);
          }
        }
      }

      alert(`Estado cambiado a "${nuevoEstado}"en Supabase.`);
      await refreshHistorial();
    } catch (err: any) {
      console.error("Error actualizando historial:", err);
      alert(`Error al actualizar: ${err.message || "Error de conexión"}`);
    } finally {
      setLoading(false);
    }
  };

  // 🗑️ Eliminar Reunión/Revisión
  const handleDeleteMeeting = async (id: string, titulo: string) => {
    if (
      !confirm(`¿Estás seguro de que deseas eliminar la sesión "${titulo}"?`)
    ) {
      return;
    }

    try {
      const { error } = await (supabase.from("reuniones") as any)
        .delete()
        .eq("id", id);
      if (error) throw error;

      alert("Sesión eliminada correctamente.");
      await refreshHistorial();
    } catch (err: any) {
      console.error("Error al eliminar reunión:", err);
      alert(`Error al eliminar: ${err.message || "Error de conexión"}`);
    }
  };

  // 🔤 Barra de formato de la minuta: envuelve (o inserta) marcas Markdown ligeras
  // alrededor de lo que esté seleccionado en el textarea.
  const wrapMinuta = (before: string, after: string = before) => {
    const el = minutaRef.current;
    const val = minutaText;
    if (!el) {
      setMinutaText(val + before + after);
      return;
    }
    const start = el.selectionStart ?? val.length;
    const end = el.selectionEnd ?? val.length;
    const sel = val.slice(start, end);
    const next = val.slice(0, start) + before + sel + after + val.slice(end);
    setMinutaText(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = sel
        ? start + before.length + sel.length + after.length
        : start + before.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const insertMinuta = (text: string) => {
    const el = minutaRef.current;
    const val = minutaText;
    if (!el) {
      setMinutaText(val + text);
      return;
    }
    const start = el.selectionStart ?? val.length;
    const next =
      val.slice(0, start) + text + val.slice(el.selectionEnd ?? start);
    setMinutaText(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + text.length;
      el.setSelectionRange(caret, caret);
    });
  };

  // Convierte el Markdown ligero de una minuta a HTML seguro (escapa primero, luego
  // inyecta solo nuestras etiquetas). Se usa para el cuerpo de los eventos del hilo.
  const renderRich = (raw: string) => {
    let s = (raw || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_\n]+)__/g, "<u>$1</u>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    s = s.replace(
      /`([^`\n]+)`/g,
      '<code class="bg-slate-100 rounded px-1 text-[10px]">$1</code>',
    );
    s = s.replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-600 underline">$1</a>',
    );
    s = s.replace(/^\s*[-*]\s+/gm, "• ");
    return { __html: s };
  };

  // 📝 Agregar una minuta (nota tipo acta) al hilo de la tarea seleccionada.
  const handleAddMinuta = async () => {
    if (selectedTareaId == null || (!minutaText.trim() && !minutaFile)) return;
    try {
      setIsSavingMinuta(true);
      const autor = dbEmployees.find((e) => e.id === currentAdminId);

      // Adjunto opcional (foto/archivo) → bucket 'documentacion', igual que las
      // evidencias de revisión, pero bajo el prefijo minutas/.
      let adjuntoUrl: string | null = null;
      let adjuntoNombre: string | null = null;
      if (minutaFile) {
        if (minutaFile.size > 5 * 1024 * 1024) {
          alert("El archivo supera los 5MB.");
          setIsSavingMinuta(false);
          return;
        }
        const safe = minutaFile.name
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `minutas/${selectedTareaId}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage
          .from("documentacion")
          .upload(path, minutaFile);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage
          .from("documentacion")
          .getPublicUrl(path);
        adjuntoUrl = pub?.publicUrl || null;
        adjuntoNombre = minutaFile.name;
      }

      const { error } = await (supabase.from("tarea_minutas") as any).insert({
        tarea_id: selectedTareaId,
        reunion_id: minutaReunionId || null,
        autor_id: currentAdminId || null,
        autor_nombre: autor?.nombre || null,
        contenido: minutaText.trim(),
        adjunto_url: adjuntoUrl,
        adjunto_nombre: adjuntoNombre,
      });
      if (error) throw error;

      setMinutaText("");
      setMinutaReunionId("");
      setMinutaFile(null);
      if (minutaFileRef.current) minutaFileRef.current.value = "";
      await fetchThread(selectedTareaId);
    } catch (err: any) {
      console.error("Error al agregar minuta:", err);
      alert(
        `No se pudo guardar la minuta: ${err.message || "Error de conexión"}`,
      );
    } finally {
      setIsSavingMinuta(false);
    }
  };

  const handleDeleteMinuta = async (id: string) => {
    if (!confirm("¿Eliminar esta minuta?")) return;
    try {
      const { error } = await (supabase.from("tarea_minutas") as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      if (selectedTareaId != null) await fetchThread(selectedTareaId);
    } catch (err: any) {
      console.error("Error al eliminar minuta:", err);
      alert(`No se pudo eliminar: ${err.message || "Error de conexión"}`);
    }
  };

  // Generación dinámica de enlace de Zoom vía API Server-to-Server
  const handleGenerateZoomMeeting = async () => {
    if (!meetingFormData.titulo.trim() || !meetingFormData.fechaInicio) {
      alert(
        "Ingresa el título y la fecha/hora de inicio antes de generar el enlace de Zoom.",
      );
      return;
    }

    try {
      setIsGeneratingZoom(true);

      const res = await fetch("/api/zoom/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: meetingFormData.titulo,
          descripcion: meetingFormData.descripcion,
          fechaInicio: meetingFormData.fechaInicio,
        }),
      });

      const data = await res.json();

      if (data.link) {
        setMeetingFormData((prev) => ({ ...prev, link: data.link }));
        alert("Enlace de Zoom generado exitosamente.");
      } else {
        alert(
          `Error al generar enlace: ${data.error || "Revisa la configuración de Zoom."}`,
        );
      }
    } catch (err) {
      console.error("Error al conectar con la API de Zoom:", err);
      alert("Error de conexión al generar la sala de Zoom.");
    } finally {
      setIsGeneratingZoom(false);
    }
  };

  // Guardar reunión o revisión en Supabase
  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingFormData.titulo.trim() || !meetingFormData.fechaInicio) {
      alert("Por favor completa el título y la fecha/hora.");
      return;
    }

    if (
      meetingFormData.modalidad === "virtual" &&
      !meetingFormData.link.trim()
    ) {
      alert("Genera o ingresa un enlace de Zoom para la revisión virtual.");
      return;
    }

    try {
      setIsSavingMeeting(true);

      const targetProjectId = meetingFormData.proyectoId
        ? meetingFormData.proyectoId
        : null;

      const dtInicio = new Date(meetingFormData.fechaInicio);
      const dtFin = new Date(dtInicio.getTime() + 60 * 60 * 1000);

      const fechaInicioISO = dtInicio.toISOString();
      const fechaFinISO = dtFin.toISOString();
      const fechaTexto = dtInicio.toISOString().split("T")[0];
      const horaTexto = dtInicio.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const esPresencial = meetingFormData.modalidad === "presencial";
      // La modalidad (presencial/virtual) y a quién va dirigida ya se muestran como campos
      // propios en el popover/modal (a partir de `link` y `empleado_id`) — la descripción
      // solo lleva las notas reales que escribió el admin, sin horneados redundantes.
      const notasFormateadas = meetingFormData.descripcion.trim();

      const parsedTareaId = meetingFormData.tareaId
        ? parseInt(meetingFormData.tareaId, 10)
        : NaN;
      const targetTareaId = isNaN(parsedTareaId) ? null : parsedTareaId;

      let meetingsToInsert: any[] = [];

      if (meetingFormData.targetType === "todos") {
        meetingsToInsert = [
          {
            titulo: meetingFormData.titulo.trim(),
            descripcion:
              notasFormateadas ||
              (esPresencial
                ? "Reunión presencial en oficina"
                : "Revisión virtual de avances"),
            fecha_inicio: fechaInicioISO,
            fecha_fin: fechaFinISO,
            fecha: fechaTexto,
            hora: horaTexto,
            link: esPresencial ? null : meetingFormData.link.trim(),
            lugar: esPresencial ? meetingFormData.lugar : null,
            estado: "Programada",
            empleado_id: null,
            proyecto_id: targetProjectId,
            tarea_id: targetTareaId,
            creado_por: currentAdminId || null,
          },
        ];
      } else {
        meetingsToInsert = meetingFormData.selectedEmployeeIds.map((empId) => ({
          titulo: meetingFormData.titulo.trim(),
          descripcion:
            notasFormateadas ||
            (esPresencial
              ? "Reunión presencial en oficina"
              : "Revisión virtual de avances"),
          fecha_inicio: fechaInicioISO,
          fecha_fin: fechaFinISO,
          fecha: fechaTexto,
          hora: horaTexto,
          link: esPresencial ? null : meetingFormData.link.trim(),
          lugar: esPresencial ? meetingFormData.lugar : null,
          estado: "Programada",
          empleado_id: empId || null,
          proyecto_id: targetProjectId,
          tarea_id: targetTareaId,
          creado_por: currentAdminId || null,
        }));
      }

      const { error: meetingErr } = await (
        supabase.from("reuniones") as any
      ).insert(meetingsToInsert);
      if (meetingErr) throw meetingErr;

      alert(
        `${esPresencial ? "Reunión Presencial" : "Revisión Virtual"} agendada con éxito.`,
      );

      setMeetingFormData({
        titulo: "",
        proyectoId: "",
        fechaInicio: "",
        descripcion: "",
        modalidad: "presencial",
        lugar: "Oficina Ing. Luis",
        link: "",
        targetType: "todos",
        selectedEmployeeIds: [],
        tareaId: "",
        tareaDueDate: "",
      });
      setIsScheduleModalOpen(false);
      setCalendarRefreshTrigger((prev) => prev + 1);

      await fetchHistorialTareas();
    } catch (err: any) {
      console.error("Error al guardar:", err);
      alert(`Error al agendar: ${err.message || "Error de conexión"}`);
    } finally {
      setIsSavingMeeting(false);
    }
  };

  // 📋 ASIGNAR TAREA NUEVA (mismo flujo que "Asignar Tarea" del Panel Principal):
  // crea la fila en 'tareas' y, si tiene fecha límite, el marcador automático
  // en el calendario (evento estado 'Fecha Límite'), igual que en page.tsx.
  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskFormData.titulo.trim() || !newTaskFormData.empleadoId) {
      alert("Selecciona un integrante y escribe el título de la tarea.");
      return;
    }
    if (!newTaskFormData.proyectoId) {
      alert("Selecciona el proyecto de la tarea.");
      return;
    }

    try {
      setIsSavingTask(true);

      const taskPayload = {
        empleado_id: newTaskFormData.empleadoId,
        proyecto_id: newTaskFormData.proyectoId,
        titulo: newTaskFormData.titulo.trim(),
        descripcion: newTaskFormData.descripcion.trim() || null,
        estado: "En Proceso",
        prioridad: newTaskFormData.prioridad,
        asignada_por: currentAdminId || null,
        fecha_asignada: new Date().toISOString().split("T")[0],
        fecha_limite: newTaskFormData.fechaLimite || null,
      };

      const { data: nuevaTarea, error } = await (supabase.from("tareas") as any)
        .insert(taskPayload)
        .select("id")
        .single();

      if (error) throw error;

      await (supabase.from("empleados") as any)
        .update({ disponibilidad: false })
        .eq("id", newTaskFormData.empleadoId);

      if (newTaskFormData.fechaLimite && nuevaTarea?.id) {
        const dtInicioLimite = new Date(
          `${newTaskFormData.fechaLimite}T09:00:00`,
        );
        const dtFinLimite = new Date(`${newTaskFormData.fechaLimite}T10:00:00`);

        const { error: calErr } = await (
          supabase.from("reuniones") as any
        ).insert({
          titulo: newTaskFormData.titulo.trim(),
          // Sin descripción: el título, el ícono ⏳ y la etiqueta "Fecha Límite" ya
          // dejan claro de qué se trata — repetirlo en una descripción es redundante.
          descripcion: null,
          fecha_inicio: dtInicioLimite.toISOString(),
          fecha_fin: dtFinLimite.toISOString(),
          fecha: newTaskFormData.fechaLimite,
          hora: "09:00 AM",
          estado: "Fecha Límite",
          empleado_id: newTaskFormData.empleadoId,
          proyecto_id: newTaskFormData.proyectoId,
          tarea_id: nuevaTarea.id,
          creado_por: currentAdminId || null,
        });

        if (calErr) {
          console.error(
            "No se pudo crear el evento de fecha límite en el calendario:",
            calErr,
          );
        }
      }

      alert("Tarea asignada con éxito.");

      setNewTaskFormData({
        empleadoId: "",
        proyectoId: "",
        titulo: "",
        descripcion: "",
        prioridad: "Media",
        fechaLimite: "",
      });
      setIsScheduleModalOpen(false);
      setCalendarRefreshTrigger((prev) => prev + 1);

      await fetchHistorialTareas();
    } catch (err: any) {
      console.error("Error al asignar tarea:", err);
      alert(`Error al asignar la tarea: ${err.message || "Error de conexión"}`);
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleToggleEmployeeSelection = (empId: string) => {
    setMeetingFormData((prev) => ({
      ...prev,
      selectedEmployeeIds: prev.selectedEmployeeIds.includes(empId)
        ? prev.selectedEmployeeIds.filter((id) => id !== empId)
        : [...prev.selectedEmployeeIds, empId],
    }));
  };

  const filteredTareas = tareasHist.filter((t) => {
    const q = searchTerm.toLowerCase();
    return (
      t.titulo.toLowerCase().includes(q) ||
      t.empleado.toLowerCase().includes(q) ||
      t.proyecto.toLowerCase().includes(q)
    );
  });

  const selectedTarea =
    tareasHist.find((t) => t.id === selectedTareaId) || null;

  // Mezcla los 4 orígenes del hilo en una sola línea de tiempo, más reciente primero.
  const threadEvents = useMemo<ThreadEvent[]>(() => {
    const eventos: ThreadEvent[] = [];

    threadRevisiones.forEach((r: any) => {
      eventos.push({
        key: `rev-${r.id}`,
        tipo: "revision",
        fecha: r.created_at || r.fecha || "",
        titulo: "Enviada a revisión",
        cuerpo: r.comentarios || "",
        meta: {
          evidencia_url: r.evidencia_url,
          evidencia_nombre: r.evidencia_nombre,
        },
      });
    });

    threadReuniones.forEach((m: any) => {
      const modalidad =
        m.estado === "Fecha Límite"
          ? "Fecha límite (automática)"
          : m.link
            ? "Virtual"
            : "Presencial";
      eventos.push({
        key: `reu-${m.id}`,
        tipo: "reunion",
        fecha: m.fecha_inicio || "",
        titulo: `${m.titulo || "Reunión"}`,
        cuerpo: m.descripcion || "",
        meta: {
          id: m.id,
          estado: m.estado,
          link: m.link,
          lugar: m.lugar,
          modalidad,
        },
      });
    });

    threadNotifs.forEach((n: any) => {
      eventos.push({
        key: `notif-${n.id}`,
        tipo: "decision",
        fecha: n.created_at || "",
        titulo: n.estado === "Aprobado" ? "Tarea aprobada" : "Tarea rechazada",
        cuerpo: n.titulo_tarea || "",
      });
    });

    threadMinutas.forEach((mn: any) => {
      const reu = threadReuniones.find((m: any) => m.id === mn.reunion_id);
      eventos.push({
        key: `min-${mn.id}`,
        tipo: "minuta",
        fecha: mn.created_at || "",
        titulo: `${mn.autor_nombre || "Minuta"}`,
        cuerpo: mn.contenido || "",
        meta: {
          id: mn.id,
          reunionTitulo: reu?.titulo || null,
          adjunto_url: mn.adjunto_url,
          adjunto_nombre: mn.adjunto_nombre,
        },
      });
    });

    return eventos.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  }, [threadRevisiones, threadReuniones, threadNotifs, threadMinutas]);

  const fmtFechaHora = (iso: string) => {
    if (!iso) return "Sin fecha";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderBadge = (estado: string) => {
    let colorClass = "bg-blue-50 text-blue-700 border-blue-200";
    if (
      estado === "Completada" ||
      estado === "Completado" ||
      estado === "Aprobado"
    ) {
      colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
    } else if (estado === "Ajuste por tiempo" || estado === "Pendiente") {
      colorClass = "bg-amber-50 text-amber-700 border-amber-200";
    } else if (
      estado === "Rechazado" ||
      estado === "Cancelada" ||
      estado === "Fecha Límite"
    ) {
      colorClass = "bg-red-50 text-red-700 border-red-200";
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${colorClass}`}
      >
        {estado}
      </span>
    );
  };

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      <Sidebar />

      <main className="flex-1 flex flex-col p-2 md:p-3 xl:pr-0 overflow-hidden h-full min-w-0">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 mb-2 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Calendario de Actividades
            </h1>
            <p className="text-xs text-slate-500">
              Coagenda reuniones presenciales en oficina o Visualización de
              tareas
            </p>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2 py-1 rounded-xl text-xs shadow-2xs transition-all cursor-pointer flex items-center gap-1"
            >
              <span>+ Agendar Sesión</span>
            </button>

            <div className="bg-slate-200/80 p-1 rounded-xl flex items-center gap-1 shadow-2xs ml-1">
              <button
                onClick={() => setActiveTab("calendario")}
                className={`px-1.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "calendario"
                    ? "bg-white text-blue-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Calendario
              </button>
              <button
                onClick={() => setActiveTab("historial")}
                className={`px-1.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "historial"
                    ? "bg-white text-blue-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Historial ({tareasHist.length})
              </button>
            </div>
          </div>
        </header>

        {activeTab === "calendario" && (
          <div className="flex-1 min-h-0 overflow-hidden ">
            <CalendarioRevisiones refreshTrigger={calendarRefreshTrigger} />
          </div>
        )}

        {activeTab === "historial" && (
          <div className="flex-1 bg-white border border-slate-200/80 rounded-2xl p-2 shadow-2xs flex gap-2 min-h-0 overflow-hidden">
            {/* IZQUIERDA: lista de tareas con seguimiento */}
            <div className="w-full sm:w-64 xl:w-72 shrink-0 flex flex-col min-h-0 border-r border-slate-100 pr-2">
              <input
                type="text"
                placeholder="Buscar tarea, proyecto o empleado..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-1.5 py-1 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full mb-2 shrink-0"
              />

              <div className="flex-1 overflow-y-auto min-h-0 pr-0.5 space-y-1">
                {loading ? (
                  <div className="flex items-center justify-center h-40 text-xs font-bold text-slate-500 gap-1">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    Cargando...
                  </div>
                ) : filteredTareas.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-xs font-semibold text-slate-400 text-center px-2">
                    No hay tareas con reuniones o revisiones.
                  </div>
                ) : (
                  filteredTareas.map((t) => {
                    const activa = t.id === selectedTareaId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTareaId(t.id)}
                        className={`w-full text-left border rounded-xl p-1.5 flex flex-col gap-1 transition-all cursor-pointer ${
                          activa
                            ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-400/30"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1 min-w-0">
                          <span className="font-bold text-slate-900 text-xs break-words min-w-0">
                            {t.titulo}
                          </span>
                          <span className="shrink-0">
                            {renderBadge(t.estado)}
                          </span>
                        </div>
                        <span className="text-[10px] text-blue-600 font-semibold break-words">
                          {t.proyecto}
                        </span>
                        <span className="text-[10px] text-slate-600 font-semibold break-words">
                          {t.empleado}
                        </span>
                        <div className="flex items-center gap-2 text-[9.5px] text-slate-400 font-semibold">
                          <span className="inline-flex items-center gap-0.5">
                            <Icon name="calendar" size={10} />
                            {t.nReuniones}
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <Icon name="send" size={10} />
                            {t.nRevisiones}
                          </span>
                          {t.fechaLimite && (
                            <span className="inline-flex items-center gap-0.5">
                              <Icon name="hourglass" size={10} />
                              {formatFechaLimite(t.fechaLimite)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* DERECHA: hilo de seguimiento de la tarea seleccionada */}
            {!selectedTarea ? (
              <div className="flex-1 flex items-center justify-center text-xs font-semibold text-slate-400 text-center px-4">
                Selecciona una tarea para ver su seguimiento y minutas.
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Encabezado de la tarea */}
                <div className="shrink-0 pb-2 border-b border-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm break-words">
                        {selectedTarea.titulo}
                      </div>
                      <div className="text-[11px] text-blue-600 font-semibold break-words">
                        {selectedTarea.proyecto}
                      </div>
                      <div className="text-[11px] text-slate-600 font-semibold break-words">
                        {selectedTarea.empleado}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {renderBadge(selectedTarea.estado)}
                      {selectedTarea.fechaLimite && (
                        <span className="text-[10px] font-bold text-amber-600">
                          Límite: {formatFechaLimite(selectedTarea.fechaLimite)}
                        </span>
                      )}
                      {selectedTarea.avance != null && (
                        <span className="text-[10px] font-semibold text-slate-500">
                          Avance: {selectedTarea.avance}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Nueva minuta */}
                <div className="shrink-0 py-2 border-b border-slate-100 space-y-1">
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                    Nueva minuta
                  </h3>
                  <div className="flex flex-wrap items-center gap-0.5 bg-slate-50 border border-slate-200 border-b-0 rounded-t-xl px-1 py-1">
                    <button
                      type="button"
                      onClick={() => wrapMinuta("**")}
                      title="Negrita"
                      className="w-6 h-6 rounded hover:bg-slate-200 font-bold text-slate-700 text-xs cursor-pointer"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => wrapMinuta("*")}
                      title="Cursiva"
                      className="w-6 h-6 rounded hover:bg-slate-200 italic text-slate-700 text-xs cursor-pointer"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() => wrapMinuta("__")}
                      title="Subrayado"
                      className="w-6 h-6 rounded hover:bg-slate-200 underline text-slate-700 text-xs cursor-pointer"
                    >
                      U
                    </button>
                    <button
                      type="button"
                      onClick={() => wrapMinuta("~~")}
                      title="Tachado"
                      className="w-6 h-6 rounded hover:bg-slate-200 line-through text-slate-700 text-xs cursor-pointer"
                    >
                      S
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMinuta("\n- ")}
                      title="Lista"
                      className="w-6 h-6 rounded hover:bg-slate-200 text-slate-700 text-xs cursor-pointer"
                    >
                      •
                    </button>
                    <span className="w-px h-4 bg-slate-300 mx-0.5" />
                    <button
                      type="button"
                      onClick={() => minutaFileRef.current?.click()}
                      title="Adjuntar foto o archivo"
                      className="w-6 h-6 rounded hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                    >
                      <Icon name="paperclip" size={13} />
                    </button>
                    <input
                      ref={minutaFileRef}
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      onChange={(e) =>
                        setMinutaFile(e.target.files?.[0] || null)
                      }
                    />
                  </div>
                  <textarea
                    ref={minutaRef}
                    value={minutaText}
                    onChange={(e) => setMinutaText(e.target.value)}
                    placeholder="Minuta / seguimiento: qué se acordó o cambió en esta reunión..."
                    rows={6}
                    className="w-full min-h-[7rem] bg-slate-50 border border-slate-200 rounded-b-xl -mt-1 px-1.5 py-1.5 text-xs text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
                  />
                  {minutaFile && (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-1.5 py-1 w-fit max-w-full">
                      <span className="truncate">{minutaFile.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMinutaFile(null);
                          if (minutaFileRef.current)
                            minutaFileRef.current.value = "";
                        }}
                        className="text-slate-400 hover:text-red-600 font-bold cursor-pointer shrink-0"
                      ></button>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={minutaReunionId}
                      onChange={(e) => setMinutaReunionId(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-1.5 py-1 text-[11px] font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                    >
                      <option value="">Sin reunión asociada</option>
                      {threadReuniones.map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.titulo || "Reunión"} ·{" "}
                          {fmtFechaHora(m.fecha_inicio)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddMinuta}
                      disabled={
                        isSavingMinuta || (!minutaText.trim() && !minutaFile)
                      }
                      className="px-2 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-[11px] transition-colors cursor-pointer shrink-0"
                    >
                      {isSavingMinuta ? "Guardando..." : "+ Agregar minuta"}
                    </button>
                  </div>
                </div>

                {/* Timeline */}
                <h3 className="shrink-0 pt-2 pb-1 text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  Seguimiento
                  <span className="text-[9.5px] font-bold text-slate-400 bg-slate-100 rounded-full px-1 py-0.5">
                    {threadEvents.length}
                  </span>
                </h3>
                <div className="flex-1 overflow-y-auto min-h-0 pr-0.5 space-y-1.5">
                  {loadingThread ? (
                    <div className="flex items-center justify-center h-40 text-xs font-bold text-slate-500 gap-1">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      Cargando hilo...
                    </div>
                  ) : threadEvents.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-xs font-semibold text-slate-400">
                      Sin eventos todavía.
                    </div>
                  ) : (
                    threadEvents.map((ev) => {
                      const borde =
                        ev.tipo === "reunion"
                          ? "border-l-blue-400"
                          : ev.tipo === "revision"
                            ? "border-l-indigo-400"
                            : ev.tipo === "decision"
                              ? ev.titulo.includes("aprob")
                                ? "border-l-emerald-400"
                                : "border-l-red-400"
                              : "border-l-amber-400";
                      return (
                        <div
                          key={ev.key}
                          className={`border border-slate-200 border-l-2 ${borde} rounded-lg p-1.5`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-slate-800 text-[11px] break-words min-w-0">
                              {ev.titulo}
                            </span>
                            <span className="text-[9.5px] text-slate-400 font-mono shrink-0">
                              {fmtFechaHora(ev.fecha)}
                            </span>
                          </div>

                          {ev.cuerpo && (
                            <p
                              className="text-[11px] text-slate-600 mt-0.5 whitespace-pre-wrap break-words [&_a]:break-all"
                              dangerouslySetInnerHTML={renderRich(ev.cuerpo)}
                            />
                          )}

                          {ev.tipo === "revision" && ev.meta?.evidencia_url && (
                            <a
                              href={ev.meta.evidencia_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block mt-1 text-[10px] font-bold text-blue-600 hover:underline"
                            >
                              {ev.meta.evidencia_nombre || "Ver evidencia"}
                            </a>
                          )}

                          {ev.tipo === "reunion" && (
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              <span className="text-[10px] font-semibold text-slate-500">
                                {ev.meta?.modalidad}
                              </span>
                              {ev.meta?.link && (
                                <a
                                  href={ev.meta.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] font-bold text-blue-600 hover:underline"
                                >
                                  Entrar
                                </a>
                              )}
                              {ev.meta?.estado !== "Fecha Límite" && (
                                <div className="flex items-center gap-1 ml-auto">
                                  {ev.meta?.estado !== "Completada" ? (
                                    <button
                                      onClick={() =>
                                        handleUpdateStatusInHistorial(
                                          ev.meta.id,
                                          "Completada",
                                        )
                                      }
                                      className="px-1 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[9.5px] border border-emerald-200 cursor-pointer"
                                    >
                                      Completar
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        handleUpdateStatusInHistorial(
                                          ev.meta.id,
                                          "Programada",
                                        )
                                      }
                                      className="inline-flex items-center gap-1 px-1 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[9.5px] border border-slate-200 cursor-pointer"
                                    >
                                      <Icon name="undo" size={11} /> Reabrir
                                    </button>
                                  )}
                                  <button
                                    onClick={() =>
                                      handleDeleteMeeting(ev.meta.id, ev.titulo)
                                    }
                                    title="Eliminar reunión"
                                    className="p-0.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer"
                                  >
                                    <Icon name="trash" size={13} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {ev.tipo === "minuta" && (
                            <>
                              {ev.meta?.adjunto_url &&
                                (/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(
                                  ev.meta.adjunto_nombre || ev.meta.adjunto_url,
                                ) ? (
                                  <a
                                    href={ev.meta.adjunto_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block mt-1"
                                  >
                                    <img
                                      src={ev.meta.adjunto_url}
                                      alt={ev.meta.adjunto_nombre || "adjunto"}
                                      className="max-h-40 rounded-lg border border-slate-200"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={ev.meta.adjunto_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-block mt-1 text-[10px] font-bold text-blue-600 hover:underline"
                                  >
                                    {ev.meta.adjunto_nombre || "Ver adjunto"}
                                  </a>
                                ))}
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {ev.meta?.reunionTitulo && (
                                  <span className="text-[9.5px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1 py-0.5">
                                    en reunión: {ev.meta.reunionTitulo}
                                  </span>
                                )}
                                <button
                                  onClick={() => handleDeleteMinuta(ev.meta.id)}
                                  title="Eliminar minuta"
                                  className="ml-auto p-0.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer"
                                >
                                  <Icon name="trash" size={13} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Único para Agendar */}
      {isScheduleModalOpen && (
        <ModalOverlay onClose={() => setIsScheduleModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {scheduleMode === "reunion"
                    ? "Agendar Sesión de Trabajo"
                    : "Asignar Tarea"}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {scheduleMode === "reunion"
                    ? "Selecciona si la sesión será presencial o una revisión online"
                    : "Asigna una nueva tarea a un integrante del equipo"}
                </p>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-slate-400 cursor-pointer hover:text-slate-600"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 text-xs">
              <button
                type="button"
                onClick={() => setScheduleMode("reunion")}
                className={`flex-1 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  scheduleMode === "reunion"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600"
                }`}
              >
                Agendar Reunión
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode("tarea")}
                className={`flex-1 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  scheduleMode === "tarea"
                    ? "bg-white text-blue-600 shadow-2xs"
                    : "text-slate-600"
                }`}
              >
                Asignar Tarea
              </button>
            </div>

            {scheduleMode === "reunion" && (
              <form
                onSubmit={handleCreateMeeting}
                className="space-y-2 text-xs"
              >
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Tipo de Sesión
                  </label>
                  <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setMeetingFormData({
                          ...meetingFormData,
                          modalidad: "presencial",
                        })
                      }
                      className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                        meetingFormData.modalidad === "presencial"
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600"
                      }`}
                    >
                      Reunión (Presencial)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMeetingFormData({
                          ...meetingFormData,
                          modalidad: "virtual",
                        })
                      }
                      className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                        meetingFormData.modalidad === "virtual"
                          ? "bg-white text-blue-600 shadow-2xs"
                          : "text-slate-600"
                      }`}
                    >
                      Revisión (Virtual Zoom)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    {meetingFormData.modalidad === "presencial"
                      ? "Título de la Reunión"
                      : "Título de la Revisión"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      meetingFormData.modalidad === "presencial"
                        ? "Ej. Reunión de Alineación General"
                        : "Ej. Revisión de Avances del Proyecto"
                    }
                    value={meetingFormData.titulo}
                    onChange={(e) =>
                      setMeetingFormData({
                        ...meetingFormData,
                        titulo: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {meetingFormData.tareaDueDate && (
                  <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-1.5 text-[11px] text-amber-800 font-semibold flex items-center gap-1">
                    <span>
                      Fecha límite de la tarea:{" "}
                      <strong>
                        {formatFechaLimite(meetingFormData.tareaDueDate)}
                      </strong>
                    </span>
                  </div>
                )}

                {meetingFormData.modalidad === "presencial" ? (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Lugar
                    </label>
                    <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setMeetingFormData({
                            ...meetingFormData,
                            lugar: "Oficina Ing. Luis",
                          })
                        }
                        className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                          meetingFormData.lugar === "Oficina Ing. Luis"
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600"
                        }`}
                      >
                        Oficina Ing. Luis
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMeetingFormData({
                            ...meetingFormData,
                            lugar: "Comedor",
                          })
                        }
                        className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                          meetingFormData.lugar === "Comedor"
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600"
                        }`}
                      >
                        Comedor
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase">
                        Enlace de Zoom
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateZoomMeeting}
                        disabled={isGeneratingZoom}
                        className="text-[10px] text-blue-600 font-bold hover:underline bg-blue-50 px-1.5 py-1 rounded-md cursor-pointer transition-colors"
                      >
                        {isGeneratingZoom
                          ? "Generando..."
                          : "Generar Enlace Zoom"}
                      </button>
                    </div>
                    <input
                      type="url"
                      required
                      placeholder="https://us05web.zoom.us/j/123456789..."
                      value={meetingFormData.link}
                      onChange={(e) =>
                        setMeetingFormData({
                          ...meetingFormData,
                          link: e.target.value,
                        })
                      }
                      className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Proyecto Asociado
                  </label>
                  <select
                    value={meetingFormData.proyectoId}
                    onChange={(e) =>
                      setMeetingFormData({
                        ...meetingFormData,
                        proyectoId: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Todos los Proyectos / General</option>
                    {dbProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Fecha y Hora de Reunion
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={meetingFormData.fechaInicio}
                    onChange={(e) =>
                      setMeetingFormData({
                        ...meetingFormData,
                        fechaInicio: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Convocados
                  </label>
                  <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setMeetingFormData({
                          ...meetingFormData,
                          targetType: "todos",
                        })
                      }
                      className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                        meetingFormData.targetType === "todos"
                          ? "bg-white text-blue-600 shadow-2xs"
                          : "text-slate-600"
                      }`}
                    >
                      Todo el Equipo
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMeetingFormData({
                          ...meetingFormData,
                          targetType: "seleccionados",
                        })
                      }
                      className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                        meetingFormData.targetType === "seleccionados"
                          ? "bg-white text-blue-600 shadow-2xs"
                          : "text-slate-600"
                      }`}
                    >
                      Seleccionar
                    </button>
                  </div>
                </div>

                {meetingFormData.targetType === "seleccionados" && (
                  <div className="max-h-32 overflow-y-auto border border-slate-300 rounded-xl p-1 space-y-1 bg-white">
                    {dbEmployees.map((emp) => {
                      const isChecked =
                        meetingFormData.selectedEmployeeIds.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className={`flex items-center gap-1 p-1 rounded-lg cursor-pointer text-xs ${isChecked ? "bg-blue-50 text-blue-900 font-bold" : "hover:bg-slate-50 text-slate-800"}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              handleToggleEmployeeSelection(emp.id)
                            }
                            className="rounded text-blue-600"
                          />
                          <span>{emp.nombre}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Notas / Orden del Día
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Puntos clave de la sesión..."
                    value={meetingFormData.descripcion}
                    onChange={(e) =>
                      setMeetingFormData({
                        ...meetingFormData,
                        descripcion: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                  />
                </div>

                <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsScheduleModalOpen(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingMeeting}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-xl font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    {isSavingMeeting ? "Guardando..." : "Confirmar & Notificar"}
                  </button>
                </div>
              </form>
            )}

            {scheduleMode === "tarea" && (
              <form onSubmit={handleAssignTask} className="space-y-2 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Integrante
                  </label>
                  <select
                    required
                    value={newTaskFormData.empleadoId}
                    onChange={(e) =>
                      setNewTaskFormData({
                        ...newTaskFormData,
                        empleadoId: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">— Selecciona un integrante —</option>
                    {dbEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Título de la Tarea
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Integración de endpoint de autenticación"
                    value={newTaskFormData.titulo}
                    onChange={(e) =>
                      setNewTaskFormData({
                        ...newTaskFormData,
                        titulo: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Proyecto
                  </label>
                  <select
                    required
                    value={newTaskFormData.proyectoId}
                    onChange={(e) =>
                      setNewTaskFormData({
                        ...newTaskFormData,
                        proyectoId: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">— Selecciona un proyecto —</option>
                    {dbProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Prioridad
                    </label>
                    <select
                      value={newTaskFormData.prioridad}
                      onChange={(e) =>
                        setNewTaskFormData({
                          ...newTaskFormData,
                          prioridad: e.target.value as any,
                        })
                      }
                      className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="Baja">Baja</option>
                      <option value="Media">Media</option>
                      <option value="Alta">Alta</option>
                      <option value="Urgente">Urgente</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Fecha Límite
                    </label>
                    <input
                      type="date"
                      value={newTaskFormData.fechaLimite}
                      onChange={(e) =>
                        setNewTaskFormData({
                          ...newTaskFormData,
                          fechaLimite: e.target.value,
                        })
                      }
                      className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Descripción / Indicaciones
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Instrucciones específicas de la tarea..."
                    value={newTaskFormData.descripcion}
                    onChange={(e) =>
                      setNewTaskFormData({
                        ...newTaskFormData,
                        descripcion: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                  />
                </div>

                <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsScheduleModalOpen(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTask}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-xl font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    {isSavingTask ? "Guardando..." : "Asignar Tarea"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </ModalOverlay>
      )}

      <div className="hidden xl:block p-2 md:p-3 pl-0 h-full shrink-0">
        <KpisPanel />
      </div>
    </div>
  );
}
