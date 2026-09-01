"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Sidebar from "../components/Sidebar";
import TaskCard from "../components/Taskcard";
import { Icon } from "../components/icons";
import { formatFechaLimite } from "../lib/dates";
import { supabase } from "../lib/supabaseClient";
import { getCurrentAdminId } from "../lib/currentAdmin";
import { PALETA_EMPLEADOS, colorLibreEmpleado } from "../lib/coloresEmpleados";
import { ModalOverlay } from "../components/ModalOverlay";

// Áreas del organigrama (bajo cada Coordinador) — usadas para agrupar a los
// Trabajadores en el panel "Equipo" del calendario de revisiones.
const AREAS = [
  "Administrativo y RRHH",
  "Proyectos y Obra",
  "TICs",
  "Financiero-Contable",
];

// 🛠️ Funciones para dar formato a fecha y hora
const formatDate = (dateString?: string | null) => {
  if (!dateString) return "Sin fecha";
  const date = new Date(
    dateString.includes("T") ? dateString : `${dateString}T00:00:00`,
  );
  if (isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateTime = (dateString?: string | null) => {
  if (!dateString) return "Reciente";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// 🏆 Niveles de recompensa por puntos acumulados (empleados.puntos_recompensa).
// Los puntos se otorgan automáticamente por trigger en Supabase cuando una tarea
// pasa a "Completada" (10 base + hasta 10 extra por anticipación a la fecha límite).
const NIVELES_RECOMPENSA = [
  { min: 0, label: "Bronce" },
  { min: 300, label: "Plata" },
  { min: 800, label: "Oro" },
  { min: 1500, label: "Diamante" },
];

const getNivelRecompensa = (puntos: number) => {
  let actual = NIVELES_RECOMPENSA[0];
  let siguiente: (typeof NIVELES_RECOMPENSA)[number] | null = null;
  for (let i = 0; i < NIVELES_RECOMPENSA.length; i++) {
    if (puntos >= NIVELES_RECOMPENSA[i].min) {
      actual = NIVELES_RECOMPENSA[i];
      siguiente = NIVELES_RECOMPENSA[i + 1] || null;
    }
  }
  const progresoPct = siguiente
    ? Math.min(
        100,
        Math.round(
          ((puntos - actual.min) / (siguiente.min - actual.min)) * 100,
        ),
      )
    : 100;
  return { actual, siguiente, progresoPct };
};

interface Task {
  id: number | string;
  title: string;
  project: string;
  projectId?: string;
  description?: string;
  priority?: "Baja" | "Media" | "Alta" | "Urgente";
  status: "Completada" | "En Proceso" | "Pendiente" | "Postergada";
  progressPercent?: number;
  date: string;
  dueDate?: string;
  assignedByName?: string;
  isCritical?: boolean;
  slackDays?: number;
  dependsOnTaskId?: number;
  dependsOnTaskTitle?: string;
  collaborators?: { id: string; name: string }[];
  collaboratorsNames?: string[];
}

interface LegalDocument {
  id: string;
  name: string;
  required: boolean;
  status: "Verificado" | "Pendiente" | "Por Vencer";
  expirationDate?: string;
  fileUrl?: string;
}

interface ContractDetails {
  contractType:
    | "Servicio Social"
    | "Prácticas Profesionales"
    | "Tiempo Completo"
    | "Medio Tiempo"
    | "Tiempo Indeterminado";
  startDate: string;
  endDate?: string;
  stipendOrSalary?: string;
  supervisor: string;
  hasTransitioned?: boolean;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  nivel?: string;
  area?: string | null;
  especialidad?: string;
  currentTask: string;
  currentProject: string;
  currentTaskDependency?: string;
  status: "Ocupado" | "Disponible";
  avatar: string | null;
  color?: string;
  completedTasksCount: number;
  horasAcumuladas?: number;
  horasTotalesObjetivo?: number;
  puntosRecompensa: number;
  taskHistory: Task[];
  documents: LegalDocument[];
  contract: ContractDetails;
}

interface PluginNotification {
  id: string;
  employeeId?: string;
  employeeName: string;
  taskId?: string;
  taskTitle: string;
  taskDueDate?: string | null;
  projectId?: string;
  projectName: string;
  duration?: string;
  timestamp: string;
  estado?: "Pendiente" | "Aprobado" | "Rechazado";
  evidenceUrl?: string | null;
  evidenceName?: string | null;
}

interface DbProject {
  id: string;
  nombre: string;
  descripcion?: string;
}

interface DocumentRequirement {
  idTemp: string;
  nombre: string;
  obligatorio: boolean;
  archivo?: File | null;
}

export default function AdminDashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );
  const [notifications, setNotifications] = useState<PluginNotification[]>([]);
  // Historial de puntos de recompensa (tabla real `recompensa_historial`, llenada
  // por el trigger de Supabase al completar tareas) — se filtra por empleado en el render.
  const [recompensaHistorial, setRecompensaHistorial] = useState<
    {
      id: string;
      empleado_id: string;
      puntos: number;
      motivo: string;
      created_at: string;
    }[]
  >([]);
  // Modal de "⏱️ Tiempo Extra" / nueva fecha límite (reemplaza el window.prompt nativo).
  const [extendDeadlineTarget, setExtendDeadlineTarget] = useState<{
    id: string | number;
    title: string;
    currentDueDate?: string;
    rejectNotif?: PluginNotification;
  } | null>(null);
  const [extendDeadlineValue, setExtendDeadlineValue] = useState("");
  // IDs de notificaciones ya notificadas al navegador. `null` = todavía no cargamos
  // por primera vez — así no se dispara una ráfaga de notificaciones del navegador
  // por todo lo que ya estaba pendiente antes de abrir la pestaña.
  const notifiedIdsRef = useRef<Set<string> | null>(null);
  const [dbProjects, setDbProjects] = useState<DbProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [teamFilter, setTeamFilter] = useState<
    "todos" | "trabajadores" | "estudiantes"
  >("todos");
  const [teamProjectFilter, setTeamProjectFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<
    "actividad" | "documentos" | "contrato" | "recompensas"
  >("actividad");

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isNewEmployeeModalOpen, setIsNewEmployeeModalOpen] = useState(false);
  const [isTransformModalOpen, setIsTransformModalOpen] = useState(false);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeMetricModal, setActiveMetricModal] = useState<
    "totales" | "ocupados" | "disponibles" | "completadas" | null
  >(null);

  // 📌 ESTADOS DE ASIGNACIÓN DE TAREA
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<
    "Baja" | "Media" | "Alta" | "Urgente"
  >("Media");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [dependsOnTaskId, setDependsOnTaskId] = useState<string>("none");

  // 🤝 SELECCIÓN MÚLTIPLE DE COLABORADORES
  const [selectedCollaboratorIds, setSelectedCollaboratorIds] = useState<
    string[]
  >([]);

  const [nuevoDocNombre, setNuevoDocNombre] = useState("");
  const [nuevoDocObligatorio, setNuevoDocObligatorio] = useState(true);

  // 🔑 ID del administrador con sesión iniciada (quien asigna la tarea). Ya no se
  // pregunta por selector: siempre es quien está usando el panel en ese momento.
  const [currentAdminId, setCurrentAdminId] = useState<string>("");

  useEffect(() => {
    getCurrentAdminId().then((id) => {
      if (id) setCurrentAdminId(id);
    });
  }, []);

  const [newEmployeeData, setNewEmployeeData] = useState<{
    nombre: string;
    correo: string;
    password: string;
    rol: string;
    customRol: string;
    nivel: string;
    area: string;
    especialidad: string;
    disponibilidad: string;
    horasTotalesObjetivo: string;
    remuneracion: string;
    color: string;
    documentos: DocumentRequirement[];
  }>({
    nombre: "",
    correo: "",
    password: "",
    rol: "Practicante",
    customRol: "",
    nivel: "Trabajador",
    area: "",
    especialidad: "",
    disponibilidad: "Disponible",
    horasTotalesObjetivo: "480",
    remuneracion: "3000",
    color: "#2563eb",
    documentos: [
      {
        idTemp: "1",
        nombre: "Identificación Oficial (INE / Pasaporte)",
        obligatorio: true,
        archivo: null,
      },
      {
        idTemp: "2",
        nombre: "Carta de Confidencialidad (NDA)",
        obligatorio: true,
        archivo: null,
      },
      {
        idTemp: "3",
        nombre: "Contrato por tiempo definido",
        obligatorio: true,
        archivo: null,
      },
    ],
  });

  const [transformFormData, setTransformFormData] = useState({
    nuevoRol: "Desarrollador Web",
    tipoContrato: "Tiempo Indeterminado" as ContractDetails["contractType"],
    sueldo: "15000",
    supervisor: "Coordinación General",
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [editFormData, setEditFormData] = useState({
    nombre: "",
    correo: "",
    rol: "Practicante",
    nivel: "Trabajador",
    area: "",
    especialidad: "",
    disponibilidad: "Disponible",
    horasTotalesObjetivo: "480",
    remuneracion: "15000",
    color: "#2563eb",
  });

  const getDocFolder = (docName: string): string => {
    const lower = docName.toLowerCase();
    if (
      lower.includes("ine") ||
      lower.includes("identificación") ||
      lower.includes("pasaporte")
    ) {
      return "INES/";
    }
    if (
      lower.includes("nda") ||
      lower.includes("confidencialidad") ||
      lower.includes("carta")
    ) {
      return "cartas_confi/";
    }
    if (lower.includes("contrato")) {
      return "contratos/";
    }
    return "";
  };

  const handleToggleCollaborator = (empId: string) => {
    setSelectedCollaboratorIds((prev) =>
      prev.includes(empId)
        ? prev.filter((id) => id !== empId)
        : [...prev, empId],
    );
  };

  // 🔄 CARGA GENERAL DESDE SUPABASE
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      // A) Proyectos
      const { data: proyectosData, error: projError } = await supabase
        .from("proyectos")
        .select("*");
      if (projError) console.error("Error proyectos:", projError);

      const proyectosSafe = proyectosData || [];
      setDbProjects(proyectosSafe);
      if (proyectosSafe.length > 0 && !selectedProjectId) {
        setSelectedProjectId(proyectosSafe[0].id);
      }

      // B) Empleados
      const { data: empleadosData, error: empError } = await supabase.from(
        "empleados",
      ).select(`
          *,
          tareas:tareas!tareas_empleado_id_fkey (*),
          contratos (*),
          documentos_legales (*)
        `);

      if (empError) throw new Error(empError.message);

      if (empleadosData) {
        const mappedEmployees: Employee[] = empleadosData.map((emp: any) => {
          const rawTasks = emp.tareas || [];
          const activeTask = rawTasks.find(
            (t: any) => t.estado === "En Proceso" || t.estado === "Pendiente",
          );
          const activeProj = proyectosSafe.find(
            (p: any) => p.id === activeTask?.proyecto_id,
          );
          const contract = emp.contratos?.[0] || {};

          const mappedHistory: Task[] = rawTasks.map((t: any) => {
            const parentTask = rawTasks.find(
              (p: any) => p.id === t.depende_de_tarea_id,
            );
            const proj = proyectosSafe.find((p: any) => p.id === t.proyecto_id);

            const collabIds: string[] = Array.isArray(t.colaboradores_ids)
              ? t.colaboradores_ids
              : [];
            const collabList = collabIds
              .map((id) => {
                const found = empleadosData.find((e: any) => e.id === id);
                return found ? { id: found.id, name: found.nombre } : null;
              })
              .filter(Boolean) as { id: string; name: string }[];

            const collabNames = collabList.map((c) => c.name);

            // Normalizar estado
            let normalizedStatus:
              "Completada" | "En Proceso" | "Pendiente" | "Postergada" =
              "Pendiente";
            const rawStatus = (t.estado || "").toLowerCase();
            if (rawStatus.includes("completa")) normalizedStatus = "Completada";
            else if (rawStatus.includes("proceso"))
              normalizedStatus = "En Proceso";
            else if (
              rawStatus.includes("posterga") ||
              rawStatus.includes("reagenda")
            )
              normalizedStatus = "Postergada";

            return {
              id: t.id,
              title: t.titulo || "Sin título",
              project: proj?.nombre || "General",
              projectId: t.proyecto_id,
              description: t.descripcion || "",
              priority: (t.prioridad as any) || "Media",
              status: normalizedStatus,
              progressPercent:
                t.porcentaje_avance ??
                (normalizedStatus === "Completada" ? 100 : 0),
              date:
                normalizedStatus === "Completada" && t.fecha_completado
                  ? formatDate(t.fecha_completado)
                  : formatDate(t.fecha_asignada),
              dueDate: formatFechaLimite(t.fecha_limite),
              assignedByName:
                empleadosData.find((e: any) => e.id === t.asignada_por)
                  ?.nombre || "Administrador",
              isCritical: Boolean(t.es_critica),
              slackDays: t.holgura_dias ?? 0,
              dependsOnTaskId: t.depende_de_tarea_id,
              dependsOnTaskTitle: parentTask?.titulo,
              collaborators: collabList,
              collaboratorsNames: collabNames,
            };
          });

          const activeParentTask = rawTasks.find(
            (p: any) => p.id === activeTask?.depende_de_tarea_id,
          );

          return {
            id: emp.id,
            name: emp.nombre || "Integrante sin nombre",
            email: emp.username || "correo@empresa.com",
            role: emp.rol || "Practicante",
            nivel: emp.nivel || "Trabajador",
            area: emp.area || null,
            especialidad: emp.especialidad || "General",
            currentTask: activeTask
              ? activeTask.titulo
              : "Sin tareas asignadas aún",
            currentProject: activeProj?.nombre || "Sin Proyecto",
            currentTaskDependency: activeParentTask?.titulo,
            status: emp.disponibilidad ? "Disponible" : "Ocupado",
            avatar: emp.avatar_url || null,
            color: emp.color || "#2563eb",
            completedTasksCount: mappedHistory.filter(
              (t) => t.status === "Completada",
            ).length,
            horasAcumuladas: emp.horas_acumuladas || 0,
            horasTotalesObjetivo: emp.horas_totales_objetivo,
            puntosRecompensa: emp.puntos_recompensa || 0,
            taskHistory: mappedHistory,
            documents: (emp.documentos_legales || []).map((d: any) => ({
              id: d.id,
              name: d.nombre_documento || "Documento",
              required: d.es_obligatorio ?? true,
              status: d.estado || "Pendiente",
              expirationDate: formatDate(d.fecha_vencimiento),
              fileUrl: d.archivo_path,
            })),
            contract: {
              contractType:
                contract.tipo_contrato || emp.rol || "Tiempo Indeterminado",
              startDate: formatDate(contract.fecha_inicio || "2026-01-01"),
              endDate: formatDate(contract.fecha_fin),
              stipendOrSalary: contract.remuneracion_o_beca || "No asignado",
              supervisor: contract.supervisor || "Coordinación General",
              hasTransitioned: contract.ha_transicionado,
            },
          };
        });

        setEmployees(mappedEmployees);

        if (mappedEmployees.length > 0) {
          setSelectedEmployee((prev) => {
            if (!prev) return mappedEmployees[0];
            return (
              mappedEmployees.find((e) => e.id === prev.id) ||
              mappedEmployees[0]
            );
          });
        } else {
          setSelectedEmployee(null);
        }
      }

      // B.1) Historial de puntos de recompensa — tabla real llenada por el trigger
      // de Supabase (fn_otorgar_puntos_tarea_completada), no por este dashboard.
      const { data: recompensaData, error: recompensaErr } = await supabase
        .from("recompensa_historial")
        .select("id, empleado_id, puntos, motivo, created_at")
        .order("created_at", { ascending: false });
      if (!recompensaErr && recompensaData)
        setRecompensaHistorial(recompensaData as any);

      // C) Consultar Notificaciones (incluye la fecha límite de la tarea vinculada)
      const { data: notifData, error: notifErr } = await supabase
        .from("notificaciones")
        .select(
          `
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
        `,
        )
        .eq("estado", "Pendiente")
        .order("created_at", { ascending: false });

      if (!notifErr && notifData) {
        const mappedNotifs: PluginNotification[] = notifData.map((n: any) => ({
          id: n.id,
          employeeId: n.empleado_id,
          employeeName: n.empleados?.nombre || "Integrante",
          taskId: n.tarea_id != null ? String(n.tarea_id) : undefined,
          taskTitle: n.titulo_tarea || "Revisión de código",
          taskDueDate: n.tareas?.fecha_limite || null,
          evidenceUrl: n.evidencia_url || null,
          evidenceName: n.evidencia_nombre || null,
          projectId: n.proyecto_id,
          projectName: n.proyectos?.nombre || "Proyecto General",
          timestamp: formatDateTime(n.created_at),
          estado: n.estado,
        }));
        syncNotifications(mappedNotifs);
      }
    } catch (error: any) {
      console.error("Error al sincronizar datos con Supabase:", error);
      setErrorMessage(error?.message || "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  // 🔔 Compara contra lo ya visto y dispara una notificación nativa del navegador por
  // cada solicitud nueva (Web Notifications API — solo funciona con la pestaña
  // abierta/en background, no reemplaza push real). Pendiente para más adelante: llevar
  // esto mismo a móvil requiere un canal aparte (service worker + push subscription,
  // ej. FCM/APNs) porque esta API no llega a dispositivos sin la pestaña activa.
  const syncNotifications = (mappedNotifs: PluginNotification[]) => {
    const currentIds = new Set(mappedNotifs.map((n) => n.id));

    if (notifiedIdsRef.current === null) {
      notifiedIdsRef.current = currentIds;
    } else {
      const nuevas = mappedNotifs.filter(
        (n) => !notifiedIdsRef.current!.has(n.id),
      );
      if (
        nuevas.length > 0 &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        nuevas.forEach((n) => {
          const notif = new Notification("Nueva solicitud de revisión", {
            body: n.taskTitle,
            icon: "/icono_rocal.png",
            tag: n.id,
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        });
      }
      notifiedIdsRef.current = currentIds;
    }

    setNotifications(mappedNotifs);
  };

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Poll ligero (cada 30s) solo de la tabla 'notificaciones' — el resto del dashboard
  // (empleados, proyectos) no cambia con esa frecuencia y no vale la pena refrescarlo
  // completo solo para detectar solicitudes nuevas.
  useEffect(() => {
    const pollNotifications = async () => {
      const { data: notifData, error } = await supabase
        .from("notificaciones")
        .select(
          `
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
        `,
        )
        .eq("estado", "Pendiente")
        .order("created_at", { ascending: false });

      if (!error && notifData) {
        const mappedNotifs: PluginNotification[] = notifData.map((n: any) => ({
          id: n.id,
          employeeId: n.empleado_id,
          employeeName: n.empleados?.nombre || "Integrante",
          taskId: n.tarea_id != null ? String(n.tarea_id) : undefined,
          taskTitle: n.titulo_tarea || "Revisión de código",
          taskDueDate: n.tareas?.fecha_limite || null,
          evidenceUrl: n.evidencia_url || null,
          evidenceName: n.evidencia_nombre || null,
          projectId: n.proyecto_id,
          projectName: n.proyectos?.nombre || "Proyecto General",
          timestamp: formatDateTime(n.created_at),
          estado: n.estado,
        }));
        syncNotifications(mappedNotifs);
      }
    };

    const intervalId = setInterval(pollNotifications, 30000);
    return () => clearInterval(intervalId);
  }, []);

  // Aprobar/Rechazar una tarea que el empleado envió a revisión ('En Revisión').
  // Aprobar la completa de verdad (tarea + calendario) de inmediato. Rechazar NO toca
  // la base de datos todavía — abre el modal de nueva fecha límite y la notificación
  // se resuelve solo hasta que se confirme ahí (handleConfirmExtendDeadline). Si el
  // admin cierra/cancela el modal, la notificación sigue pendiente para reintentar.
  const handleResolveNotification = async (
    notif: PluginNotification,
    nuevoEstado: "Aprobado" | "Rechazado",
  ) => {
    const taskIdNum = notif.taskId ? parseInt(notif.taskId, 10) : NaN;

    if (nuevoEstado === "Rechazado") {
      const { data: tareaRechazada } = await supabase
        .from("tareas")
        .select("titulo, fecha_limite")
        .eq("id", taskIdNum)
        .maybeSingle();

      handleExtendDeadline(
        taskIdNum,
        (tareaRechazada as any)?.titulo || notif.taskTitle,
        (tareaRechazada as any)?.fecha_limite || notif.taskDueDate || undefined,
        notif,
      );
      return;
    }

    try {
      const { error } = await supabase
        .from("notificaciones")
        .update({ estado: nuevoEstado })
        .eq("id", notif.id);

      if (error) throw error;

      if (!isNaN(taskIdNum)) {
        await (supabase.from("tareas") as any)
          .update({
            estado: "Completada",
            porcentaje_avance: 100,
            fecha_completado: new Date().toISOString(),
          })
          .eq("id", taskIdNum);

        await (supabase.from("reuniones") as any)
          .update({ estado: "Completada" })
          .eq("tarea_id", taskIdNum)
          .neq("estado", "Completada");
      }

      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      await fetchDashboardData();
    } catch (err: any) {
      console.error("Error resolviendo notificación:", err);
    }
  };

  // ⏱️ EXTENDER FECHA LÍMITE. Esta plataforma web es exclusiva para Administradores
  // (ver login/page.tsx) — no hay un flujo de "empleado solicita, admin aprueba" aquí,
  // el admin tiene autoridad directa sobre la tarea que está viendo, así que el botón
  // actualiza la fecha límite de una vez en vez de generar una solicitud pendiente.
  // Solo abre el modal — la actualización real la hace handleConfirmExtendDeadline.
  // `rejectNotif` solo se pasa cuando se abre desde "Rechazar": marca que al confirmar
  // también hay que resolver esa notificación y regresar la tarea a 'En Proceso'.
  const handleExtendDeadline = (
    taskId: string | number,
    taskTitle: string,
    currentDueDate?: string,
    rejectNotif?: PluginNotification,
  ) => {
    setExtendDeadlineValue("");
    setExtendDeadlineTarget({
      id: taskId,
      title: taskTitle,
      currentDueDate,
      rejectNotif,
    });
  };

  const handleConfirmExtendDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendDeadlineTarget || !extendDeadlineValue) return;

    try {
      const updatePayload: any = { fecha_limite: extendDeadlineValue };
      if (extendDeadlineTarget.rejectNotif) {
        updatePayload.estado = "En Proceso";
      }

      const { error } = await supabase
        .from("tareas")
        .update(updatePayload)
        .eq("id", extendDeadlineTarget.id);

      if (error) throw error;

      if (extendDeadlineTarget.rejectNotif) {
        const notif = extendDeadlineTarget.rejectNotif;
        await supabase
          .from("notificaciones")
          .update({ estado: "Rechazado" })
          .eq("id", notif.id);

        setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      }

      setExtendDeadlineTarget(null);
      await fetchDashboardData();
    } catch (err: any) {
      console.error("Error extendiendo fecha límite:", err);
      alert(
        "No se pudo actualizar la fecha límite: " +
          (err.message || "Error de conexión"),
      );
    }
  };

  const filteredEmployees = useMemo(() => {
    const proyectoNombre =
      teamProjectFilter === "all"
        ? null
        : dbProjects.find((p) => p.id === teamProjectFilter)?.nombre;

    return employees.filter((emp) => {
      const esEstudiante =
        emp.role === "Practicante" || emp.role === "Servicio Social";
      if (teamFilter === "trabajadores" && esEstudiante) return false;
      if (teamFilter === "estudiantes" && !esEstudiante) return false;
      if (proyectoNombre && emp.currentProject !== proyectoNombre) return false;
      return true;
    });
  }, [employees, teamFilter, teamProjectFilter, dbProjects]);

  const totalEmployees = employees.length;
  const activeNow = employees.filter((e) => e.status === "Ocupado").length;
  const available = employees.filter((e) => e.status === "Disponible").length;

  const completedTasksCount = employees.reduce((acc, emp) => {
    const historicalCompleted = emp.taskHistory.filter(
      (t) => t.status === "Completada",
    ).length;
    return acc + emp.completedTasksCount + historicalCompleted;
  }, 0);

  const totalTasksCount = employees.reduce((acc, emp) => {
    const activeTaskCount =
      emp.currentTask &&
      emp.currentTask !== "Sin tareas asignadas aún" &&
      !emp.currentTask.startsWith("Ninguna")
        ? 1
        : 0;
    return (
      acc + emp.taskHistory.length + activeTaskCount + emp.completedTasksCount
    );
  }, 0);

  const renderAvatar = (avatarSrc: string | null | undefined, name: string) => {
    if (
      avatarSrc &&
      (avatarSrc.startsWith("http") ||
        avatarSrc.startsWith("data:") ||
        avatarSrc.startsWith("/"))
    ) {
      return (
        <img
          src={avatarSrc}
          alt={name}
          className="w-full h-full object-cover"
        />
      );
    }

    const initials = name
      ? name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : "";

    return (
      <div className="w-full h-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs">
        {initials}
      </div>
    );
  };

  const handleAddDocumentRequirement = () => {
    if (!nuevoDocNombre.trim()) return;
    setNewEmployeeData((prev) => ({
      ...prev,
      documentos: [
        ...prev.documentos,
        {
          idTemp: Date.now().toString(),
          nombre: nuevoDocNombre.trim(),
          obligatorio: nuevoDocObligatorio,
          archivo: null,
        },
      ],
    }));
    setNuevoDocNombre("");
    setNuevoDocObligatorio(true);
  };

  const handleRemoveDocumentRequirement = (idTemp: string) => {
    setNewEmployeeData((prev) => ({
      ...prev,
      documentos: prev.documentos.filter((d) => d.idTemp !== idTemp),
    }));
  };

  const handleDocFileSelect = (idTemp: string, file: File | null) => {
    setNewEmployeeData((prev) => ({
      ...prev,
      documentos: prev.documentos.map((doc) =>
        doc.idTemp === idTemp ? { ...doc, archivo: file } : doc,
      ),
    }));
  };

  const handleUploadSingleDoc = async (
    docId: string,
    file: File,
    docName: string,
  ) => {
    if (!selectedEmployee) return;
    setUploadingDocId(docId);

    try {
      const fileExt = file.name.split(".").pop();
      const folder = getDocFolder(docName);
      const fileName = `${folder}doc_${selectedEmployee.id}_${Date.now()}.${fileExt}`;

      const { error: uploadErr } = await supabase.storage
        .from("documentacion")
        .upload(fileName, file);

      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage
        .from("documentacion")
        .getPublicUrl(fileName);

      const publicUrl = publicUrlData?.publicUrl;

      const { error: dbErr } = await supabase
        .from("documentos_legales")
        .update({
          archivo_path: publicUrl,
          estado: "Verificado",
        })
        .eq("id", docId);

      if (dbErr) throw dbErr;

      await fetchDashboardData();
    } catch (err: any) {
      console.error("Error al subir el documento:", err);
      alert(err.message || "Error al subir el documento");
    } finally {
      setUploadingDocId(null);
    }
  };

  // 📌 ASIGNACIÓN DE TAREA
  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !selectedEmployee) return;

    try {
      const parentTaskIdInt =
        dependsOnTaskId !== "none" ? parseInt(dependsOnTaskId, 10) : null;
      const targetProjectId =
        selectedProjectId || (dbProjects.length > 0 ? dbProjects[0].id : null);

      if (!targetProjectId) {
        alert("Debes seleccionar o tener registrado al menos un proyecto.");
        return;
      }

      const assignedByAdminId = currentAdminId || selectedEmployee.id;

      const taskPayload: any = {
        empleado_id: selectedEmployee.id,
        proyecto_id: targetProjectId,
        titulo: newTaskTitle.trim(),
        descripcion: newTaskDescription.trim() || null,
        estado: dependsOnTaskId !== "none" ? "Pendiente" : "En Proceso",
        prioridad: newTaskPriority,
        asignada_por: assignedByAdminId,
        fecha_asignada: new Date().toISOString().split("T")[0],
        fecha_limite: newTaskDueDate || null,
        depende_de_tarea_id: parentTaskIdInt,
        colaboradores_ids:
          selectedCollaboratorIds.length > 0 ? selectedCollaboratorIds : null,
      };

      const { data: nuevaTarea, error } = await supabase
        .from("tareas")
        .insert(taskPayload)
        .select("id")
        .single();

      if (error) throw error;

      await supabase
        .from("empleados")
        .update({ disponibilidad: false })
        .eq("id", selectedEmployee.id);

      // 📅 Si la tarea tiene fecha límite, se manda automáticamente al calendario
      // como un evento de "Fecha Límite" (distinto de una reunión agendada por revisión).
      if (newTaskDueDate && nuevaTarea?.id) {
        // Ojo: construir el Date así (sin offset) hace que JS lo interprete en hora LOCAL
        // del navegador; luego toISOString() lo convierte a UTC correctamente antes de
        // guardarlo. Mandar el string "YYYY-MM-DDT09:00:00" directo a Supabase lo guarda
        // como si 09:00 fuera UTC, y en zonas horarias negativas el evento cae de madrugada,
        // fuera del rango visible (09:00–18:00) del calendario.
        // Duración de 1 hora completa (igual que una reunión normal) para que el
        // ícono circular del evento no quede más alto que su propia casilla en el
        // calendario y se recorte contra el borde de la cuadrícula.
        const dtInicioLimite = new Date(`${newTaskDueDate}T09:00:00`);
        const dtFinLimite = new Date(`${newTaskDueDate}T10:00:00`);

        const { data: nuevaReunion, error: calErr } = await supabase
          .from("reuniones")
          .insert({
            // Título limpio (solo el nombre de la tarea): el ícono ⏳ y la etiqueta "Fecha
            // Límite" ya se muestran aparte en la UI (badge, encabezado del popover, etc.)
            // según `estado`, así que no hace falta — ni conviene — hornearlos en el texto.
            titulo: newTaskTitle.trim(),
            // Sin descripción: el título, el ícono ⏳ y la etiqueta "Fecha Límite" ya
            // dejan claro de qué se trata — repetirlo en una descripción es redundante.
            descripcion: null,
            fecha_inicio: dtInicioLimite.toISOString(),
            fecha_fin: dtFinLimite.toISOString(),
            fecha: newTaskDueDate,
            hora: "09:00 AM",
            estado: "Fecha Límite",
            empleado_id: selectedEmployee.id,
            proyecto_id: targetProjectId,
            tarea_id: nuevaTarea.id,
            creado_por: currentAdminId || null,
          })
          .select("id")
          .single();

        if (calErr) {
          console.error(
            "No se pudo crear el evento de fecha límite en el calendario:",
            calErr,
          );
          alert(
            `La tarea se asignó, pero no se pudo agregar al calendario: ${calErr.message}`,
          );
        } else if (nuevaReunion?.id) {
          // 📅 Con fecha límite sí hay algo que mostrar en el calendario: mandamos ahí
          // directo, con el evento recién creado ya seleccionado/marcado.
          window.location.href = `/admin/revisiones?highlightEventId=${nuevaReunion.id}`;
          return;
        }
      }

      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskPriority("Media");
      setNewTaskDueDate("");
      setDependsOnTaskId("none");
      setSelectedCollaboratorIds([]);
      setIsAssignModalOpen(false);

      await fetchDashboardData();
    } catch (error: any) {
      console.error("Error insertando tarea en Supabase:", error);
      alert(error.message || "Error al asignar la tarea");
    }
  };

  // 📌 REGISTRO DE NUEVO INTEGRANTE
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingUpload(true);

    try {
      const cleanEmail = newEmployeeData.correo.trim().toLowerCase();
      const cleanPassword = newEmployeeData.password?.trim() || "";

      if (!cleanEmail || !cleanPassword) {
        throw new Error("Correo y contraseña son obligatorios.");
      }

      const finalRol =
        newEmployeeData.rol === "Otro"
          ? newEmployeeData.customRol.trim() || "General"
          : newEmployeeData.rol;

      const res = await fetch("/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          nombre: newEmployeeData.nombre.trim(),
          rol: finalRol,
          nivel: newEmployeeData.nivel,
          area: newEmployeeData.area || null,
          especialidad: newEmployeeData.especialidad.trim(),
          disponibilidad: newEmployeeData.disponibilidad,
          horasTotalesObjetivo: newEmployeeData.horasTotalesObjetivo,
          color: newEmployeeData.color || "#2563eb",
          avatarUrl: null,
        }),
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error);

      const newEmp = responseData.employee;

      if (newEmp) {
        const esEstudiante =
          finalRol === "Practicante" || finalRol === "Servicio Social";
        const formattedSalary = newEmployeeData.remuneracion
          ? `$${newEmployeeData.remuneracion} MXN / mes`
          : "Sin Apoyo";

        await supabase.from("contratos").insert({
          empleado_id: newEmp.id,
          tipo_contrato: esEstudiante ? finalRol : "Tiempo Indeterminado",
          fecha_inicio: new Date().toISOString().split("T")[0],
          remuneracion_o_beca: formattedSalary,
          supervisor: "Coordinador de Equipo",
        });

        if (newEmployeeData.documentos.length > 0) {
          const docsToInsert = [];
          for (const doc of newEmployeeData.documentos) {
            let filePublicUrl = null;
            let estadoDoc = "Pendiente";

            if (doc.archivo) {
              const fileExt = doc.archivo.name.split(".").pop();
              const folder = getDocFolder(doc.nombre);
              const fileName = `${folder}doc_${newEmp.id}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

              const { error: docUploadErr } = await supabase.storage
                .from("documentacion")
                .upload(fileName, doc.archivo);

              if (!docUploadErr) {
                const { data: docUrlData } = supabase.storage
                  .from("documentacion")
                  .getPublicUrl(fileName);
                filePublicUrl = docUrlData?.publicUrl || null;
                estadoDoc = "Verificado";
              }
            }

            docsToInsert.push({
              empleado_id: newEmp.id,
              nombre_documento: doc.nombre,
              es_obligatorio: doc.obligatorio,
              archivo_path: filePublicUrl,
              estado: estadoDoc,
            });
          }

          await supabase.from("documentos_legales").insert(docsToInsert);
        }
      }

      setNewEmployeeData({
        nombre: "",
        correo: "",
        password: "",
        rol: "Practicante",
        customRol: "",
        nivel: "Trabajador",
        area: "",
        especialidad: "",
        disponibilidad: "Disponible",
        horasTotalesObjetivo: "480",
        remuneracion: "3000",
        color: "#2563eb",
        documentos: [
          {
            idTemp: "1",
            nombre: "Identificación Oficial (INE / Pasaporte)",
            obligatorio: true,
            archivo: null,
          },
          {
            idTemp: "2",
            nombre: "Carta de Confidencialidad (NDA)",
            obligatorio: true,
            archivo: null,
          },
          {
            idTemp: "3",
            nombre: "Contrato por tiempo definido",
            obligatorio: true,
            archivo: null,
          },
        ],
      });
      setIsNewEmployeeModalOpen(false);

      await fetchDashboardData();
    } catch (error: any) {
      console.error("Error al registrar empleado:", error);
      alert(error.message || "Error al registrar");
    } finally {
      setLoadingUpload(false);
    }
  };

  const handleOpenTransformModal = () => {
    if (!selectedEmployee) return;

    const currentSalaryDigits = selectedEmployee.contract?.stipendOrSalary
      ? selectedEmployee.contract.stipendOrSalary.replace(/[^0-9]/g, "")
      : "15000";

    setTransformFormData({
      nuevoRol:
        selectedEmployee.role === "Practicante" ||
        selectedEmployee.role === "Servicio Social"
          ? "Desarrollador Web"
          : selectedEmployee.role,
      tipoContrato: "Tiempo Indeterminado",
      sueldo: currentSalaryDigits || "15000",
      supervisor:
        selectedEmployee.contract?.supervisor || "Coordinación General",
    });
    setIsTransformModalOpen(true);
  };

  const handleTransformEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    try {
      const formattedSalary = transformFormData.sueldo
        ? `$${transformFormData.sueldo} MXN / mes`
        : "Sin Apoyo";

      await supabase
        .from("empleados")
        .update({
          rol: transformFormData.nuevoRol,
          horas_totales_objetivo: null,
        })
        .eq("id", selectedEmployee.id);

      await supabase.from("contratos").upsert(
        {
          empleado_id: selectedEmployee.id,
          tipo_contrato: transformFormData.tipoContrato,
          remuneracion_o_beca: formattedSalary,
          supervisor: transformFormData.supervisor,
          ha_transicionado: true,
          fecha_inicio: new Date().toISOString().split("T")[0],
        },
        { onConflict: "empleado_id" },
      );

      setIsTransformModalOpen(false);
      await fetchDashboardData();
    } catch (error) {
      console.error("Error actualizando contrato en Supabase:", error);
    }
  };

  const handleEditClick = () => {
    if (!selectedEmployee) return;

    const currentSalaryDigits = selectedEmployee.contract?.stipendOrSalary
      ? selectedEmployee.contract.stipendOrSalary.replace(/[^0-9]/g, "")
      : "0";

    setEditFormData({
      nombre: selectedEmployee.name,
      correo: selectedEmployee.email,
      rol: selectedEmployee.role,
      nivel: selectedEmployee.nivel || "Trabajador",
      area: selectedEmployee.area || "",
      especialidad: selectedEmployee.especialidad || "",
      disponibilidad: selectedEmployee.status,
      horasTotalesObjetivo: String(
        selectedEmployee.horasTotalesObjetivo || 480,
      ),
      remuneracion: currentSalaryDigits,
      color: selectedEmployee.color || "#2563eb",
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    try {
      const esEstudiante =
        editFormData.rol === "Practicante" ||
        editFormData.rol === "Servicio Social";
      const formattedSalary = editFormData.remuneracion
        ? `$${editFormData.remuneracion} MXN / mes`
        : "Sin Apoyo";

      await supabase
        .from("empleados")
        .update({
          nombre: editFormData.nombre,
          username: editFormData.correo,
          rol: editFormData.rol,
          nivel: editFormData.nivel,
          area: editFormData.area || null,
          especialidad: editFormData.especialidad,
          disponibilidad: editFormData.disponibilidad === "Disponible",
          color: editFormData.color,
          horas_totales_objetivo: esEstudiante
            ? parseInt(editFormData.horasTotalesObjetivo) || 480
            : null,
        })
        .eq("id", selectedEmployee.id);

      await supabase.from("contratos").upsert(
        {
          empleado_id: selectedEmployee.id,
          tipo_contrato: editFormData.rol,
          remuneracion_o_beca: formattedSalary,
        },
        { onConflict: "empleado_id" },
      );

      setIsEditModalOpen(false);
      await fetchDashboardData();
    } catch (error) {
      console.error("Error al actualizar empleado:", error);
    }
  };

  const handleDeleteClick = () => {
    if (!selectedEmployee) return;
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedEmployee) return;
    setIsDeleting(true);

    try {
      const empId = selectedEmployee.id;

      await supabase
        .from("documentos_legales")
        .delete()
        .eq("empleado_id", empId);
      await supabase.from("contratos").delete().eq("empleado_id", empId);
      await supabase.from("tareas").delete().eq("empleado_id", empId);

      const { error } = await supabase
        .from("empleados")
        .delete()
        .eq("id", empId);

      if (error) throw error;

      setIsDeleteModalOpen(false);
      setSelectedEmployee(null);
      await fetchDashboardData();
    } catch (error: any) {
      console.error("Error al eliminar empleado de Supabase:", error);
      alert(error.message || "Error al eliminar el integrante.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-50 flex items-center justify-center font-sans p-4">
        <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl shadow-sm px-3.5 py-2.5 animate-[fade-slide-in_0.25s_ease-out]">
          <span className="relative flex w-4 h-4 shrink-0">
            <span className="absolute inset-0 rounded-full border-2 border-slate-200" />
            <span className="absolute inset-0 rounded-full border-2 border-blue-600 border-t-transparent border-r-transparent animate-spin" />
          </span>
          <span className="text-[12px] font-medium text-slate-600">
            Sincronizando con Supabase…
          </span>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="h-screen w-screen bg-slate-50 flex items-center justify-center font-sans p-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 max-w-md w-full shadow-sm text-center space-y-2">
          <span className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <Icon name="alert-triangle" size={18} />
          </span>
          <h3 className="text-[13px] font-semibold text-slate-900">
            Error al consultar Supabase
          </h3>
          <p className="text-[11px] text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 font-mono break-words">
            {errorMessage}
          </p>
          <button
            onClick={fetchDashboardData}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const isEstudianteSelected = selectedEmployee
    ? selectedEmployee.role === "Practicante" ||
      selectedEmployee.role === "Servicio Social"
    : false;
  const porcentajeHoras =
    isEstudianteSelected && selectedEmployee?.horasTotalesObjetivo
      ? Math.min(
          Math.round(
            ((selectedEmployee.horasAcumuladas || 0) /
              selectedEmployee.horasTotalesObjetivo) *
              100,
          ),
          100,
        )
      : 0;

  const hasPendingDocsSelected = selectedEmployee?.documents?.some(
    (d) => d.status === "Pendiente" || d.status === "Por Vencer",
  );

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      <Sidebar />

      <main className="flex-1 flex flex-col p-3 overflow-hidden h-full min-w-0">
        {/* ENCABEZADO */}
        <header className="flex justify-between items-center mb-3 shrink-0">
          <div>
            <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">
              Panel de Control
            </h1>
            <p className="text-[11px] text-slate-500">
              Gestión de equipo, expedientes contractuales y seguimiento de
              actividades
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {/* ÁREA DE NOTIFICACIONES INTERACTIVAS */}
            <div className="relative">
              <button
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="relative p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-center"
              >
                <Icon name="bell" size={16} />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-semibold h-4 min-w-4 px-0.5 rounded-full flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-2">
                  <div className="flex justify-between items-center pb-1.5 mb-1.5 border-b border-slate-100">
                    <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      Solicitudes y entregas ({notifications.length})
                    </h4>
                    <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                      En vivo
                    </span>
                  </div>

                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2 text-center">
                      Sin solicitudes pendientes
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className="p-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1"
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-semibold text-slate-900 flex items-center gap-1">
                              <Icon
                                name="user"
                                size={12}
                                className="text-slate-400"
                              />
                              {notif.employeeName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {notif.timestamp}
                            </span>
                          </div>

                          <p className="text-slate-700 text-[11px] font-medium leading-snug">
                            {notif.taskTitle}
                          </p>

                          <div className="flex items-center justify-between pt-1 flex-wrap gap-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-blue-700 font-medium bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 inline-flex items-center gap-1">
                                <Icon name="folder" size={10} />{" "}
                                {notif.projectName}
                              </span>
                              {notif.taskDueDate && (
                                <span className="text-[10px] text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 inline-flex items-center gap-1">
                                  <Icon name="hourglass" size={10} />{" "}
                                  {formatFechaLimite(notif.taskDueDate)}
                                </span>
                              )}
                              {notif.evidenceUrl && (
                                <a
                                  href={notif.evidenceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={notif.evidenceName || "Ver evidencia"}
                                  className="text-[10px] text-purple-700 font-medium bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 hover:bg-purple-100 inline-flex items-center gap-1"
                                >
                                  <Icon name="paperclip" size={10} /> Evidencia
                                </a>
                              )}
                            </div>

                            <div className="flex gap-1 w-full justify-end mt-1">
                              <button
                                onClick={() =>
                                  handleResolveNotification(notif, "Aprobado")
                                }
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-1 py-1 rounded-md transition-colors cursor-pointer"
                              >
                                Aprobar
                              </button>

                              <button
                                onClick={() =>
                                  handleResolveNotification(notif, "Rechazado")
                                }
                                className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold px-1 py-1 rounded-md transition-colors cursor-pointer"
                              >
                                Rechazar
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* MÉTRICAS INTERACTIVAS */}
        <div className="grid grid-cols-4 gap-2 mb-3 shrink-0">
          {(
            [
              {
                key: "totales",
                label: "Total integrantes",
                value: `${totalEmployees}`,
                sub: "miembros",
                icon: "users",
                tint: "text-slate-800",
                bg: "bg-slate-100 text-slate-500",
                hover: "hover:border-slate-300",
              },
              {
                key: "ocupados",
                label: "En actividad",
                value: `${activeNow}`,
                sub: "ocupados",
                icon: "zap",
                tint: "text-amber-600",
                bg: "bg-amber-50 text-amber-600",
                hover: "hover:border-amber-300",
              },
              {
                key: "disponibles",
                label: "Disponibles",
                value: `${available}`,
                sub: "libres",
                icon: "hourglass",
                tint: "text-emerald-600",
                bg: "bg-emerald-50 text-emerald-600",
                hover: "hover:border-emerald-300",
              },
              {
                key: "completadas",
                label: "Tareas completadas",
                value: `${completedTasksCount}`,
                sub: `/ ${totalTasksCount} totales`,
                icon: "check-circle",
                tint: "text-emerald-600",
                bg: "bg-emerald-50 text-emerald-600",
                hover: "hover:border-emerald-300",
              },
            ] as const
          ).map((m) => (
            <div
              key={m.key}
              onClick={() => setActiveMetricModal(m.key as any)}
              className={`bg-white p-2.5 rounded-lg border border-slate-200 flex justify-between items-center cursor-pointer transition-colors ${m.hover}`}
            >
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                  {m.label}
                </p>
                <h3
                  className={`text-lg font-semibold mt-0.5 tabular-nums ${m.tint}`}
                >
                  {m.value}{" "}
                  <span className="text-[11px] text-slate-400 font-normal">
                    {m.sub}
                  </span>
                </h3>
              </div>
              <span
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.bg}`}
              >
                <Icon name={m.icon} size={16} />
              </span>
            </div>
          ))}
        </div>

        {/* VISTA MAESTRO-DETALLE */}
        <div className="flex-1 grid grid-cols-12 gap-3 min-h-0 overflow-hidden">
          {/* PANEL IZQUIERDO: LISTA DE INTEGRANTES */}
          <div className="col-span-4 flex flex-col min-h-0">
            <div className="mb-1.5 space-y-1.5 shrink-0">
              <div className="flex justify-between items-center">
                <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Equipo ({filteredEmployees.length})
                </h3>
                <button
                  onClick={() => {
                    // Pre-asigna un color de la paleta que ningún otro trabajador
                    // use, para que no colisione en el Calendario de Revisiones.
                    setNewEmployeeData((prev) => ({
                      ...prev,
                      color: colorLibreEmpleado(
                        employees.map((e) => e.color),
                        employees.length,
                      ),
                    }));
                    setIsNewEmployeeModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-medium px-2 py-1 rounded-lg text-[11px] transition-colors cursor-pointer"
                >
                  <Icon name="user-plus" size={13} /> Registrar
                </button>
              </div>

              {/* FILTROS DE EQUIPO */}
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-medium text-slate-500">
                {(
                  [
                    { k: "todos", label: `Todos (${employees.length})` },
                    { k: "trabajadores", label: "Trabajadores" },
                    { k: "estudiantes", label: "Convenios" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setTeamFilter(t.k)}
                    className={`flex-1 py-1 text-center rounded-md transition-colors cursor-pointer ${
                      teamFilter === t.k
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "hover:text-slate-800"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Icon
                  name="folder"
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <select
                  value={teamProjectFilter}
                  onChange={(e) => setTeamProjectFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-slate-700 text-[11px] font-medium py-1.5 pl-6 pr-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">Todos los proyectos</option>
                  {dbProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* TARJETAS DE INTEGRANTES */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-1 min-h-0">
              {filteredEmployees.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  No hay integrantes en esta categoría.
                </p>
              ) : (
                filteredEmployees.map((emp) => {
                  const isSelected =
                    selectedEmployee && emp.id === selectedEmployee.id;
                  const esEstudiante =
                    emp.role === "Practicante" ||
                    emp.role === "Servicio Social";
                  const hasPendingDocs = emp.documents?.some(
                    (d) =>
                      d.status === "Pendiente" || d.status === "Por Vencer",
                  );

                  return (
                    <div
                      key={emp.id}
                      onClick={() => setSelectedEmployee(emp)}
                      className={`p-2 rounded-lg border transition-colors cursor-pointer relative ${
                        isSelected
                          ? "bg-blue-50/50 border-blue-500 shadow-sm ring-1 ring-blue-500/20"
                          : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-base shrink-0 shadow-inner overflow-hidden border border-slate-200 relative">
                            {renderAvatar(emp.avatar, emp.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <h4 className="font-bold text-slate-900 text-sm leading-tight">
                                {emp.name}
                              </h4>

                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-2xs"
                                style={{
                                  backgroundColor: emp.color || "#2563eb",
                                }}
                                title={`Color asignado: ${emp.color || "#2563eb"}`}
                              />

                              {hasPendingDocs && (
                                <span
                                  className="inline-flex items-center text-amber-600"
                                  title="Expediente incompleto"
                                >
                                  <Icon name="alert-triangle" size={12} />
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {emp.role}{" "}
                              {emp.especialidad ? `• ${emp.especialidad}` : ""}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 px-1 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            emp.status === "Disponible"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${emp.status === "Disponible" ? "bg-emerald-500" : "bg-amber-500"}`}
                          ></span>
                          {emp.status}
                        </span>
                      </div>

                      <div className="mt-1 pt-1 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-500">
                        {esEstudiante ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 font-medium bg-blue-50 px-1.5 py-0.5 rounded-md">
                            <Icon name="clock" size={11} />{" "}
                            {emp.horasAcumuladas || 0} /{" "}
                            {emp.horasTotalesObjetivo || 480} hrs
                          </span>
                        ) : (
                          <span>
                            Historial:{" "}
                            <strong className="text-slate-800">
                              {emp.taskHistory.length} tareas
                            </strong>
                          </span>
                        )}
                        <span className="truncate max-w-[150px] inline-flex items-center gap-1">
                          <Icon name="folder" size={11} className="shrink-0" />
                          <strong className="text-slate-700 font-medium truncate">
                            {emp.currentProject}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* PANEL DERECHO: DETALLE DEL EMPLEADO SELECCIONADO */}
          {selectedEmployee && (
            <div className="col-span-8 bg-white border border-slate-200 rounded-xl p-3 flex flex-col min-h-0 overflow-hidden">
              <div className="flex justify-between items-start pb-2 border-b border-slate-100 shrink-0 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl shadow-inner overflow-hidden border border-slate-200 shrink-0">
                    {renderAvatar(
                      selectedEmployee.avatar,
                      selectedEmployee.name,
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <h3 className="text-base font-bold text-slate-900 truncate leading-tight">
                        {selectedEmployee.name}
                      </h3>
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow-2xs border border-white"
                        style={{
                          backgroundColor: selectedEmployee.color || "#2563eb",
                        }}
                        title={`Color de perfil: ${selectedEmployee.color || "#2563eb"}`}
                      />
                    </div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <p className="text-xs text-slate-500 font-medium">
                        {selectedEmployee.role} • {selectedEmployee.email}
                      </p>
                      {selectedEmployee.especialidad && (
                        <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-1 py-0.5 rounded-md border border-slate-200 shrink-0">
                          <Icon
                            name="zap"
                            size={12}
                            className="inline -mt-0.5 mr-0.5"
                          />
                          {selectedEmployee.especialidad}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={handleEditClick}
                    title="Editar datos del empleado"
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Icon name="pencil" size={13} />
                    <span className="hidden sm:inline">Editar</span>
                  </button>

                  <button
                    onClick={handleDeleteClick}
                    title="Eliminar empleado"
                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Icon name="trash" size={13} />
                    <span className="hidden sm:inline">Eliminar</span>
                  </button>

                  <button
                    onClick={handleOpenTransformModal}
                    className={`font-medium px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                      isEstudianteSelected
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    <Icon name="refresh" size={13} />
                    <span>
                      {isEstudianteSelected ? "Transformar" : "Contrato"}
                    </span>
                  </button>

                  <button
                    onClick={() => setIsAssignModalOpen(true)}
                    className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-medium px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Icon name="plus" size={13} /> Asignar tarea
                  </button>
                </div>
              </div>

              {/* PESTAÑAS */}
              <div className="flex border-b border-slate-100 my-1.5 text-xs font-medium text-slate-500 shrink-0">
                {(
                  [
                    {
                      k: "actividad",
                      label: "Actividad y horas",
                      icon: "activity",
                    },
                    {
                      k: "documentos",
                      label: "Expediente legal",
                      icon: "folder",
                      flag: hasPendingDocsSelected,
                    },
                    {
                      k: "contrato",
                      label: "Detalle de contrato",
                      icon: "file-text",
                    },
                    { k: "recompensas", label: "Recompensas", icon: "award" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.k}
                    onClick={() => setActiveTab(tab.k)}
                    className={`pb-1.5 px-2 border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                      activeTab === tab.k
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent hover:text-slate-800"
                    }`}
                  >
                    <Icon name={tab.icon} size={13} />
                    {tab.label}
                    {"flag" in tab && tab.flag && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    )}
                  </button>
                ))}
              </div>

              {/* CONTENIDO ACTIVIDAD */}
              {activeTab === "actividad" && (
                <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                  {isEstudianteSelected && (
                    <div className="p-2 bg-blue-50/50 border border-blue-100 rounded-2xl shrink-0 space-y-1 mb-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-blue-900 flex items-center gap-1">
                          <Icon name="clock" size={13} />
                          Conteo de horas ({selectedEmployee.role})
                        </span>
                        <span className="font-mono font-bold text-blue-700">
                          {selectedEmployee.horasAcumuladas || 0} de{" "}
                          {selectedEmployee.horasTotalesObjetivo || 480} hrs (
                          {porcentajeHoras}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-300"
                          style={{ width: `${porcentajeHoras}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* HISTORIAL DE ACTIVIDADES RENDERIZADO CON TARJETAS DETALLADAS */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-1.5 shrink-0">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Historial de Actividades
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        {selectedEmployee.taskHistory.length} Registradas
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-0">
                      {selectedEmployee.taskHistory.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">
                          Sin actividades en el historial.
                        </p>
                      ) : (
                        selectedEmployee.taskHistory.map((task) => (
                          <TaskCard
                            key={task.id}
                            id={task.id}
                            title={task.title}
                            projectName={task.project}
                            description={task.description}
                            assignedByName={
                              task.assignedByName || "Administrador"
                            }
                            assignedToName={selectedEmployee.name}
                            dueDate={task.dueDate}
                            priority={task.priority || "Media"}
                            status={task.status}
                            progressPercent={task.progressPercent ?? 0}
                            collaborators={task.collaborators || []}
                            isCritical={task.isCritical}
                            slackDays={task.slackDays}
                            onRequestExtension={() =>
                              handleExtendDeadline(
                                task.id,
                                task.title,
                                task.dueDate,
                              )
                            }
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* DOCUMENTOS */}
              {activeTab === "documentos" && (
                <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-1.5">
                  <div className="space-y-1.5">
                    {(!selectedEmployee.documents ||
                      selectedEmployee.documents.length === 0) && (
                      <p className="text-xs text-slate-400 text-center py-4">
                        Sin documentos requeridos registrados para este
                        integrante.
                      </p>
                    )}
                    {selectedEmployee.documents?.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-2 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon
                            name={
                              doc.fileUrl || doc.status === "Verificado"
                                ? "file-text"
                                : "alert-triangle"
                            }
                            size={16}
                            className={
                              doc.fileUrl || doc.status === "Verificado"
                                ? "text-slate-400"
                                : "text-amber-500"
                            }
                          />
                          <div>
                            <p className="font-bold text-slate-800 text-xs">
                              {doc.name}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {doc.required ? "Obligatorio" : "Opcional"}{" "}
                              {doc.expirationDate
                                ? `• Vence: ${doc.expirationDate}`
                                : ""}
                            </p>
                          </div>
                        </div>

                        {doc.fileUrl ? (
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-bold px-1.5 py-1 rounded-lg text-[11px] transition-colors"
                          >
                            Ver PDF
                          </a>
                        ) : (
                          <div>
                            <input
                              type="file"
                              accept=".pdf,image/*"
                              id={`upload-doc-tab-${doc.id}`}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file)
                                  handleUploadSingleDoc(doc.id, file, doc.name);
                              }}
                              className="hidden"
                            />
                            <label
                              htmlFor={`upload-doc-tab-${doc.id}`}
                              className={`bg-blue-600 hover:bg-blue-700 text-white font-bold px-1.5 py-1 rounded-lg text-[11px] cursor-pointer inline-block transition-colors ${
                                uploadingDocId === doc.id
                                  ? "opacity-50 pointer-events-none"
                                  : ""
                              }`}
                            >
                              {uploadingDocId === doc.id
                                ? "Subiendo..."
                                : "Subir PDF"}
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CONTRATO */}
              {activeTab === "contrato" && (
                <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-2">
                  <div className="bg-slate-50/80 p-2 rounded-2xl border border-slate-200/80 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          Modalidad de Contrato
                        </p>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {selectedEmployee.contract?.contractType ||
                            selectedEmployee.role}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          Sueldo / Beca Mensual
                        </p>
                        <p className="font-bold text-blue-700 mt-0.5 text-sm">
                          <Icon
                            name="banknote"
                            size={13}
                            className="inline -mt-0.5 mr-1 text-slate-400"
                          />
                          {selectedEmployee.contract?.stipendOrSalary ||
                            "No asignado"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          Fecha de Inicio
                        </p>
                        <p className="font-medium text-slate-700 mt-0.5">
                          {selectedEmployee.contract?.startDate || "Reciente"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          Supervisor Asignado
                        </p>
                        <p className="font-medium text-slate-700 mt-0.5">
                          {selectedEmployee.contract?.supervisor ||
                            "Coordinación"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CONTENIDO RECOMPENSAS — puntos y nivel reales (empleados.puntos_recompensa,
                  otorgados por trigger al completar tareas); el catálogo de canje sigue
                  pendiente, marcado explícitamente para el final del proyecto. */}
              {activeTab === "recompensas" &&
                (() => {
                  const puntos = selectedEmployee.puntosRecompensa;
                  const { actual, siguiente, progresoPct } =
                    getNivelRecompensa(puntos);
                  const historialEmpleado = recompensaHistorial.filter(
                    (h) => h.empleado_id === selectedEmployee.id,
                  );

                  return (
                    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-2">
                      {/* Balance de puntos y nivel */}
                      <div className="bg-gradient-to-br from-indigo-600 to-blue-600 text-white p-2 rounded-2xl shadow-sm space-y-1.5 shrink-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-semibold text-indigo-100 uppercase tracking-wide">
                              Puntos de {selectedEmployee.name.split(" ")[0]}
                            </p>
                            <p className="text-2xl font-semibold mt-0.5 inline-flex items-center gap-1.5">
                              <Icon name="award" size={20} />
                              {puntos} pts
                            </p>
                          </div>
                          <span className="text-[10px] font-semibold bg-white/15 border border-white/25 px-1.5 py-1 rounded-full">
                            Nivel {actual.label}
                          </span>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-indigo-100 font-semibold mb-1">
                            <span>
                              {siguiente
                                ? `Progreso a Nivel ${siguiente.label}`
                                : "Nivel máximo alcanzado"}
                            </span>
                            <span>
                              {siguiente
                                ? `${puntos} / ${siguiente.min} pts`
                                : `${puntos} pts`}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-white rounded-full"
                              style={{ width: `${progresoPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Historial de puntos ganados */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Historial de puntos
                        </p>
                        {historialEmpleado.length === 0 ? (
                          <p className="text-xs text-slate-400 italic px-1">
                            Todavía no ha ganado puntos — se otorgan al
                            completar tareas.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {historialEmpleado.map((h) => (
                              <div
                                key={h.id}
                                className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-1.5 py-1.5"
                              >
                                <span className="text-xs font-medium text-slate-700">
                                  {h.motivo}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[10px] font-bold text-emerald-600">
                                    +{h.puntos} pts
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-mono">
                                    {formatDate(h.created_at)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Catálogo de recompensas — pendiente para el final del proyecto */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                          Catálogo de Recompensas
                          <span className="text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.5 rounded-full normal-case">
                            Pendiente
                          </span>
                        </p>
                        <div className="space-y-1">
                          {[
                            {
                              icon: "gift",
                              label: "Vale de Despensa",
                              desc: "Apoyo para compras de despensa en supermercados.",
                              cost: 400,
                            },
                            {
                              icon: "banknote",
                              label: "Tarjeta / Vale de Gasolina",
                              desc: "Apoyo para transporte y movilidad diaria.",
                              cost: 400,
                            },
                            {
                              icon: "graduation-cap",
                              label: "Curso o Certificación Profesional",
                              desc: "Pago de capacitación técnica o profesional.",
                              cost: 900,
                            },
                            {
                              icon: "calendar",
                              label: "Día Libre",
                              desc: "Un día de descanso adicional pagado.",
                              cost: 2500,
                            },
                            {
                              icon: "award",
                              label: "Bono Colectivo de Equipo",
                              desc: "Premio acumulativo por cumplimiento de hitos del área o proyecto.",
                              cost: null,
                            },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-1.5 py-1.5 gap-1.5"
                            >
                              <span className="flex items-start gap-1 text-xs font-semibold text-slate-700 min-w-0">
                                <span className="shrink-0 text-slate-400">
                                  <Icon name={item.icon as any} size={16} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block">{item.label}</span>
                                  <span className="block text-[10px] font-normal text-slate-400 leading-snug mt-0.5">
                                    {item.desc}
                                  </span>
                                </span>
                              </span>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="text-[10px] font-bold text-amber-600 whitespace-nowrap">
                                  {item.cost !== null
                                    ? `${item.cost} pts`
                                    : "Según equipo"}
                                </span>
                                <button
                                  type="button"
                                  disabled
                                  title="Próximamente"
                                  className="text-[10px] font-bold bg-slate-200 text-slate-400 px-1.5 py-1 rounded-lg cursor-not-allowed"
                                >
                                  Canjear
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
            </div>
          )}
        </div>
      </main>

      {/* 📝 MODAL REGISTRO DE INTEGRANTE */}
      {isNewEmployeeModalOpen && (
        <ModalOverlay onClose={() => setIsNewEmployeeModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                Registrar Nuevo Integrante
              </h3>
              <button
                onClick={() => setIsNewEmployeeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-2 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Roberto Gómez"
                  value={newEmployeeData.nombre}
                  onChange={(e) =>
                    setNewEmployeeData({
                      ...newEmployeeData,
                      nombre: e.target.value,
                    })
                  }
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  placeholder="roberto@empresa.com"
                  value={newEmployeeData.correo}
                  onChange={(e) =>
                    setNewEmployeeData({
                      ...newEmployeeData,
                      correo: e.target.value,
                    })
                  }
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newEmployeeData.password}
                  onChange={(e) =>
                    setNewEmployeeData({
                      ...newEmployeeData,
                      password: e.target.value,
                    })
                  }
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Área / Rol
                  </label>
                  <select
                    value={newEmployeeData.rol}
                    onChange={(e) =>
                      setNewEmployeeData({
                        ...newEmployeeData,
                        rol: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  >
                    <option value="Administrador">Administrador</option>
                    <option value="Desarrollador Web">Desarrollador Web</option>
                    <option value="Practicante">Practicante</option>
                    <option value="Servicio Social">Servicio Social</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Arquitectura">Arquitectura</option>
                    <option value="Otro">Otro...</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Especialidad
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. React / Backend"
                    value={newEmployeeData.especialidad}
                    onChange={(e) =>
                      setNewEmployeeData({
                        ...newEmployeeData,
                        especialidad: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Nivel Jerárquico
                  </label>
                  <select
                    value={newEmployeeData.nivel}
                    onChange={(e) =>
                      setNewEmployeeData({
                        ...newEmployeeData,
                        nivel: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  >
                    <option value="Gerencia">Gerencia</option>
                    <option value="Coordinador">Coordinador</option>
                    <option value="Trabajador">Trabajador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Área
                  </label>
                  <select
                    value={newEmployeeData.area}
                    onChange={(e) =>
                      setNewEmployeeData({
                        ...newEmployeeData,
                        area: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  >
                    <option value="">— Sin área (Dirección) —</option>
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 -mt-1">
                Nivel agrupa al integrante en el panel "Equipo" del calendario
                de revisiones; Área aplica a Coordinadores/Trabajadores.
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Color Identificador de Perfil
                </label>
                <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 border border-slate-200 rounded-xl">
                  <div className="relative shrink-0">
                    <input
                      type="color"
                      id="newColorPicker"
                      value={newEmployeeData.color || "#2563eb"}
                      onChange={(e) =>
                        setNewEmployeeData({
                          ...newEmployeeData,
                          color: e.target.value,
                        })
                      }
                      className="w-9 h-9 rounded-xl border-0 p-0 cursor-pointer opacity-0 absolute inset-0 z-10"
                    />
                    <div
                      className="w-9 h-9 rounded-xl border-2 border-slate-300 shadow-2xs flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                      style={{
                        backgroundColor: newEmployeeData.color || "#2563eb",
                      }}
                      title="Abrir mapa de color personalizado"
                    />
                  </div>

                  <span className="text-xs font-mono font-bold text-slate-700 uppercase w-16">
                    {newEmployeeData.color || "#2563eb"}
                  </span>

                  <div className="flex items-center gap-1 flex-1 justify-end flex-wrap">
                    {PALETA_EMPLEADOS.map((c) => {
                      const enUso = employees.some(
                        (e) =>
                          (e.color || "").trim().toLowerCase() ===
                          c.toLowerCase(),
                      );
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setNewEmployeeData({ ...newEmployeeData, color: c })
                          }
                          title={enUso ? "Ya asignado a otro integrante" : c}
                          className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                            newEmployeeData.color === c
                              ? "scale-125 ring-2 ring-slate-900"
                              : "hover:scale-110"
                          } ${enUso ? "opacity-30" : ""}`}
                          style={{ backgroundColor: c }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Sueldo o Beca
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="3000"
                    value={newEmployeeData.remuneracion}
                    onChange={(e) =>
                      setNewEmployeeData({
                        ...newEmployeeData,
                        remuneracion: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 pl-4 text-slate-900 font-medium bg-white outline-none"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-1.5 space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase">
                    Requisitos Documentales ({newEmployeeData.documentos.length}
                    )
                  </label>
                </div>

                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {newEmployeeData.documentos.map((doc) => (
                    <div
                      key={doc.idTemp}
                      className="p-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                          {doc.nombre}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveDocumentRequirement(doc.idTemp)
                          }
                          className="text-slate-400 hover:text-red-600 px-1 cursor-pointer"
                        >
                          <Icon name="x" size={13} />
                        </button>
                      </div>

                      <div className="flex items-center gap-1 pt-0.5">
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          id={`file-doc-${doc.idTemp}`}
                          onChange={(e) =>
                            handleDocFileSelect(
                              doc.idTemp,
                              e.target.files?.[0] || null,
                            )
                          }
                          className="hidden"
                        />
                        <label
                          htmlFor={`file-doc-${doc.idTemp}`}
                          className="bg-white hover:bg-slate-100 text-slate-700 font-semibold px-1.5 py-1 rounded-lg border border-slate-300 text-[10px] cursor-pointer shrink-0"
                        >
                          <Icon
                            name="paperclip"
                            size={12}
                            className="inline -mt-0.5 mr-1"
                          />
                          {doc.archivo ? "Cambiar archivo" : "Adjuntar PDF"}
                        </label>
                        <span className="text-[10px] text-slate-500 truncate italic">
                          {doc.archivo
                            ? doc.archivo.name
                            : "Sin archivo seleccionado"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-1 pt-1">
                  <input
                    type="text"
                    placeholder="Ej. Contrato de Tiempo Definido"
                    value={nuevoDocNombre}
                    onChange={(e) => setNuevoDocNombre(e.target.value)}
                    className="flex-1 border border-slate-300 rounded-xl p-1 text-slate-900 font-medium bg-white outline-none text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddDocumentRequirement}
                    className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-1.5 py-1 rounded-xl text-[11px]"
                  >
                    + Añadir
                  </button>
                </div>
              </div>

              <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewEmployeeModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingUpload}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-xl font-bold"
                >
                  {loadingUpload ? "Subiendo datos..." : "Registrar Integrante"}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* ✏️ MODAL DE EDICIÓN */}
      {isEditModalOpen && selectedEmployee && (
        <ModalOverlay onClose={() => setIsEditModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                Editar Integrante
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee} className="space-y-2 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.nombre}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, nombre: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  value={editFormData.correo}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, correo: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Rol / Puesto
                  </label>
                  <select
                    value={editFormData.rol}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, rol: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  >
                    <option value="Administrador">Administrador</option>
                    <option value="Desarrollador Web">Desarrollador Web</option>
                    <option value="Practicante">Practicante</option>
                    <option value="Servicio Social">Servicio Social</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Arquitectura">Arquitectura</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Especialidad
                  </label>
                  <input
                    type="text"
                    value={editFormData.especialidad}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        especialidad: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Nivel Jerárquico
                  </label>
                  <select
                    value={editFormData.nivel}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        nivel: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  >
                    <option value="Gerencia">Gerencia</option>
                    <option value="Coordinador">Coordinador</option>
                    <option value="Trabajador">Trabajador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Área
                  </label>
                  <select
                    value={editFormData.area}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, area: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  >
                    <option value="">— Sin área (Dirección) —</option>
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Color Asignado
                </label>
                <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 border border-slate-200 rounded-xl">
                  <div className="relative shrink-0">
                    <input
                      type="color"
                      id="editColorPicker"
                      value={editFormData.color || "#2563eb"}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          color: e.target.value,
                        })
                      }
                      className="w-9 h-9 rounded-xl border-0 p-0 cursor-pointer opacity-0 absolute inset-0 z-10"
                    />
                    <div
                      className="w-9 h-9 rounded-xl border-2 border-slate-300 shadow-2xs flex items-center justify-center cursor-pointer"
                      style={{
                        backgroundColor: editFormData.color || "#2563eb",
                      }}
                    />
                  </div>

                  <span className="text-xs font-mono font-bold text-slate-700 uppercase w-16">
                    {editFormData.color || "#2563eb"}
                  </span>

                  <div className="flex items-center gap-1 flex-1 justify-end flex-wrap">
                    {PALETA_EMPLEADOS.map((c) => {
                      const enUso = employees.some(
                        (e) =>
                          e.id !== selectedEmployee?.id &&
                          (e.color || "").trim().toLowerCase() ===
                            c.toLowerCase(),
                      );
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setEditFormData({ ...editFormData, color: c })
                          }
                          title={enUso ? "Ya asignado a otro integrante" : c}
                          className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${
                            editFormData.color === c
                              ? "scale-125 ring-2 ring-slate-900"
                              : "hover:scale-110"
                          } ${enUso ? "opacity-30" : ""}`}
                          style={{ backgroundColor: c }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Estatus de Disponibilidad
                </label>
                <select
                  value={editFormData.disponibilidad}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      disponibilidad: e.target.value as any,
                    })
                  }
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                >
                  <option value="Disponible">Disponible</option>
                  <option value="Ocupado">Ocupado</option>
                </select>
              </div>

              <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-700 py-1.5 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-xl font-bold"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* 🗑️ MODAL DE ELIMINACIÓN DE EMPLEADO */}
      {isDeleteModalOpen && selectedEmployee && (
        <ModalOverlay onClose={() => setIsDeleteModalOpen(false)}>
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-red-100 p-3 space-y-2 text-center">
            <div className="w-11 h-11 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <Icon name="trash" size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-[14px] font-semibold text-slate-900">
                ¿Eliminar integrante?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                ¿Estás seguro de que deseas eliminar a{" "}
                <strong className="text-slate-900">
                  {selectedEmployee.name}
                </strong>
                ?
              </p>
              <p className="text-[11px] text-red-600 bg-red-50 p-1.5 rounded-lg border border-red-100 inline-flex items-center gap-1">
                <Icon name="alert-triangle" size={12} className="shrink-0" />{" "}
                Removerá su historial de tareas, expedientes y accesos.
              </p>
            </div>

            <div className="flex gap-1 pt-1">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-colors shadow-xs"
              >
                {isDeleting ? "Eliminando..." : "Sí, Eliminar"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ⏱️ MODAL DE TIEMPO EXTRA / NUEVA FECHA LÍMITE */}
      {extendDeadlineTarget && (
        <ModalOverlay onClose={() => setExtendDeadlineTarget(null)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                {extendDeadlineTarget.rejectNotif
                  ? "Rechazar y dar más tiempo"
                  : "Tiempo extra"}
              </h3>
              <button
                onClick={() => setExtendDeadlineTarget(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form
              onSubmit={handleConfirmExtendDeadline}
              className="space-y-2 text-xs"
            >
              {extendDeadlineTarget.rejectNotif && (
                <p className="text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-1.5 py-1">
                  La tarea regresará a "En Proceso" con esta nueva fecha límite.
                  Si cierras sin guardar, se cancela el rechazo y la
                  notificación sigue pendiente.
                </p>
              )}
              <p className="text-slate-600">
                Nueva fecha límite para{" "}
                <strong className="text-slate-900">
                  "{extendDeadlineTarget.title}"
                </strong>
                {extendDeadlineTarget.currentDueDate && (
                  <>
                    {" "}
                    (actual:{" "}
                    {formatFechaLimite(extendDeadlineTarget.currentDueDate)})
                  </>
                )}
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Fecha Límite
                </label>
                <input
                  type="date"
                  required
                  value={extendDeadlineValue}
                  onChange={(e) => setExtendDeadlineValue(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                />
              </div>

              <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setExtendDeadlineTarget(null)}
                  className="flex-1 bg-slate-100 text-slate-700 py-1.5 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-1.5 rounded-xl font-bold"
                >
                  {extendDeadlineTarget.rejectNotif
                    ? "Rechazar tarea"
                    : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* 🔄 MODAL DE TRANSFORMACIÓN */}
      {isTransformModalOpen && selectedEmployee && (
        <ModalOverlay onClose={() => setIsTransformModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                {isEstudianteSelected
                  ? "Transformar Modalidad Contractual"
                  : "Actualizar Contrato"}
              </h3>
              <button
                onClick={() => setIsTransformModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form
              onSubmit={handleTransformEmployee}
              className="space-y-2 text-xs"
            >
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Nuevo Rol / Puesto
                  </label>
                  <input
                    type="text"
                    required
                    value={transformFormData.nuevoRol}
                    onChange={(e) =>
                      setTransformFormData({
                        ...transformFormData,
                        nuevoRol: e.target.value,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Tipo de Contrato
                  </label>
                  <select
                    value={transformFormData.tipoContrato}
                    onChange={(e) =>
                      setTransformFormData({
                        ...transformFormData,
                        tipoContrato: e.target.value as any,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  >
                    <option value="Tiempo Completo">Tiempo Completo</option>
                    <option value="Medio Tiempo">Medio Tiempo</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTransformModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-700 py-1.5 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white py-1.5 rounded-xl font-bold"
                >
                  {isEstudianteSelected
                    ? "Confirmar Transición"
                    : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* 📌 MODAL DE ASIGNACIÓN DE TAREA */}
      {isAssignModalOpen && selectedEmployee && (
        <ModalOverlay onClose={() => setIsAssignModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Asignar Tarea a {selectedEmployee.name}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Detalles de la actividad, colaboradores, prioridad y entrega
                </p>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleAssignTask} className="space-y-2 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Proyecto Destino
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  required
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                >
                  {dbProjects.length === 0 ? (
                    <option value="" disabled>
                      No hay proyectos registrados en Supabase
                    </option>
                  ) : (
                    dbProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))
                  )}
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
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Integrantes Colaboradores ({selectedCollaboratorIds.length}{" "}
                  seleccionados)
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-300 rounded-xl p-1 bg-white space-y-1">
                  {employees.filter((emp) => emp.id !== selectedEmployee.id)
                    .length === 0 ? (
                    <p className="text-[11px] text-slate-400 p-1 text-center">
                      No hay otros integrantes disponibles.
                    </p>
                  ) : (
                    employees
                      .filter((emp) => emp.id !== selectedEmployee.id)
                      .map((emp) => {
                        const isChecked = selectedCollaboratorIds.includes(
                          emp.id,
                        );
                        return (
                          <label
                            key={emp.id}
                            className={`flex items-center justify-between p-1 rounded-lg cursor-pointer text-xs transition-colors ${
                              isChecked
                                ? "bg-blue-50 border border-blue-200 text-blue-900 font-semibold"
                                : "hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() =>
                                  handleToggleCollaborator(emp.id)
                                }
                                className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className="inline-flex items-center gap-1">
                                <Icon name="users" size={11} />
                                {emp.name}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {emp.role}
                            </span>
                          </label>
                        );
                      })
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Descripción / Indicaciones
                </label>
                <textarea
                  rows={3}
                  placeholder="Instrucciones específicas de la tarea..."
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Prioridad
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
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
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-xl font-bold cursor-pointer transition-colors shadow-xs"
                >
                  Asignar Tarea
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* 📊 MODAL DE DETALLES DE MÉTRICAS */}
      {activeMetricModal && (
        <ModalOverlay onClose={() => setActiveMetricModal(null)}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                  <Icon
                    name={
                      activeMetricModal === "ocupados"
                        ? "zap"
                        : activeMetricModal === "disponibles"
                          ? "hourglass"
                          : activeMetricModal === "completadas"
                            ? "check-circle"
                            : "users"
                    }
                    size={16}
                  />
                </span>
                <div>
                  <h3 className="text-[13px] font-semibold text-slate-900">
                    {activeMetricModal === "totales" &&
                      "Detalle: Total de Integrantes"}
                    {activeMetricModal === "ocupados" &&
                      "Detalle: Integrantes en Actividad"}
                    {activeMetricModal === "disponibles" &&
                      "Detalle: Integrantes Disponibles"}
                    {activeMetricModal === "completadas" &&
                      "Detalle: Historial de Tareas Completadas"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {activeMetricModal === "totales" &&
                      `Mostrando los ${totalEmployees} miembros registrados`}
                    {activeMetricModal === "ocupados" &&
                      `Mostrando los ${activeNow} miembros con tareas activas`}
                    {activeMetricModal === "disponibles" &&
                      `Mostrando los ${available} miembros listos para recibir tareas`}
                    {activeMetricModal === "completadas" &&
                      `Mostrando las ${completedTasksCount} tareas finalizadas`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveMetricModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0 text-xs">
              {activeMetricModal === "totales" &&
                employees.map((emp) => (
                  <div
                    key={emp.id}
                    className="p-1.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                        {renderAvatar(emp.avatar, emp.name)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <h4 className="font-bold text-slate-900">
                            {emp.name}
                          </h4>
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{ backgroundColor: emp.color || "#2563eb" }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {emp.role} • {emp.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] bg-slate-200/70 text-slate-700 font-bold px-1 py-0.5 rounded-md">
                        <Icon
                          name="folder"
                          size={11}
                          className="inline mr-1 -mt-0.5"
                        />
                        {emp.currentProject}
                      </span>
                      <span
                        className={`px-1 py-0.5 rounded-full text-[10px] font-bold ${
                          emp.status === "Disponible"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {emp.status}
                      </span>
                    </div>
                  </div>
                ))}

              {activeMetricModal === "ocupados" &&
                (employees.filter((e) => e.status === "Ocupado").length ===
                0 ? (
                  <p className="text-center text-slate-400 py-3">
                    No hay integrantes en actividad actualmente.
                  </p>
                ) : (
                  employees
                    .filter((e) => e.status === "Ocupado")
                    .map((emp) => (
                      <div
                        key={emp.id}
                        className="p-1.5 bg-amber-50/50 border border-amber-200/80 rounded-xl space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                              {renderAvatar(emp.avatar, emp.name)}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900">
                                {emp.name}
                              </h4>
                              <p className="text-[10px] text-slate-500">
                                {emp.role}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1 py-0.5 rounded-md border border-blue-200">
                            <Icon
                              name="folder"
                              size={11}
                              className="inline mr-1 -mt-0.5"
                            />
                            {emp.currentProject}
                          </span>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg border border-amber-200/60 text-slate-800">
                          <span className="text-[10px] font-semibold text-amber-700 uppercase block mb-0.5">
                            Actividad en curso
                          </span>
                          <p className="font-medium text-xs leading-snug">
                            {emp.currentTask}
                          </p>
                        </div>
                      </div>
                    ))
                ))}

              {activeMetricModal === "disponibles" &&
                (employees.filter((e) => e.status === "Disponible").length ===
                0 ? (
                  <p className="text-center text-slate-400 py-3">
                    No hay integrantes libres en este momento.
                  </p>
                ) : (
                  employees
                    .filter((e) => e.status === "Disponible")
                    .map((emp) => (
                      <div
                        key={emp.id}
                        className="p-1.5 bg-emerald-50/40 border border-emerald-200/80 rounded-xl flex items-center justify-between"
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                            {renderAvatar(emp.avatar, emp.name)}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900">
                              {emp.name}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {emp.role}{" "}
                              {emp.especialidad ? `• ${emp.especialidad}` : ""}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedEmployee(emp);
                            setActiveMetricModal(null);
                            setIsAssignModalOpen(true);
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-1.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
                        >
                          + Asignar Tarea
                        </button>
                      </div>
                    ))
                ))}

              {activeMetricModal === "completadas" &&
                (() => {
                  const allCompletedTasks = employees.flatMap((emp) =>
                    emp.taskHistory
                      .filter((t) => t.status === "Completada")
                      .map((t) => ({
                        ...t,
                        employeeId: emp.id,
                        employeeName: emp.name,
                      })),
                  );

                  if (allCompletedTasks.length === 0) {
                    return (
                      <p className="text-center text-slate-400 py-3">
                        No hay tareas completadas en el historial.
                      </p>
                    );
                  }

                  return allCompletedTasks.map((task, idx) => (
                    <div
                      key={`${task.id}-${idx}`}
                      className="p-1.5 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-900">
                          {task.title}
                        </h4>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="user" size={11} />
                            {task.employeeName}
                          </span>
                          <span>•</span>
                          <span className="text-blue-600 font-semibold bg-blue-50 px-1 py-0.5 rounded">
                            <Icon
                              name="folder"
                              size={11}
                              className="inline mr-1 -mt-0.5"
                            />
                            {task.project}
                          </span>
                          {task.collaboratorsNames &&
                            task.collaboratorsNames.length > 0 && (
                              <span className="text-indigo-600 font-semibold bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100">
                                Colaboradores:{" "}
                                {task.collaboratorsNames.join(", ")}
                              </span>
                            )}
                        </div>
                      </div>
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-1 rounded-lg text-[10px] font-bold shrink-0">
                        Completada ({task.date})
                      </span>
                    </div>
                  ));
                })()}
            </div>

            <div className="pt-1 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={() => setActiveMetricModal(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-2 py-1 rounded-xl text-xs cursor-pointer transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
