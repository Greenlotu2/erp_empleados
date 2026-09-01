"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Sidebar from "../../../../components/Sidebar";
import { Icon } from "../../../../components/icons";
import { ModalOverlay } from "../../../../components/ModalOverlay";
import { supabase } from "../../../../lib/supabase";

interface CriticalTask {
  id: string;
  project: string;
  title: string;
  assigneeName: string;
  assigneeAvatar: string;
  durationDays: number;
  startDay: number;
  progressPercent: number;
  dependsOn?: string;
  isCritical: boolean;
  status: "Completada" | "En Proceso" | "Pendiente" | "Postergada";
  slackDays: number;
  isMilestone?: boolean;
}

interface AiRecommendation {
  riskLevel: "ALTO" | "MEDIO" | "BAJO";
  summary: string;
  bottleneckPerson: string;
  suggestion: string;
}

const TIMELINE_DAYS = Array.from({ length: 15 }, (_, i) => i + 1);
const CURRENT_DAY_MARKER = 5;

export default function CriticalPathPage() {
  const [projects, setProjects] = useState<string[]>(["Todos los Proyectos"]);
  const [selectedProject, setSelectedProject] = useState("Todos los Proyectos");
  const [statusFilter, setStatusFilter] = useState<string>("Todos los Estados");
  const [tasks, setTasks] = useState<CriticalTask[]>([]);
  const [reuniones, setReuniones] = useState<any[]>([]);
  const [onlyCritical, setOnlyCritical] = useState(false);

  const [loadingDb, setLoadingDb] = useState(true);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);

  // ✏️ Estado para la Edición de Tareas mediante Modal
  const [editingTask, setEditingTask] = useState<CriticalTask | null>(null);
  const [isSavingTask, setIsSavingTask] = useState(false);

  // Estado del diagnóstico dinámico
  const [aiDiagnostic, setAiDiagnostic] = useState<AiRecommendation>({
    riskLevel: "BAJO",
    summary:
      'Haz clic en "Diagnóstico IA" para analizar las holguras y cuellos de botella reales de tus tareas.',
    bottleneckPerson: "Sin analizar",
    suggestion:
      "Gemini calculará automáticamente los riesgos basados en las actividades de Supabase.",
  });

  // 🔄 1. CARGA DE DATOS DESDE SUPABASE
  const fetchData = async () => {
    try {
      setLoadingDb(true);

      const { data: projData } = await supabase
        .from("proyectos")
        .select("nombre");
      if (projData && projData.length > 0) {
        setProjects([
          "Todos los Proyectos",
          ...projData.map((p: any) => p.nombre),
        ]);
      }

      const { data: reunData } = await supabase
        .from("reuniones")
        .select("titulo, fecha_inicio, estado");
      if (reunData) setReuniones(reunData);

      const { data: tareasData, error: tareasErr } = await supabase.from(
        "tareas",
      ).select(`
          *,
          empleados:empleados!tareas_empleado_id_fkey (nombre),
          proyectos (nombre)
        `);

      if (tareasErr) {
        console.error("Detalle error Supabase Tareas:", tareasErr);
        throw tareasErr;
      }

      if (tareasData) {
        const mappedTasks: CriticalTask[] = tareasData.map((t: any) => {
          const empNombre = t.empleados?.nombre || "Sin asignar";
          const initials = empNombre
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();

          // Normalizar el estado registrado
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
            id: t.id ? String(t.id) : `T-${Math.random()}`,
            project: t.proyectos?.nombre || "General",
            title: t.titulo || "Tarea sin título",
            assigneeName: empNombre,
            assigneeAvatar: t.es_hito ? "H" : initials,
            durationDays: t.duracion_dias || 1,
            startDay: t.dia_inicio || 1,
            progressPercent:
              t.porcentaje_avance ??
              (normalizedStatus === "Completada" ? 100 : 0),
            dependsOn: t.depende_de || undefined,
            isCritical: Boolean(t.es_critica),
            slackDays: t.holgura_dias ?? 0,
            isMilestone: Boolean(t.es_hito),
            status: normalizedStatus,
          };
        });
        setTasks(mappedTasks);
      }
    } catch (err) {
      console.error("Error al sincronizar Supabase en Ruta Crítica:", err);
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ↔️ 2. DESPLAZAMIENTO INTERACTIVO Y RECÁLCULO
  const handleShiftTask = async (
    taskId: string,
    direction: "left" | "right",
  ) => {
    setTasks((prevTasks) =>
      prevTasks.map((t) => {
        if (t.id !== taskId) return t;

        const newStart =
          direction === "left"
            ? Math.max(1, t.startDay - 1)
            : Math.min(14, t.startDay + 1);

        let newSlack = t.slackDays;
        if (direction === "right" && newSlack > 0) {
          newSlack = Math.max(0, newSlack - 1);
        } else if (direction === "left") {
          newSlack += 1;
        }

        const becomesCritical = newSlack === 0;

        const updatedTask = {
          ...t,
          startDay: newStart,
          slackDays: newSlack,
          isCritical: becomesCritical,
        };

        supabase
          .from("tareas")
          .update({
            dia_inicio: newStart,
            holgura_dias: newSlack,
            es_critica: becomesCritical,
          })
          .eq("id", taskId)
          .then(({ error }: { error: any }) => {
            if (error)
              console.error("Error al guardar el desplazamiento:", error);
          });

        return updatedTask;
      }),
    );
  };

  // 💾 3. GUARDAR EDICIÓN COMPLETA EN MODAL
  const handleSaveTaskEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    try {
      setIsSavingTask(true);

      const { error } = await supabase
        .from("tareas")
        .update({
          titulo: editingTask.title,
          dia_inicio: editingTask.startDay,
          duracion_dias: editingTask.durationDays,
          porcentaje_avance: editingTask.progressPercent,
          holgura_dias: editingTask.slackDays,
          es_critica: editingTask.isCritical,
          es_hito: editingTask.isMilestone,
          estado: editingTask.status,
        })
        .eq("id", editingTask.id);

      if (error) throw error;

      setTasks((prev) =>
        prev.map((t) => (t.id === editingTask.id ? editingTask : t)),
      );
      setEditingTask(null);
    } catch (err: any) {
      console.error("Error al actualizar la tarea:", err);
      alert(`Error al guardar cambios: ${err.message}`);
    } finally {
      setIsSavingTask(false);
    }
  };

  // 🤖 4. CONSULTA GEMINI AI
  const runGeminiAnalysis = async (
    proyectoActual: string,
    tareasFiltradas: CriticalTask[],
  ) => {
    try {
      setIsAiAnalyzing(true);

      const response = await fetch("/admin/ruta-critica/analizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyectoNombre: proyectoActual,
          tareas: tareasFiltradas,
          reuniones,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.details || errData.error || `HTTP ${response.status}`,
        );
      }

      const data = await response.json();

      let mappedRisk: "ALTO" | "MEDIO" | "BAJO" = "BAJO";
      if (data.estadoGeneral === "Crítico" || data.estadoGeneral === "ALTO")
        mappedRisk = "ALTO";
      else if (
        data.estadoGeneral === "En riesgo" ||
        data.estadoGeneral === "MEDIO"
      )
        mappedRisk = "MEDIO";

      setAiDiagnostic({
        riskLevel: mappedRisk,
        summary: data.resumenEjecutivo || "Análisis finalizado correctamente.",
        bottleneckPerson: data.puntosCriticos?.[0] || "Por evaluar",
        suggestion:
          data.recomendaciones?.[0]?.descripcion || data.resumenEjecutivo,
      });
    } catch (error) {
      console.error("Error ejecutando IA:", error);
      const msg = error instanceof Error ? error.message : "Error desconocido";
      alert(`Error al generar diagnóstico: ${msg}`);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  // 🔍 FILTRADO DE TAREAS (POR PROYECTO, CRITICIDAD Y ESTADO)
  const filteredTasks = tasks.filter((t) => {
    const matchesProject =
      selectedProject === "Todos los Proyectos" ||
      t.project.trim().toLowerCase() === selectedProject.trim().toLowerCase();
    const matchesCritical = onlyCritical ? t.isCritical : true;

    let matchesStatus = true;
    if (statusFilter === "Completadas")
      matchesStatus = t.status === "Completada";
    if (statusFilter === "En Proceso")
      matchesStatus = t.status === "En Proceso";
    if (statusFilter === "Pendientes") matchesStatus = t.status === "Pendiente";
    if (statusFilter === "Postergadas")
      matchesStatus = t.status === "Postergada";

    return matchesProject && matchesCritical && matchesStatus;
  });

  const totalDays = filteredTasks.reduce(
    (acc, t) => (t.isCritical ? acc + t.durationDays : acc),
    0,
  );
  const criticalCount = filteredTasks.filter((t) => t.isCritical).length;

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      <Sidebar />

      <main className="flex-1 flex flex-col p-3 md:p-3 overflow-hidden h-full min-w-0">
        {/* ENCABEZADO */}
        <header className="flex justify-between items-center mb-2 shrink-0">
          <div>
            <Link
              href="/admin/ruta-critica"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 mb-1"
            >
              ← Volver a la vista simple
            </Link>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-1">
              Diagrama Gantt y Ruta Crítica (vista técnica)
            </h1>
            <p className="text-xs text-slate-500">
              Desplaza actividades con ◄ / ► para simular postergaciones
              autorizadas por el Administrador.
            </p>
          </div>

          <button
            onClick={() => runGeminiAnalysis(selectedProject, filteredTasks)}
            disabled={isAiAnalyzing || loadingDb}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold px-2 py-1 rounded-xl text-xs shadow-xs flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
          >
            {isAiAnalyzing ? (
              "Re-analizando…"
            ) : (
              <>
                <Icon name="sparkles" size={13} /> Diagnóstico IA
              </>
            )}
          </button>
        </header>

        {/* METRICAS SUPERIORES */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-1.5 mb-2 shrink-0">
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Duración Ruta Crítica
              </p>
              <h3 className="text-base font-bold text-slate-900">
                {totalDays} Días Hábiles
              </h3>
            </div>
            <span className="w-7 h-7 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <Icon name="calendar" size={15} />
            </span>
          </div>

          <div className="bg-white p-1.5 rounded-2xl border border-rose-100 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">
                Actividades Críticas
              </p>
              <h3 className="text-base font-bold text-rose-600">
                {criticalCount} Sin Holgura
              </h3>
            </div>
            <span className="w-7 h-7 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center shrink-0">
              <Icon name="zap" size={15} />
            </span>
          </div>

          <div className="bg-white p-1.5 rounded-2xl border border-indigo-100 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">
                Marcador de Avance
              </p>
              <h3 className="text-base font-bold text-indigo-700">
                Día {CURRENT_DAY_MARKER} Activo
              </h3>
            </div>
            <span className="w-7 h-7 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <Icon name="map-pin" size={15} />
            </span>
          </div>

          <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Filtro de Vista
              </p>
              <button
                onClick={() => setOnlyCritical(!onlyCritical)}
                className={`mt-0.5 text-xs font-bold px-1.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  onlyCritical
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                }`}
              >
                {onlyCritical ? "Solo críticas" : "Ver todas"}
              </button>
            </div>
            <span className="w-7 h-7 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center shrink-0">
              <Icon name="search" size={15} />
            </span>
          </div>
        </div>

        {/* CONTENEDOR PRINCIPAL */}
        <div className="flex-1 grid grid-cols-12 gap-2 min-h-0 overflow-hidden">
          {/* VISTA DEL GANTT DETALLADO */}
          <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-2 shadow-2xs flex flex-col min-h-0 overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 mb-1.5 pb-1.5 border-b border-slate-100 shrink-0">
              {/* SELECTORES DE PROYECTO Y ESTADO */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Proyecto:
                  </span>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-1.5 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                  >
                    {projects.map((proj) => (
                      <option key={proj} value={proj}>
                        {proj}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Estado:
                  </span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-1.5 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                  >
                    <option value="Todos los Estados">Todos los Estados</option>
                    <option value="Completadas">Completadas</option>
                    <option value="En Proceso">En Proceso</option>
                    <option value="Pendientes">Pendientes</option>
                    <option value="Postergadas">
                      Postergadas / Reagendadas
                    </option>
                  </select>
                </div>
              </div>

              {/* Leyenda Explicativa */}
              <div className="flex items-center gap-1.5 text-[10px] font-bold bg-slate-50 px-1.5 py-1 rounded-xl border border-slate-200/80 flex-wrap">
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>{" "}
                  Completada
                </span>
                <span className="flex items-center gap-1 text-amber-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>{" "}
                  Postergada
                </span>
                <span className="flex items-center gap-1 text-rose-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 animate-pulse"></span>{" "}
                  Ruta Crítica
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 relative">
              {loadingDb ? (
                <div className="flex items-center justify-center h-48 text-xs font-bold text-slate-500 gap-1">
                  <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                  Sincronizando cronograma con Supabase...
                </div>
              ) : (
                <div className="min-w-[720px] relative">
                  {/* Encabezado del Cronograma */}
                  <div className="grid grid-cols-12 gap-1 border-b border-slate-200 pb-1 mb-1 text-center sticky top-0 bg-white z-10">
                    <div className="col-span-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Tarea / Desplazamiento
                    </div>
                    <div
                      className="col-span-8 grid gap-1 text-[10px] font-mono font-bold text-slate-400"
                      style={{
                        gridTemplateColumns: "repeat(15, minmax(0, 1fr))",
                      }}
                    >
                      {TIMELINE_DAYS.map((d) => (
                        <span
                          key={d}
                          className={`text-center py-0.5 rounded border ${
                            d === CURRENT_DAY_MARKER
                              ? "bg-blue-600 text-white font-bold border-blue-600 shadow-xs"
                              : "bg-slate-50 border-slate-100"
                          }`}
                        >
                          D{d}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Filas del Gantt */}
                  <div className="space-y-1.5 relative">
                    {filteredTasks.map((task) => {
                      const gridStart = task.startDay;
                      const duration = task.durationDays;
                      const slack = task.slackDays;
                      const progress = task.progressPercent ?? 0;

                      const isPostponed = task.status === "Postergada";

                      return (
                        <div
                          key={task.id}
                          className={`grid grid-cols-12 gap-1 items-center p-1.5 rounded-xl transition-all border group ${
                            task.isMilestone
                              ? "bg-amber-50/50 border-amber-300"
                              : isPostponed
                                ? "bg-amber-50/60 border-amber-300 hover:border-amber-400"
                                : task.isCritical
                                  ? "bg-rose-50/40 border-rose-300 hover:border-rose-400"
                                  : "bg-slate-50/40 border-slate-200/80 hover:border-slate-300"
                          }`}
                        >
                          {/* Columna Izquierda con Controles Desplazables */}
                          <div className="col-span-4 pr-1 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span
                                onClick={() => setEditingTask(task)}
                                className="text-xs font-bold text-slate-900 truncate max-w-[140px] cursor-pointer hover:text-blue-600 hover:underline"
                                title="Haz clic para editar detalles"
                              >
                                {task.title}
                              </span>

                              {/* ↔️ BOTONES DE DESPLAZAMIENTO RÁPIDO */}
                              <div className="flex items-center bg-slate-200/80 rounded-lg p-0.5 border border-slate-300 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleShiftTask(task.id, "left");
                                  }}
                                  disabled={gridStart <= 1}
                                  title="Adelantar inicio (-1 día)"
                                  className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-2xs"
                                >
                                  ◄
                                </button>
                                <span className="text-[9px] font-mono font-bold px-1 text-slate-600">
                                  D{gridStart}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleShiftTask(task.id, "right");
                                  }}
                                  disabled={gridStart + duration > 15}
                                  title="Postergar inicio (+1 día)"
                                  className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-100 rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-2xs"
                                >
                                  ►
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                              <div className="flex items-center gap-1">
                                <span className="h-4 w-4 rounded-full bg-slate-800 text-white text-[8px] font-bold flex items-center justify-center shrink-0">
                                  {task.assigneeAvatar}
                                </span>
                                <span className="truncate max-w-[85px]">
                                  {task.assigneeName}
                                </span>
                              </div>

                              {/* Insignia de Estado */}
                              {isPostponed ? (
                                <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1 py-0.5 rounded border border-amber-300">
                                  Postergada
                                </span>
                              ) : task.status === "Completada" ? (
                                <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded border border-emerald-300">
                                  Completada
                                </span>
                              ) : task.isCritical ? (
                                <span className="text-[9px] font-bold text-rose-700 bg-rose-100 px-1 py-0.5 rounded border border-rose-200">
                                  Ruta Crítica
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1 py-0.5 rounded border border-blue-200">
                                  En Proceso
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Columna Derecha con Barra Desplazable */}
                          <div
                            className="col-span-8 grid gap-0 items-center relative h-9 bg-slate-100/80 rounded-xl p-1 border border-slate-200/60"
                            style={{
                              gridTemplateColumns: "repeat(15, minmax(0, 1fr))",
                            }}
                          >
                            {task.isMilestone ? (
                              <div
                                style={{
                                  gridColumnStart: gridStart,
                                  gridColumnEnd: `span 2`,
                                }}
                                className="h-full flex items-center gap-1 text-amber-800 font-bold text-[10px] bg-amber-200 border border-amber-400 rounded-lg px-1 shadow-2xs"
                              >
                                <span>◆</span>
                                <span className="truncate">{task.title}</span>
                              </div>
                            ) : (
                              <div
                                onClick={() => setEditingTask(task)}
                                style={{
                                  gridColumnStart: gridStart,
                                  gridColumnEnd: `span ${duration}`,
                                }}
                                className={`h-full rounded-lg flex items-center justify-between px-1 text-[10px] font-bold text-white shadow-xs transition-all relative overflow-hidden cursor-pointer ${
                                  task.isCritical
                                    ? "bg-rose-900/30 border border-rose-500 ring-2 ring-rose-500/20"
                                    : isPostponed
                                      ? "bg-amber-900/30 border border-amber-500"
                                      : "bg-emerald-900/30 border border-emerald-500"
                                }`}
                              >
                                <div
                                  style={{ width: `${progress}%` }}
                                  className={`absolute left-0 top-0 bottom-0 transition-all ${
                                    task.isCritical
                                      ? "bg-gradient-to-r from-rose-500 to-rose-600"
                                      : isPostponed
                                        ? "bg-gradient-to-r from-amber-500 to-amber-600"
                                        : "bg-gradient-to-r from-emerald-500 to-emerald-600"
                                  }`}
                                />

                                <span className="relative z-10 truncate flex items-center gap-1 drop-shadow-xs">
                                  {task.isCritical && (
                                    <Icon name="zap" size={11} />
                                  )}
                                  {isPostponed && (
                                    <Icon name="clock" size={11} />
                                  )}
                                  Duración: {duration}d
                                </span>
                                <span className="relative z-10 font-mono bg-black/40 px-1 py-0.5 rounded text-[9px]">
                                  {progress}%
                                </span>
                              </div>
                            )}

                            {!task.isCritical &&
                              slack > 0 &&
                              !task.isMilestone && (
                                <div
                                  style={{
                                    gridColumnStart: gridStart + duration,
                                    gridColumnEnd: `span ${slack}`,
                                  }}
                                  className="h-full bg-emerald-100/90 border border-dashed border-emerald-400 rounded-lg flex items-center justify-center text-[9px] font-mono text-emerald-800 font-bold"
                                >
                                  +{slack}d holgura
                                </div>
                              )}
                          </div>
                        </div>
                      );
                    })}

                    {filteredTasks.length === 0 && (
                      <div className="text-center py-6 text-xs font-bold text-slate-400">
                        No hay tareas registradas para este filtro.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* PANEL DIAGNÓSTICO IA */}
          <div className="col-span-12 lg:col-span-4 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-2 md:p-3 shadow-sm flex flex-col justify-between min-h-0 overflow-y-auto border border-slate-800">
            <div>
              <div className="flex justify-between items-center pb-1.5 border-b border-white/10">
                <div className="flex items-center gap-1">
                  <span className="w-7 h-7 bg-purple-500/20 rounded-lg flex items-center justify-center shrink-0">
                    <Icon name="bot" size={15} />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                      AI Route Doctor
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {selectedProject}
                    </p>
                  </div>
                </div>

                <span className="text-[9px] bg-purple-500/20 text-purple-200 border border-purple-400/30 px-1 py-0.5 rounded-full font-mono">
                  Gemini API
                </span>
              </div>

              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between items-center bg-white/5 p-1.5 rounded-xl border border-white/10">
                  <span className="text-[11px] text-slate-300 font-medium">
                    Diagnóstico de Entrega:
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1 py-0.5 rounded-md ${
                      aiDiagnostic.riskLevel === "ALTO"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : aiDiagnostic.riskLevel === "MEDIO"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    {aiDiagnostic.riskLevel === "ALTO"
                      ? "RIESGO ALTO"
                      : aiDiagnostic.riskLevel === "MEDIO"
                        ? "RIESGO MEDIO"
                        : "RIESGO BAJO"}
                  </span>
                </div>

                <div className="p-1.5 bg-white/5 border border-white/10 rounded-xl space-y-1">
                  <p className="font-bold text-purple-300 text-[11px] flex items-center gap-1">
                    <Icon name="bar-chart" size={12} /> Situación Actual:
                  </p>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {aiDiagnostic.summary}
                  </p>
                </div>

                <div className="p-1.5 bg-purple-900/30 border border-purple-500/20 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-amber-300 font-bold">
                      Cuello de Botella Detectado:
                    </span>
                    <span className="text-white font-mono bg-white/10 px-1 py-0.5 rounded max-w-[150px] truncate">
                      {aiDiagnostic.bottleneckPerson}
                    </span>
                  </div>

                  <p className="text-[11px] text-purple-100">
                    <Icon
                      name="lightbulb"
                      size={12}
                      className="inline -mt-0.5 mr-1"
                    />
                    <strong className="text-white">Recomendación:</strong>{" "}
                    {aiDiagnostic.suggestion}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() =>
                alert(
                  `Exportando diagnóstico de Ruta Crítica para ${selectedProject}…`,
                )
              }
              className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-1 rounded-xl text-xs border border-white/15 transition-all cursor-pointer mt-2"
            >
              Exportar diagnóstico Gantt
            </button>
          </div>
        </div>
      </main>

      {/* ✏️ MODAL DE EDICIÓN DE TAREA CON ESTADO POSTERGADA */}
      {editingTask && (
        <ModalOverlay onClose={() => setEditingTask(null)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Editar Actividad del Gantt
                </h3>
                <p className="text-[11px] text-slate-500">
                  ID: {editingTask.id} • {editingTask.project}
                </p>
              </div>
              <button
                onClick={() => setEditingTask(null)}
                className="text-slate-400 cursor-pointer hover:text-slate-600"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveTaskEdit} className="space-y-2 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Título de la Tarea
                </label>
                <input
                  type="text"
                  required
                  value={editingTask.title}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, title: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-3 gap-1">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Inicio (Día)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    required
                    value={editingTask.startDay}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        startDay: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Duración (Días)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingTask.durationDays}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        durationDays: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Holgura (Días)
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingTask.slackDays}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        slackDays: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                  />
                </div>
              </div>

              {/* ⚡ ESTADO Y PORCENTAJE AUTO-SINCRONIZADO */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Estado de la Tarea
                </label>
                <select
                  value={editingTask.status}
                  onChange={(e) => {
                    const newStatus = e.target.value as
                      "Pendiente" | "En Proceso" | "Completada" | "Postergada";
                    let autoProgress = editingTask.progressPercent;
                    if (newStatus === "Pendiente") autoProgress = 0;
                    if (newStatus === "Completada") autoProgress = 100;
                    if (
                      newStatus === "En Proceso" &&
                      (autoProgress === 0 || autoProgress === 100)
                    )
                      autoProgress = 50;

                    setEditingTask({
                      ...editingTask,
                      status: newStatus,
                      progressPercent: autoProgress,
                    });
                  }}
                  className="w-full border border-slate-300 rounded-xl p-1.5 text-slate-900 font-medium bg-white outline-none"
                >
                  <option value="Pendiente">Pendiente (0%)</option>
                  <option value="En Proceso">En Proceso</option>
                  <option value="Postergada">
                    Postergada / Reagendada (Tiempo Extra)
                  </option>
                  <option value="Completada">Completada (100%)</option>
                </select>
              </div>

              {/* 🎯 BOTONES DE SELECCIÓN RÁPIDA DE PORCENTAJE */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Avance Rápido ({editingTask.progressPercent}%)
                </label>
                <div className="flex gap-1">
                  {[0, 25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        let newStatus:
                          | "Pendiente"
                          | "En Proceso"
                          | "Completada"
                          | "Postergada" = editingTask.status;
                        if (p === 0) newStatus = "Pendiente";
                        if (p === 100) newStatus = "Completada";

                        setEditingTask({
                          ...editingTask,
                          progressPercent: p,
                          status: newStatus,
                        });
                      }}
                      className={`flex-1 py-1 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                        editingTask.progressPercent === p
                          ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <label className="flex items-center gap-1 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingTask.isCritical}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        isCritical: e.target.checked,
                      })
                    }
                    className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Pertenece a Ruta Crítica
                  </span>
                </label>

                <label className="flex items-center gap-1 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingTask.isMilestone}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        isMilestone: e.target.checked,
                      })
                    }
                    className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span>◆ Es un Hito</span>
                </label>
              </div>

              <div className="flex gap-1 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingTask}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-xl font-bold cursor-pointer transition-colors shadow-xs"
                >
                  {isSavingTask ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
