'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '../../../components/Sidebar';
import { supabase } from '../../../lib/supabaseClient';

type TaskStatus = 'Completado' | 'En Proceso' | 'Pendiente' | 'Postergada';

interface TaskHistoryItem {
  id: string;
  employee: string;
  employeeId?: string;
  project: string;
  projectId?: string;
  task: string;
  startDate: string; 
  endDate: string;   
  delayedDays?: number;
  status: TaskStatus;
}

interface FilterOption {
  id: string;
  name: string;
}

const STATUSES = [
  { id: 'all', name: 'Todos los Estados' },
  { id: 'Completado', name: '✓ Completadas' },
  { id: 'En Proceso', name: '🔵 En Proceso' },
  { id: 'Pendiente', name: '⏳ Pendientes' },
  { id: 'Postergada', name: '⚠️ Postergadas / Reagendadas' },
];

export default function HistorialPage() {
  const [tasksHistory, setTasksHistory] = useState<TaskHistoryItem[]>([]);
  const [employeesList, setEmployeesList] = useState<FilterOption[]>([{ id: 'all', name: 'Todos los Empleados' }]);
  const [projectsList, setProjectsList] = useState<FilterOption[]>([{ id: 'all', name: 'Todos los Proyectos' }]);
  
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');

  const formatDate = (dateString?: string | null): string => {
  if (!dateString || dateString === 'Sin fecha') return 'Sin fecha';
  
  // Extraemos únicamente la parteYYYY-MM-DD para evitar desfases de zona horaria
  const cleanDateStr = dateString.split('T')[0];
  const [year, month, day] = cleanDateStr.split('-');

  if (!year || !month || !day) return dateString;

  // Formato: DD/MM/YYYY (Ej. 04/08/2026)
  return `${day}/${month}/${year}`;
};

 // 🔄 CARGA DE DATOS DESDE SUPABASE (OPTIMIZADA Y SEGURA)
  const fetchHistorialData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      // 1. Consultar Tareas, Empleados y Proyectos en paralelo para evitar fallos de Foreign Key
      const [
        { data: tareasData, error: tareasErr },
        { data: empData, error: empErr },
        { data: projData, error: projErr }
      ] = await Promise.all([
        supabase.from('tareas').select('*').order('fecha_asignada', { ascending: false }),
        supabase.from('empleados').select('id, nombre'),
        supabase.from('proyectos').select('id, nombre')
      ]);

      if (tareasErr) throw new Error(`Error en tareas: ${tareasErr.message}`);
      if (empErr) console.warn('Error cargando empleados:', empErr.message);
      if (projErr) console.warn('Error cargando proyectos:', projErr.message);

      // Crear mapas para búsqueda rápida por ID
      const empMap = new Map((empData || []).map((e: any) => [String(e.id), e.nombre]));
      const projMap = new Map((projData || []).map((p: any) => [String(p.id), p.nombre]));

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 2. Mapear las tareas uniendo los nombres localmente
      const mappedTasks: TaskHistoryItem[] = (tareasData || []).map((t: any) => {
        const empName = empMap.get(String(t.empleado_id)) || 'Sin asignar';
        const projName = projMap.get(String(t.proyecto_id)) || 'General';
        
        let rawStatus = t.estado || 'Pendiente';
        let finalStatus: TaskStatus = 'Pendiente';
        let delayedDays: number | undefined = undefined;

        const limitDateStr = t.fecha_limite || t.fecha_completado || t.fecha_asignada || '';
        
        if (rawStatus === 'completado' || rawStatus === 'Completado' || rawStatus === 'Completada') {
          finalStatus = 'Completado';
        } else if (rawStatus === 'En Proceso' || rawStatus === 'en_proceso') {
          finalStatus = 'En Proceso';
        } else if (rawStatus === 'Postergada' || rawStatus === 'postergada') {
          finalStatus = 'Postergada';
        } else {
          finalStatus = 'Pendiente';
        }

        // Evaluar días de retraso si la fecha límite ya venció
        if (finalStatus !== 'Completado' && t.fecha_limite) {
          const limitDate = new Date(t.fecha_limite);
          limitDate.setHours(0, 0, 0, 0);
          
          if (limitDate < today) {
            finalStatus = 'Postergada';
            const diffTime = Math.abs(today.getTime() - limitDate.getTime());
            delayedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          }
        }

        return {
          id: String(t.id),
          employee: empName,
          employeeId: t.empleado_id,
          project: projName,
          projectId: t.proyecto_id,
          task: t.titulo || t.descripcion || 'Sin descripción',
          startDate: formatDate(t.fecha_asignada), // 👈 Formateado
          endDate: formatDate(limitDateStr),
          delayedDays,
          status: finalStatus
        };
      });

      setTasksHistory(mappedTasks);

      // 3. Cargar select de Filtros
      if (empData) {
        setEmployeesList([
          { id: 'all', name: 'Todos los Empleados' },
          ...empData.map((e: any) => ({ id: e.nombre, name: e.nombre }))
        ]);
      }

      if (projData) {
        setProjectsList([
          { id: 'all', name: 'Todos los Proyectos' },
          ...projData.map((p: any) => ({ id: p.nombre, name: p.nombre }))
        ]);
      }

      setLastUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    } catch (err: any) {
      console.error('Error al cargar historial desde Supabase:', err);
      setErrorMessage(err.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistorialData();
  }, []);

  // Filtrado combinado
  const filteredHistory = useMemo(() => {
    return tasksHistory.filter(task => {
      const matchesEmployee = selectedEmployee === 'all' || task.employee === selectedEmployee;
      const matchesProject = selectedProject === 'all' || task.project === selectedProject;
      const matchesStatus = selectedStatus === 'all' || task.status === selectedStatus;
      const matchesSearch = 
        task.task.toLowerCase().includes(searchTerm.toLowerCase()) || 
        task.employee.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.project.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesEmployee && matchesProject && matchesStatus && matchesSearch;
    });
  }, [tasksHistory, selectedEmployee, selectedProject, selectedStatus, searchTerm]);

  // Contadores para métricas
  const completedCount = filteredHistory.filter(t => t.status === 'Completado').length;
  const delayedCount = filteredHistory.filter(t => t.status === 'Postergada').length;
  const pendingCount = filteredHistory.filter(t => t.status === 'Pendiente').length;

  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-600">Cargando Historial de Supabase...</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="h-screen w-screen bg-slate-50 flex items-center justify-center font-sans p-4">
        <div className="bg-white p-6 rounded-2xl border border-red-200 max-w-md w-full shadow-lg text-center space-y-3">
          <span className="text-3xl">⚠️</span>
          <h3 className="text-sm font-bold text-slate-900">Error al consultar Supabase</h3>
          <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100 font-mono">{errorMessage}</p>
          <button onClick={fetchHistorialData} className="w-full bg-blue-600 text-white text-xs font-bold py-2 rounded-xl cursor-pointer">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      
      {/* SIDEBAR FIJO */}
      <Sidebar />

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col p-5 overflow-hidden h-full min-w-0">
        
        {/* ENCABEZADO Y FILTROS */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 mb-4 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              📜 Historial de Actividades
            </h1>
            <p className="text-xs text-slate-500">
              Registro cronológico de tareas asignadas, tiempos de ejecución y estado de cumplimiento
            </p>
          </div>
          
          {/* CONTENEDOR DE FILTROS */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            
            {/* BUSCADOR */}
            <div className="relative flex-1 sm:w-48">
              <input
                type="text"
                placeholder="Buscar por tarea o persona..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-700 text-xs font-medium py-2 pl-8 pr-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs"
              />
              <span className="absolute left-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
            </div>

            {/* FILTROS */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold py-2 px-3 rounded-xl focus:outline-none cursor-pointer shadow-2xs"
            >
              {STATUSES.map(st => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>

            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold py-2 px-3 rounded-xl focus:outline-none cursor-pointer shadow-2xs"
            >
              {projectsList.map(proj => (
                <option key={proj.id} value={proj.id}>{proj.name}</option>
              ))}
            </select>

            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold py-2 px-3 rounded-xl focus:outline-none cursor-pointer shadow-2xs"
            >
              {employeesList.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>

          </div>
        </header>

        {/* BARRA DE METRICAS Y UTILIDADES */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3 mb-4 shadow-2xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-slate-600">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Sincronizado: <span className="font-mono font-bold text-slate-800">{lastUpdate}</span>
            </div>
            
            <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Totales: <strong className="text-slate-900">{filteredHistory.length}</strong></span>
              
              <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200/60">
                ✓ {completedCount} Completadas
              </span>

              {delayedCount > 0 && (
                <span className="bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded-md border border-rose-200/60">
                  ⚠️ {delayedCount} Postergadas
                </span>
              )}

              {pendingCount > 0 && (
                <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-md border border-amber-200/60">
                  ⏳ {pendingCount} Pendientes
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={fetchHistorialData}
              className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold py-1.5 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              🔄 Recargar
            </button>
            <button
              onClick={() => alert('Generando PDF...')}
              className="flex-1 sm:flex-initial bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold py-1.5 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              📄 Exportar PDF
            </button>
            <button
              onClick={() => alert('Exportando a Excel...')}
              className="flex-1 sm:flex-initial bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold py-1.5 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              📊 Exportar Excel
            </button>
          </div>
        </div>

        {/* TABLA DE HISTORIAL */}
        <div className="flex-1 bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full text-left table-fixed min-w-[900px]">
              
              <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-xs z-10 border-b border-slate-200">
                <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-[18%]">
                    <span className="flex items-center gap-1.5">👤 Responsable</span>
                  </th>
                  <th className="py-3.5 px-4 w-[20%]">
                    <span className="flex items-center gap-1.5">📁 Proyecto / Módulo</span>
                  </th>
                  <th className="py-3.5 px-4 w-[30%]">
                    <span className="flex items-center gap-1.5">📌 Descripción de la Tarea</span>
                  </th>
                  <th className="py-3.5 px-4 w-[10%]">
                    <span className="flex items-center gap-1.5">🚀 Inicio</span>
                  </th>
                  <th className="py-3.5 px-4 w-[10%]">
                    <span className="flex items-center gap-1.5">🏁 Límite</span>
                  </th>
                  <th className="py-3.5 px-4 w-[12%] text-center">
                    <span>Estatus</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No se encontraron actividades registradas con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* RESPONSABLE */}
                      <td className="py-3.5 px-4 font-semibold text-slate-800 truncate">
                        <div className="flex items-center gap-2">
                          <span className="h-6 w-6 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {task.employee !== 'Sin asignar' 
                              ? task.employee.split(' ').map(n => n[0]).slice(0, 2).join('') 
                              : '👤'}
                          </span>
                          <span className="truncate">{task.employee}</span>
                        </div>
                      </td>

                      {/* PROYECTO */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-full">
                          {task.project}
                        </span>
                      </td>

                      {/* DESCRIPCIÓN */}
                      <td className="py-3.5 px-4 break-words pr-4 text-slate-600 font-normal leading-relaxed">
                        {task.task}
                      </td>

                      {/* FECHA INICIO */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 font-medium">
                        {task.startDate}
                      </td>

                      {/* FECHA LÍMITE */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 font-medium">
                        <span className={task.status === 'Postergada' ? 'text-rose-600 font-bold' : ''}>
                          {task.endDate}
                        </span>
                      </td>

                      {/* ESTATUS Y DETALLE DE RETRASO */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 justify-center min-w-[95px] ${
                          task.status === 'Completado'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : task.status === 'Postergada'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-2xs'
                              : task.status === 'En Proceso'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {task.status === 'Completado' && '✓ Completada'}
                          {task.status === 'Postergada' && `⚠️ Postergada ${task.delayedDays ? `(+${task.delayedDays}d)` : ''}`}
                          {task.status === 'En Proceso' && '🔵 En Proceso'}
                          {task.status === 'Pendiente' && '⏳ Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}