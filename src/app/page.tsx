  'use client';

  import React, { useState } from 'react';
  import WeeklyChart from '../components/charts/WeeklyChart';

  const INITIAL_EMPLOYEES_TRACKING = [
    { id: '1', name: 'Carlos Pérez', role: 'Developer', task: 'Mantenimiento preventivo y optimización de servidores locales', status: 'Ocupado', avatar: '👨‍💻', priority: 'Alta' },
    { id: '2', name: 'Ana Gómez', role: 'Diseñadora UX', task: 'Wireframes detallados del flujo móvil para el módulo de empleados', status: 'Ocupado', avatar: '👩‍🎨', priority: 'Media' },
    { id: '3', name: 'Luis Martínez', role: 'QA Tester', task: 'Ninguna - Esperando asignación de actividades', status: 'Disponible', avatar: '👨‍🔧', priority: 'Baja' },
    { id: '4', name: 'Sofía Díaz', role: 'Backend Dev', task: 'Optimización de queries SQL complejas y reducción de tiempos de carga', status: 'Ocupado', avatar: '👩‍💻', priority: 'Media' },
  ];

  export default function AdminDashboard() {
    const [employees, setEmployees] = useState(INITIAL_EMPLOYEES_TRACKING);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [taskPriority, setTaskPriority] = useState('Media');

    const totalEmployees = employees.length;
    const activeNow = employees.filter(e => e.status === 'Ocupado').length;
    const available = employees.filter(e => e.status === 'Disponible').length;

    const handleAssignTask = (e: React.FormEvent) => {
      e.preventDefault();
      if (!taskTitle.trim() || !selectedEmployeeId) return;

      const updatedEmployees = employees.map(emp => {
        if (emp.id === selectedEmployeeId) {
          return { ...emp, task: taskTitle, status: 'Ocupado', priority: taskPriority };
        }
        return emp;
      });

      setEmployees(updatedEmployees);
      setTaskTitle('');
      setSelectedEmployeeId('');
      setTaskPriority('Media');
      setIsModalOpen(false);
    };

    return (
      // h-screen y overflow-hidden congelan la página para eliminar el scroll general
      <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
        
        {/* 1. BARRA LATERAL (SIDEBAR) */}
        <aside className="w-60 bg-slate-900 text-slate-300 flex flex-col shrink-0 hidden md:flex">
          <div className="p-5 border-b border-slate-800 flex items-center gap-3">
            <span className="text-xl">💼</span>
            <span className="font-bold text-white text-base tracking-tight">CRM Admin</span>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            <a href="#" className="flex items-center gap-3 px-3 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium transition-all">
              📊 Panel Principal
            </a>
            <a href="/admin/empleados/" className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-xl text-sm font-medium transition-all">
              👥 Empleados
            </a>
            <a href="/admin/historial" className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-xl text-sm font-medium transition-all">
              📝 Historial Tareas
            </a>
          </nav>
          <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500 text-center">
            v1.0.0 - Modo Fijo
          </div>
        </aside>

        {/* 2. CONTENIDO PRINCIPAL - DISTRIBUCIÓN VERTICAL COMPACTA */}
        <main className="flex-1 flex flex-col p-5 overflow-hidden h-full min-w-0">
          
          {/* Encabezado Compacto */}
          <header className="flex justify-between items-center mb-4 shrink-0 pb-2">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Panel de Control</h1>
              <p className="text-xs text-slate-500">Monitoreo en tiempo real sin scroll</p>
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-all active:scale-[0.98]"
            >
              + Asignar Tarea
            </button>
          </header>

          {/* MTRICAS EN FORMATO MINI */}
          <div className="grid grid-cols-3 gap-4 mb-4 shrink-0">
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Equipo</p>
                <h3 className="text-lg font-bold text-slate-800 mt-0.5">{totalEmployees} Miembros</h3>
              </div>
              <span className="text-xl bg-slate-50 p-2 rounded-lg">👥</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ocupados</p>
                <h3 className="text-lg font-bold text-red-500 mt-0.5">{activeNow} Asignados</h3>
              </div>
              <span className="text-xl bg-red-50 p-2 rounded-lg">⚡</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Libres</p>
                <h3 className="text-lg font-bold text-emerald-600 mt-0.5">{available} Disponibles</h3>
              </div>
              <span className="text-xl bg-emerald-50 p-2 rounded-lg">⏳</span>
            </div>
          </div>

          {/* SECCIÓN INTERMEDIA: GRÁFICA Y TABLA COMPARTEN EL ESPACIO DISPONIBLE */}
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            
            {/* Gráfica Ajustada en Altura */}
            <div className="h-[200px] shrink-0">
              <WeeklyChart />
            </div>

            {/* TABLA MODULAR: El contenedor padre se estira, pero la tabla interna es la que scrollea */}
            <div className="flex-1 bg-white border border-slate-100 rounded-xl shadow-sm flex flex-col min-h-0 overflow-hidden mt-30">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Estatus de Actividad</h3>
                <span className="text-[10px] bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">En Vivo</span>
              </div>

              {/* Este div maneja el único scroll permitido en la app por si crecen los empleados */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <table className="w-full text-left table-fixed min-w-[700px]">
                  <thead className="sticky top-0 bg-white z-10 border-b border-slate-100 shadow-[0_1px_0_0_rgba(241,245,249,1)]">
                    <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4 w-[25%]">Empleado</th>
                      <th className="py-3 px-4 w-[50%]">Actividad Actual</th>
                      <th className="py-3 px-4 w-[13%] text-center">Estado</th>
                      <th className="py-3 px-4 w-[12%] text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 px-4 flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-base shrink-0 shadow-inner">
                            {emp.avatar}
                          </div>
                          <div className="truncate">
                            <p className="font-semibold text-slate-800 truncate">{emp.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{emp.role}</p>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 truncate pr-6 font-normal">
                          {emp.task}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            emp.status === 'Disponible' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                              : 'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            <span className={`h-1 w-1 rounded-full ${emp.status === 'Disponible' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                            {emp.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1 px-2 rounded-md transition-colors">
                            🔎 Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </main>

        {/* 3. VENTANA MODAL (Mismo Formulario) */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-sm rounded-xl shadow-xl border border-slate-100 p-5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900">Asignar Nueva Actividad</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 text-base">✕</button>
              </div>
              <form onSubmit={handleAssignTask} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Descripción</label>
                  <input
                    type="text" required placeholder="Ej. Revisión de logs de errores" value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Responsable</label>
                  <select
                    required value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
                  >
                    <option value="" disabled>-- Selecciona --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.avatar} {emp.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Prioridad</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Baja', 'Media', 'Alta'].map((prio) => (
                      <button
                        key={prio} type="button" onClick={() => setTaskPriority(prio)}
                        className={`py-1.5 px-2 text-[10px] font-semibold rounded-lg border text-center transition-all ${
                          taskPriority === prio ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        {prio}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-slate-100 mt-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg text-xs font-semibold">Cancelar</button>
                  <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-bold">Asignar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }