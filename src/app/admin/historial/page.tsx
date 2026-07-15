'use client';

import React, { useState, useMemo } from 'react';

// Datos simulados de tareas históricas (Sin el campo de duración)
const TASKS_HISTORY = [
  { id: '1', employee: 'Carlos Pérez', task: 'Mantenimiento preventivo de servidores locales y optimización de respaldos', date: '2026-07-08', status: 'Completado' },
  { id: '2', employee: 'Ana Gómez', task: 'Wireframes detallados del flujo móvil para el nuevo módulo de visualización', date: '2026-07-09', status: 'Completado' },
  { id: '3', employee: 'Sofía Díaz', task: 'Optimización de queries SQL complejas y reindexación de la base de datos', date: '2026-07-09', status: 'Completado' },
  { id: '4', employee: 'Carlos Pérez', task: 'Actualización de las reglas del firewall y cierre de puertos inseguros', date: '2026-07-07', status: 'Completado' },
  { id: '5', employee: 'Ana Gómez', task: 'Diseño de la paleta de iconos vectoriales para el menú de administración', date: '2026-07-06', status: 'Completado' },
];

const EMPLOYEES = [
  { id: 'all', name: 'Todos los Empleados' },
  { id: 'Carlos Pérez', name: 'Carlos Pérez' },
  { id: 'Ana Gómez', name: 'Ana Gómez' },
  { id: 'Sofía Díaz', name: 'Sofía Díaz' },
];

export default function HistorialPage() {
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [lastUpdate] = useState('13:05:12'); 

  const filteredHistory = useMemo(() => {
    if (selectedEmployee === 'all') return TASKS_HISTORY;
    return TASKS_HISTORY.filter(task => task.employee === selectedEmployee);
  }, [selectedEmployee]);

  const exportToPDF = () => {
    alert(`Generando reporte en formato PDF para: ${selectedEmployee === 'all' ? 'Todos los empleados' : selectedEmployee}`);
  };

  const exportToExcel = () => {
    alert(`Exportando registros a Excel (.xlsx) para: ${selectedEmployee === 'all' ? 'Todos los empleados' : selectedEmployee}`);
  };

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      
      {/* SIDEBAR FIJO */}
      <aside className="w-60 bg-slate-900 text-slate-300 flex flex-col shrink-0 hidden md:flex">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <span className="text-xl">💼</span>
          <span className="font-bold text-white text-base tracking-tight">CRM Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <a href="/admin/dashboard" className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-xl text-sm font-medium transition-all">
            📊 Panel Principal
          </a>
          <a href="/admin/empleados" className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-xl text-sm font-medium transition-all">
            👥 Empleados
          </a>
          <a href="/admin/historial" className="flex items-center gap-3 px-3 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium transition-all">
            📝 Historial Tareas
          </a>
        </nav>
        <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500 text-center">
          v1.0.0 - Modo Fijo
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col p-5 overflow-hidden h-full min-w-0">
        
        {/* Encabezado */}
        <header className="flex justify-between items-center mb-4 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Historial de Tareas</h1>
            <p className="text-xs text-slate-500">Consulta el registro histórico de actividades</p>
          </div>
          
          {/* FILTRO POR EMPLEADO */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Filtrar:</span>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold py-2 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              {EMPLOYEES.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        </header>

        {/* BARRA DE UTILIDADES (CON BOTONES PDF Y EXCEL) */}
        <div className="bg-white border border-slate-100 rounded-xl p-3 mb-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
          {/* Última Actualización */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <p>Última sincronización: <span className="font-mono font-semibold text-slate-700">{lastUpdate}</span></p>
          </div>

          {/* Botones de Exportación */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={exportToPDF}
              className="flex-1 sm:flex-initial bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              📄 Exportar PDF
            </button>
            <button
              onClick={exportToExcel}
              className="flex-1 sm:flex-initial bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              📊 Exportar Excel
            </button>
          </div>
        </div>

        {/* TABLA DE HISTORIAL LIMPIA (SÓLO EMPLEADO, ACTIVIDAD, FECHA Y ESTADO) */}
        <div className="flex-1 bg-white border border-slate-100 rounded-xl shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full text-left table-fixed min-w-[700px]">
              <thead className="sticky top-0 bg-white z-10 border-b border-slate-100 shadow-[0_1px_0_0_rgba(241,245,249,1)]">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 w-[25%]">Empleado</th>
                  <th className="py-3 px-4 w-[50%]">Actividad</th>
                  <th className="py-3 px-4 w-[13%]">Fecha</th>
                  <th className="py-3 px-4 w-[12%] text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredHistory.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-800">{task.employee}</td>
                    <td className="py-3 px-4 break-words pr-6 text-slate-600 font-normal">{task.task}</td>
                    <td className="py-3 px-4 text-slate-500">{task.date}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-bold border border-emerald-100">
                        {task.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}