'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '../../../components/Sidebar';
import CalendarioRevisiones from '../../../components/calendar/CalendarioRevisiones'; 
import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface HistorialRevision {
  id: string;
  title: string;
  project: string;
  empleado: string;
  fecha: string;
  estado: string;
  notas: string;
}

interface OptionItem {
  id: string;
  nombre: string;
}

export default function RevisionesPage() {
  const [activeTab, setActiveTab] = useState<'calendario' | 'historial'>('calendario');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [historial, setHistorial] = useState<HistorialRevision[]>([]);
  const [loading, setLoading] = useState(true);

  // 📢 ESTADOS PARA EL MODAL DE AGENDAR REUNIÓN GRUPAL
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isSavingMeeting, setIsSavingTask] = useState(false);
  
  const [dbProjects, setDbProjects] = useState<OptionItem[]>([]);
  const [dbEmployees, setDbEmployees] = useState<OptionItem[]>([]);

  const [meetingFormData, setMeetingFormData] = useState({
    titulo: '',
    proyectoId: '', // Vacío por defecto para representar "Todos los Proyectos"
    fechaInicio: '',
    descripcion: '',
    targetType: 'todos', // 'todos' | 'seleccionados'
    selectedEmployeeIds: [] as string[],
  });

  // 🔄 CARGA DE REVISIONES Y REUNIONES DESDE SUPABASE
  const fetchRevisiones = async () => {
    try {
      setLoading(true);

      // 1. Cargar proyectos y empleados para los selectores del modal
      const { data: projData } = await supabase.from('proyectos').select('id, nombre');
      if (projData) setDbProjects(projData);

      const { data: empData } = await supabase.from('empleados').select('id, nombre');
      if (empData) setDbEmployees(empData);

      // 2. Cargar historial de reuniones
      const { data, error } = await supabase
        .from('reuniones')
        .select(`
          id,
          titulo,
          descripcion,
          fecha_inicio,
          estado,
          empleados!reuniones_empleado_id_fkey (nombre),
          proyectos (nombre)
        `)
        .order('fecha_inicio', { ascending: false });

      if (error) throw error;

      if (data) {
        const mapped: HistorialRevision[] = data.map((item: any) => ({
          id: item.id,
          title: item.titulo || 'Sin título',
          project: item.proyectos?.nombre ? `📁 ${item.proyectos.nombre}` : '🌐 Todos los Proyectos',
          empleado: item.empleados?.nombre || 'Todo el equipo (Grupal)',
          fecha: item.fecha_inicio ? item.fecha_inicio.replace('T', ' ').substring(0, 16) : 'Sin fecha',
          estado: item.estado || 'Programada',
          notas: item.descripcion || 'Sin notas registradas.',
        }));
        setHistorial(mapped);
      }
    } catch (err) {
      console.error('Error al cargar historial de reuniones/revisiones:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevisiones();
  }, []);

  // 📅 CREAR REUNIÓN GRUPAL / INDIVIDUAL Y NOTIFICAR A LAS EXTENSIONES
  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingFormData.titulo.trim() || !meetingFormData.fechaInicio) {
      alert('Por favor completa el título y la fecha/hora de la reunión.');
      return;
    }

    try {
      setIsSavingTask(true);

      // Determinar lista de empleados a convocar
      let targetEmployeeIds: string[] = [];
      if (meetingFormData.targetType === 'todos') {
        targetEmployeeIds = dbEmployees.map(e => e.id);
      } else {
        targetEmployeeIds = meetingFormData.selectedEmployeeIds;
      }

      if (targetEmployeeIds.length === 0) {
        alert('Debes seleccionar al menos un integrante para convocar la reunión.');
        setIsSavingTask(false);
        return;
      }

      // Si no seleccionó un proyecto específico, se guarda como NULL (Aplica a Todos los Proyectos)
      const targetProjectId = meetingFormData.proyectoId ? meetingFormData.proyectoId : null;

      // 1. Insertar las reuniones en Supabase para los empleados convocados
      const meetingsToInsert = targetEmployeeIds.map(empId => ({
        titulo: meetingFormData.titulo.trim(),
        descripcion: meetingFormData.descripcion.trim() || 'Reunión de revisión general de proyectos',
        fecha_inicio: meetingFormData.fechaInicio,
        estado: 'Programada',
        empleado_id: empId,
        proyecto_id: targetProjectId,
      }));

      const { error: meetingErr } = await supabase.from('reuniones').insert(meetingsToInsert);
      if (meetingErr) throw meetingErr;

      // 2. Generar Notificaciones en tiempo real para la extensión de cada empleado
      const notificationsToInsert = targetEmployeeIds.map(empId => ({
        empleado_id: empId,
        proyecto_id: targetProjectId,
        titulo_tarea: `📅 Convocatoria a Reunión: ${meetingFormData.titulo.trim()}`,
        estado: 'Pendiente',
      }));

      await supabase.from('notificaciones').insert(notificationsToInsert);

      alert(`✅ Reunión programada y notificación enviada a ${targetEmployeeIds.length} integrante(s).`);

      // Resetear y cerrar modal
      setMeetingFormData({
        titulo: '',
        proyectoId: '',
        fechaInicio: '',
        descripcion: '',
        targetType: 'todos',
        selectedEmployeeIds: [],
      });
      setIsScheduleModalOpen(false);

      await fetchRevisiones();

    } catch (err: any) {
      console.error('Error al agendar la reunión:', err);
      alert(`Error al agendar reunión: ${err.message || 'Error de conexión'}`);
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleToggleEmployeeSelection = (empId: string) => {
    setMeetingFormData(prev => ({
      ...prev,
      selectedEmployeeIds: prev.selectedEmployeeIds.includes(empId)
        ? prev.selectedEmployeeIds.filter(id => id !== empId)
        : [...prev.selectedEmployeeIds, empId]
    }));
  };

  // Filtrado de la tabla del historial
  const filteredHistorial = historial.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.empleado.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.project.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || item.estado === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const renderBadge = (estado: string) => {
    let colorClass = 'bg-blue-50 text-blue-700 border-blue-200';
    
    if (estado === 'Completado' || estado === 'Aprobado') {
      colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (estado === 'Ajuste por tiempo' || estado === 'Pendiente') {
      colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
    } else if (estado === 'Rechazado' || estado === 'Cancelada') {
      colorClass = 'bg-red-50 text-red-700 border-red-200';
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${colorClass}`}>
        {estado}
      </span>
    );
  };

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      
      {/* SIDEBAR */}
      <Sidebar />

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden h-full min-w-0">
        
        {/* ENCABEZADO CON BOTÓN DE CONVOCATORIA MASIVA */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Gestión de Revisiones</h1>
            <p className="text-xs text-slate-500">
              Supervisa reuniones en el calendario y convoca sesiones grupales para todo el equipo
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 📢 BOTÓN AGENDAR REUNIÓN GRUPAL */}
            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>📢</span>
              <span>+ Agendar Reunión Grupal</span>
            </button>

            {/* BOTONES DE PESTAÑA (TABS) */}
            <div className="bg-slate-200/80 p-1 rounded-xl flex items-center gap-1 shadow-2xs">
              <button
                onClick={() => setActiveTab('calendario')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'calendario'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📅 Calendario
              </button>
              <button
                onClick={() => setActiveTab('historial')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'historial'
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📜 Historial ({historial.length})
              </button>
            </div>
          </div>
        </header>

        {/* CONTENIDO PESTAÑA 1: CALENDARIO COMPLETO */}
        {activeTab === 'calendario' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <CalendarioRevisiones />
          </div>
        )}

        {/* CONTENIDO PESTAÑA 2: TABLA DE HISTORIAL */}
        {activeTab === 'historial' && (
          <div className="flex-1 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col min-h-0 overflow-hidden">
            
            {/* BUSCADOR Y FILTROS */}
            <div className="flex flex-col sm:flex-row justify-between gap-3 mb-4 shrink-0">
              <input
                type="text"
                placeholder="🔍 Buscar por título, proyecto o empleado..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full sm:w-72"
              />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
              >
                <option value="all">Todos los estados</option>
                <option value="Programada">Programada</option>
                <option value="Completado">Completado</option>
                <option value="Ajuste por tiempo">Ajuste por tiempo</option>
                <option value="Pendiente">Pendiente</option>
              </select>
            </div>

            {/* TABLA DE REGISTROS */}
            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl min-h-0">
              {loading ? (
                <div className="flex items-center justify-center h-48 text-xs font-bold text-slate-500 gap-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  Cargando reuniones de Supabase...
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold sticky top-0 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Revisión / Proyecto</th>
                      <th className="p-3">Convocados / Empleado</th>
                      <th className="p-3">Fecha y Hora</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredHistorial.map((rev) => (
                      <tr key={rev.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{rev.title}</div>
                          <div className="text-[10px] text-blue-600 font-semibold">{rev.project}</div>
                        </td>
                        <td className="p-3 font-semibold text-slate-800">👤 {rev.empleado}</td>
                        <td className="p-3 font-mono text-[11px]">{rev.fecha}</td>
                        <td className="p-3">
                          {renderBadge(rev.estado)}
                        </td>
                        <td className="p-3 text-slate-500 max-w-xs truncate">{rev.notas}</td>
                      </tr>
                    ))}
                    {filteredHistorial.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-400 font-medium">
                          No se encontraron registros de revisiones.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        )}

      </main>

      {/* 📝 MODAL CONVOCATORIA DE REUNIÓN GRUPAL / INDIVIDUAL */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Agendar Reunión / Revisión</h3>
                <p className="text-[11px] text-slate-500">Convoca a todo el equipo o a integrantes específicos</p>
              </div>
              <button 
                onClick={() => setIsScheduleModalOpen(false)} 
                className="text-slate-400 font-bold cursor-pointer hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMeeting} className="space-y-3.5 text-xs">
              
              {/* Título */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Título de la Reunión
                </label>
                <input 
                  type="text" 
                  required 
                  placeholder="Ej. Sincronización Semanal General de Avances" 
                  value={meetingFormData.titulo} 
                  onChange={(e) => setMeetingFormData({ ...meetingFormData, titulo: e.target.value })} 
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                />
              </div>

              {/* Proyecto (Con opción de Todos los Proyectos por defecto) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Proyecto Asociado
                </label>
                <select 
                  value={meetingFormData.proyectoId} 
                  onChange={(e) => setMeetingFormData({ ...meetingFormData, proyectoId: e.target.value })} 
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">🌐 Todos los Proyectos / General</option>
                  {dbProjects.map((p) => (
                    <option key={p.id} value={p.id}>📁 {p.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Fecha y Hora de Inicio */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Fecha y Hora de Inicio
                </label>
                <input 
                  type="datetime-local" 
                  required 
                  value={meetingFormData.fechaInicio} 
                  onChange={(e) => setMeetingFormData({ ...meetingFormData, fechaInicio: e.target.value })} 
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20" 
                />
              </div>

              {/* Selección de Convocados (Todos o Específicos) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Tipo de Convocatoria
                </label>
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setMeetingFormData({ ...meetingFormData, targetType: 'todos' })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      meetingFormData.targetType === 'todos'
                        ? 'bg-white text-blue-600 shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    👥 Todo el Equipo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeetingFormData({ ...meetingFormData, targetType: 'seleccionados' })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      meetingFormData.targetType === 'seleccionados'
                        ? 'bg-white text-blue-600 shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    👤 Seleccionar
                  </button>
                </div>
              </div>

              {/* Lista de Checkboxes si eligió 'seleccionados' */}
              {meetingFormData.targetType === 'seleccionados' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Selecciona Integrantes ({meetingFormData.selectedEmployeeIds.length})
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-slate-300 rounded-xl p-2 space-y-1 bg-white">
                    {dbEmployees.map((emp) => {
                      const isChecked = meetingFormData.selectedEmployeeIds.includes(emp.id);
                      return (
                        <label 
                          key={emp.id} 
                          className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer text-xs ${
                            isChecked ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            checked={isChecked} 
                            onChange={() => handleToggleEmployeeSelection(emp.id)} 
                            className="rounded text-blue-600" 
                          />
                          <span>👤 {emp.nombre}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Descripción / Notas */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Notas / Orden del Día
                </label>
                <textarea 
                  rows={3} 
                  placeholder="Temas generales a tratar, avance por proyectos, enlace de Google Meet..." 
                  value={meetingFormData.descripcion} 
                  onChange={(e) => setMeetingFormData({ ...meetingFormData, descripcion: e.target.value })} 
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" 
                />
              </div>

              {/* Botones de Acción */}
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsScheduleModalOpen(false)} 
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSavingMeeting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold cursor-pointer transition-colors shadow-xs"
                >
                  {isSavingMeeting ? 'Enviando...' : 'Confirmar & Notificar'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}