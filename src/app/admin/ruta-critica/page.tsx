'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '../../../components/Sidebar';
import { supabase } from '../../../lib/supabase';

interface CriticalTask {
  id: string;
  project: string;
  title: string;
  assigneeName: string;
  assigneeAvatar: string;
  durationDays: number;
  startDay: number;
  progressPercent?: number;
  dependsOn?: string;
  isCritical: boolean;
  status: 'Completada' | 'En Proceso' | 'Pendiente';
  slackDays: number;
  isMilestone?: boolean;
}

interface AiRecommendation {
  riskLevel: 'ALTO' | 'MEDIO' | 'BAJO';
  summary: string;
  bottleneckPerson: string;
  suggestion: string;
}

const TIMELINE_DAYS = Array.from({ length: 15 }, (_, i) => i + 1);
const CURRENT_DAY_MARKER = 5;

export default function CriticalPathPage() {
  const [projects, setProjects] = useState<string[]>(['Todos los Proyectos']);
  const [selectedProject, setSelectedProject] = useState('Todos los Proyectos');
  const [tasks, setTasks] = useState<CriticalTask[]>([]);
  const [reuniones, setReuniones] = useState<any[]>([]);
  const [onlyCritical, setOnlyCritical] = useState(false);
  
  const [loadingDb, setLoadingDb] = useState(true);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);

  // Estado del diagnóstico dinámico conectado a Gemini
  const [aiDiagnostic, setAiDiagnostic] = useState<AiRecommendation>({
    riskLevel: 'BAJO',
    summary: 'Haz clic en "Diagnóstico IA" para analizar las holguras y cuellos de botella reales de tus tareas.',
    bottleneckPerson: 'Sin analizar',
    suggestion: 'Gemini calculará automáticamente los riesgos basados en las actividades de Supabase.',
  });

  // 🔄 1. CARGA DE DATOS EN TIEMPO REAL DESDE SUPABASE
  const fetchData = async () => {
    try {
      setLoadingDb(true);

      // A) Obtener nombres de proyectos reales
      const { data: projData } = await supabase.from('proyectos').select('nombre');
      if (projData && projData.length > 0) {
        setProjects(['Todos los Proyectos', ...projData.map(p => p.nombre)]);
      }

      // B) Cargar reuniones para contexto de la IA
      const { data: reunData } = await supabase.from('reuniones').select('titulo, fecha_inicio, estado');
      if (reunData) setReuniones(reunData);

      // C) Cargar tareas relacionales
      const { data: tareasData, error: tareasErr } = await supabase
        .from('tareas')
        .select(`
          id,
          titulo,
          duracion_dias,
          dia_inicio,
          porcentaje_avance,
          es_critica,
          es_hito,
          estado,
          holgura_dias,
          depende_de,
          empleados (nombre),
          proyectos (nombre)
        `);

      if (tareasErr) throw tareasErr;

      if (tareasData) {
        const mappedTasks: CriticalTask[] = tareasData.map((t: any) => {
          const empNombre = t.empleados?.nombre || 'Sin asignar';
          const initials = empNombre
            .split(' ')
            .map((n: string) => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

          return {
            id: t.id ? String(t.id) : `T-${Math.random()}`,
            project: t.proyectos?.nombre || 'General',
            title: t.titulo || 'Tarea sin título',
            assigneeName: empNombre,
            assigneeAvatar: t.es_hito ? '🚀' : initials,
            durationDays: t.duracion_dias || 1,
            startDay: t.dia_inicio || 1,
            progressPercent: t.porcentaje_avance ?? 0,
            dependsOn: t.depende_de || undefined,
            isCritical: Boolean(t.es_critica),
            slackDays: t.holgura_dias ?? 0,
            isMilestone: Boolean(t.es_hito),
            status: t.estado || 'Pendiente',
          };
        });
        setTasks(mappedTasks);
      }
    } catch (err) {
      console.error('Error al sincronizar Supabase en Ruta Crítica:', err);
    } finally {
      setLoadingDb(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 🤖 2. CONSULTA DIRECTA AL ENDPOINT DE GEMINI AI
  const runGeminiAnalysis = async (proyectoActual: string, tareasFiltradas: CriticalTask[]) => {
    try {
      setIsAiAnalyzing(true);

      const response = await fetch('/api/ruta-critica/analizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proyectoNombre: proyectoActual,
          tareas: tareasFiltradas,
          reuniones: reuniones,
        }),
      });

      if (!response.ok) throw new Error('Error al consultar Gemini');

      const data = await response.json();

      let mappedRisk: 'ALTO' | 'MEDIO' | 'BAJO' = 'BAJO';
      if (data.estadoGeneral === 'Crítico' || data.estadoGeneral === 'ALTO') mappedRisk = 'ALTO';
      else if (data.estadoGeneral === 'En riesgo' || data.estadoGeneral === 'MEDIO') mappedRisk = 'MEDIO';

      setAiDiagnostic({
        riskLevel: mappedRisk,
        summary: data.resumenEjecutivo || 'Análisis finalizado correctamente.',
        bottleneckPerson: data.puntosCriticos?.[0] || 'Por evaluar',
        suggestion: data.recomendaciones?.[0]?.descripcion || data.resumenEjecutivo,
      });
    } catch (error) {
      console.error('Error ejecutando IA:', error);
      alert('No se pudo generar el diagnóstico. Asegúrate de tener configurado tu GEMINI_API_KEY en el .env');
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const filteredTasks = tasks.filter(t => {
    const isAllSelected = selectedProject === 'Todos los Proyectos';
    const matchesProject = isAllSelected || t.project.trim().toLowerCase() === selectedProject.trim().toLowerCase();
    const matchesCritical = onlyCritical ? t.isCritical : true;
    return matchesProject && matchesCritical;
  });

  const totalDays = filteredTasks.reduce((acc, t) => t.isCritical ? acc + t.durationDays : acc, 0);
  const criticalCount = filteredTasks.filter(t => t.isCritical).length;

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      <Sidebar />

      <main className="flex-1 flex flex-col p-5 md:p-6 overflow-hidden h-full min-w-0">
        
        {/* ENCABEZADO */}
        <header className="flex justify-between items-center mb-4 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              🛣️ Diagrama Gantt & Ruta Crítica
            </h1>
            <p className="text-xs text-slate-500">
              Cronograma detallado con avance de tareas, hitos clave y marcador de día actual
            </p>
          </div>

          <button
            onClick={() => runGeminiAnalysis(selectedProject, filteredTasks)}
            disabled={isAiAnalyzing || loadingDb}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isAiAnalyzing ? '⚙️ Re-analizando...' : '✨ Diagnóstico IA'}
          </button>
        </header>

        {/* METRICAS SUPERIORES */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 shrink-0">
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duración Total Estimada</p>
              <h3 className="text-base font-bold text-slate-900">{totalDays} Días Hábiles</h3>
            </div>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl text-base">📅</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-rose-100 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Tareas Urgentes</p>
              <h3 className="text-base font-bold text-rose-600">{criticalCount} Críticas</h3>
            </div>
            <span className="p-2 bg-rose-50 text-rose-600 rounded-xl text-base">⚡</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-indigo-100 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Día Actual</p>
              <h3 className="text-base font-bold text-indigo-700">Día {CURRENT_DAY_MARKER} del Sprint</h3>
            </div>
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl text-base">📍</span>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtro de Vista</p>
              <button
                onClick={() => setOnlyCritical(!onlyCritical)}
                className={`mt-0.5 text-xs font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  onlyCritical 
                    ? 'bg-rose-50 text-rose-700 border-rose-200' 
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                {onlyCritical ? '🔴 Solo Críticas' : '👁️ Ver Todas'}
              </button>
            </div>
            <span className="p-2 bg-slate-100 text-slate-600 rounded-xl text-base">🔍</span>
          </div>
        </div>

        {/* CONTENEDOR PRINCIPAL */}
        <div className="flex-1 grid grid-cols-12 gap-4 min-h-0 overflow-hidden">
          
          {/* VISTA DEL GANTT DETALLADO */}
          <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col min-h-0 overflow-hidden">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Proyecto:</span>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                >
                  {projects.map((proj) => (
                    <option key={proj} value={proj}>{proj}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 text-[10px] font-bold bg-slate-50 px-3 py-1 rounded-xl border border-slate-200/60">
                <span className="flex items-center gap-1 text-rose-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shadow-xs"></span> Ruta Crítica
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-xs"></span> Holgura
                </span>
                <span className="flex items-center gap-1 text-amber-600">
                  <span>◆</span> Hito
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 relative">
              {loadingDb ? (
                <div className="flex items-center justify-center h-48 text-xs font-bold text-slate-500 gap-2">
                  <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                  Sincronizando cronograma con Supabase...
                </div>
              ) : (
                <div className="min-w-[650px] relative">
                  
                  <div className="grid grid-cols-12 gap-1 border-b border-slate-200 pb-2 mb-2 text-center sticky top-0 bg-white z-10">
                    <div className="col-span-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Tarea / Progreso
                    </div>
                    <div 
                      className="col-span-8 grid gap-1 text-[10px] font-mono font-bold text-slate-400"
                      style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}
                    >
                      {TIMELINE_DAYS.map((d) => (
                        <span key={d} className={`text-center py-0.5 rounded border ${
                          d === CURRENT_DAY_MARKER 
                            ? 'bg-blue-600 text-white font-bold border-blue-600 shadow-xs' 
                            : 'bg-slate-50 border-slate-100'
                        }`}>
                          d{d}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 relative">
                    {filteredTasks.map((task) => {
                      const gridStart = task.startDay;
                      const duration = task.durationDays;
                      const slack = task.slackDays;
                      const progress = task.progressPercent ?? 0;

                      return (
                        <div 
                          key={task.id} 
                          className={`grid grid-cols-12 gap-1 items-center p-2 rounded-xl transition-all border ${
                            task.isMilestone
                              ? 'bg-amber-50/40 border-amber-200'
                              : task.isCritical 
                                ? 'bg-rose-50/20 border-rose-100 hover:border-rose-200' 
                                : 'bg-slate-50/40 border-slate-200/60 hover:border-slate-300'
                          }`}
                        >
                          <div className="col-span-4 pr-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow-2xs ${
                                task.isMilestone 
                                  ? 'bg-amber-500 text-white' 
                                  : task.isCritical 
                                    ? 'bg-rose-600 text-white' 
                                    : 'bg-slate-200 text-slate-700'
                              }`}>
                                {task.id}
                              </span>
                              <span className="text-xs font-bold text-slate-800 truncate" title={task.title}>
                                {task.title}
                              </span>
                            </div>

                            <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between font-medium">
                              <div className="flex items-center gap-1.5">
                                <span className="h-4 w-4 rounded-full bg-slate-800 text-white text-[8px] font-bold flex items-center justify-center shrink-0">
                                  {task.assigneeAvatar}
                                </span>
                                <span className="truncate">{task.assigneeName}</span>
                              </div>

                              {!task.isMilestone && (
                                <span className="font-mono text-[9px] font-bold px-1 rounded bg-slate-100 text-slate-700">
                                  {progress}%
                                </span>
                              )}
                            </div>
                          </div>

                          <div 
                            className="col-span-8 grid gap-0 items-center relative h-8 bg-slate-100/60 rounded-xl p-1 border border-slate-200/50"
                            style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}
                          >
                            {task.isMilestone ? (
                              <div
                                style={{ gridColumnStart: gridStart, gridColumnEnd: `span 2` }}
                                className="h-full flex items-center gap-1 text-amber-700 font-bold text-[10px] bg-amber-100 border border-amber-300 rounded-lg px-2"
                              >
                                <span>◆</span>
                                <span className="truncate">{task.title}</span>
                              </div>
                            ) : (
                              <div
                                style={{ gridColumnStart: gridStart, gridColumnEnd: `span ${duration}` }}
                                className={`h-full rounded-lg flex items-center justify-between px-2 text-[10px] font-bold text-white shadow-2xs transition-all relative overflow-hidden group cursor-pointer ${
                                  task.isCritical ? 'bg-rose-900/30 border border-rose-500' : 'bg-emerald-900/30 border border-emerald-500'
                                }`}
                              >
                                <div
                                  style={{ width: `${progress}%` }}
                                  className={`absolute left-0 top-0 bottom-0 transition-all ${
                                    task.isCritical ? 'bg-gradient-to-r from-rose-500 to-rose-600' : 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                                  }`}
                                />

                                <span className="relative z-10 truncate flex items-center gap-1 drop-shadow-xs">
                                  {task.isCritical && <span>⚡</span>}
                                  {task.id}
                                </span>
                                <span className="relative z-10 font-mono bg-black/30 px-1 rounded text-[9px]">
                                  {duration}d
                                </span>

                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[10px] p-2.5 rounded-xl shadow-xl z-30 whitespace-nowrap pointer-events-none border border-slate-700">
                                  <span className="font-bold text-blue-300">{task.title}</span>
                                  <span>Avance: <strong>{progress}%</strong></span>
                                  <span>Responsable: <strong>{task.assigneeName}</strong></span>
                                  <span className={task.isCritical ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                    {task.isCritical ? '⚡ Ruta Crítica (0d Holgura)' : `🌱 Holgura: +${task.slackDays} días`}
                                  </span>
                                </div>
                              </div>
                            )}

                            {!task.isCritical && slack > 0 && !task.isMilestone && (
                              <div
                                style={{ gridColumnStart: gridStart + duration, gridColumnEnd: `span ${slack}` }}
                                className="h-full bg-emerald-100/80 border border-dashed border-emerald-400 rounded-lg flex items-center justify-center text-[9px] font-mono text-emerald-800 font-bold"
                              >
                                +{slack}d
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {filteredTasks.length === 0 && (
                      <div className="text-center py-8 text-xs font-bold text-slate-400">
                        No hay tareas registradas para este filtro.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* PANEL DIAGNÓSTICO IA */}
          <div className="col-span-12 lg:col-span-4 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-4 md:p-5 shadow-sm flex flex-col justify-between min-h-0 overflow-y-auto border border-slate-800">
            <div>
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-purple-500/20 rounded-lg text-base">🤖</span>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                      AI Route Doctor
                    </h3>
                    <p className="text-[10px] text-slate-400">{selectedProject}</p>
                  </div>
                </div>

                <span className="text-[9px] bg-purple-500/20 text-purple-200 border border-purple-400/30 px-2 py-0.5 rounded-full font-mono">
                  Gemini API
                </span>
              </div>

              <div className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-xl border border-white/10">
                  <span className="text-[11px] text-slate-300 font-medium">Diagnóstico de Entrega:</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    aiDiagnostic.riskLevel === 'ALTO' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                    aiDiagnostic.riskLevel === 'MEDIO' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                    'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {aiDiagnostic.riskLevel === 'ALTO' ? '🚨 RIESGO ALTO' :
                     aiDiagnostic.riskLevel === 'MEDIO' ? '⚠️ RIESGO MEDIO' : '✅ RIESGO BAJO'}
                  </span>
                </div>

                <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1">
                  <p className="font-bold text-purple-300 text-[11px] flex items-center gap-1">
                    <span>📊</span> Situación Actual:
                  </p>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {aiDiagnostic.summary}
                  </p>
                </div>

                <div className="p-3 bg-purple-900/30 border border-purple-500/20 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-amber-300 font-bold">Cuello de Botella Detectado:</span>
                    <span className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded max-w-[150px] truncate">
                      {aiDiagnostic.bottleneckPerson}
                    </span>
                  </div>

                  <p className="text-[11px] text-purple-100">
                    💡 <strong className="text-white">Recomendación:</strong> {aiDiagnostic.suggestion}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => alert(`📄 Exportando diagnóstico de Ruta Crítica para ${selectedProject}...`)}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-2 rounded-xl text-xs border border-white/15 transition-all cursor-pointer mt-4"
            >
              📄 Exportar Diagnóstico Gantt
            </button>
          </div>

        </div>

      </main>
    </div>
  );
}