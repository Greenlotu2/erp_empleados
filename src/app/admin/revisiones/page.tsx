'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '../../../components/Sidebar';
import CalendarioRevisiones from '../../../components/calendar/CalendarioRevisiones'; 
import { createClient } from '@supabase/supabase-js';

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
  modalidad: 'presencial' | 'virtual';
  link?: string;
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

  // Estados del Modal Único
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);
  const [isGeneratingZoom, setIsGeneratingZoom] = useState(false);
  
  const [dbProjects, setDbProjects] = useState<OptionItem[]>([]);
  const [dbEmployees, setDbEmployees] = useState<OptionItem[]>([]);

  // 🕒 Controla la apertura automática del modal SOLO cuando los datos ya cargaron
  const [dataLoaded, setDataLoaded] = useState(false);
  const [pendingAutoOpen, setPendingAutoOpen] = useState(false);

  const [meetingFormData, setMeetingFormData] = useState({
    titulo: '',
    proyectoId: '',
    fechaInicio: '',
    descripcion: '',
    modalidad: 'presencial' as 'presencial' | 'virtual',
    link: '',
    targetType: 'todos',
    selectedEmployeeIds: [] as string[],
  });

  // Carga inicial de datos desde Supabase
  const fetchRevisiones = async () => {
    try {
      setLoading(true);

      const { data: projData } = await supabase.from('proyectos').select('id, nombre');
      if (projData) setDbProjects(projData);

      const { data: empData } = await supabase.from('empleados').select('id, nombre');
      if (empData) setDbEmployees(empData);

      const { data, error } = await supabase
        .from('reuniones')
        .select(`
          id,
          titulo,
          descripcion,
          fecha_inicio,
          estado,
          link,
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
          empleado: item.empleados?.nombre || '👥 Todo el equipo (Grupal)',
          fecha: item.fecha_inicio ? item.fecha_inicio.replace('T', ' ').substring(0, 16) : 'Sin fecha',
          estado: item.estado || 'Programada',
          notas: item.descripcion || 'Sin notas registradas.',
          modalidad: item.link ? 'virtual' : 'presencial',
          link: item.link || '',
        }));
        setHistorial(mapped);
      }
    } catch (err) {
      console.error('Error cargando historial:', err);
    } finally {
      setLoading(false);
      setDataLoaded(true);
    }
  };

  useEffect(() => {
    fetchRevisiones();
  }, []);

  // 📌 REDIRECCIÓN DESDE NOTIFICACIONES DEL DASHBOARD
  // Lee los query params de inmediato, pero NO abre el modal todavía:
  // solo lo marca como "pendiente" hasta que dbProjects/dbEmployees ya existan.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const agendar = params.get('agendar');

      if (agendar === 'true') {
        const rawTitulo = params.get('titulo') || '';
        const empleadoIdParam = params.get('empleadoId') || '';
        const proyectoIdParam = params.get('proyectoId') || '';

        // Limpiar textos tipo: "🚀 Juancarlos solicitó revisión: Desarrollo UI"
        let cleanTitle = rawTitulo;
        if (cleanTitle.includes(':')) {
          cleanTitle = cleanTitle.split(':').slice(1).join(':').replace(/[""]/g, '').trim();
        }

        setMeetingFormData(prev => ({
          ...prev,
          titulo: cleanTitle ? `Revisión: ${cleanTitle}` : prev.titulo,
          proyectoId: proyectoIdParam || prev.proyectoId,
          targetType: empleadoIdParam ? 'seleccionados' : 'todos',
          selectedEmployeeIds: empleadoIdParam ? [empleadoIdParam] : [],
        }));

        // Ya no abrimos el modal aquí — solo marcamos que hay una apertura pendiente
        setPendingAutoOpen(true);

        // Limpiar los query params para evitar re-aperturas al recargar la página
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // 🚦 Abre el modal SOLO cuando los datos (proyectos/empleados) ya están cargados
  // Esto evita que el modal se abra con los dropdowns vacíos.
  useEffect(() => {
    if (dataLoaded && pendingAutoOpen) {
      setIsScheduleModalOpen(true);
      setPendingAutoOpen(false);
    }
  }, [dataLoaded, pendingAutoOpen]);

  // 🎯 CAMBIAR ESTATUS DIRECTAMENTE DESDE EL HISTORIAL (ACTUALIZA REUNIONES Y TAREAS)
  const handleUpdateStatusInHistorial = async (id: string, nuevoEstado: string) => {
    try {
      setLoading(true);

      // 1. Actualización en la tabla 'reuniones'
      const { data: reunUpdated, error: reunErr } = await supabase
        .from('reuniones')
        .update({ estado: nuevoEstado })
        .eq('id', id)
        .select();

      if (reunErr) throw reunErr;

      // 2. Si se marca como Completada, sincronizar también la tabla 'tareas'
      if (nuevoEstado === 'Completada') {
        const targetRev = historial.find(item => item.id === id);
        const emp = dbEmployees.find(e => targetRev?.empleado?.includes(e.nombre));
        const cleanTitle = (targetRev?.title || '').replace(/^Revisión:\s*/i, '').trim();

        if (emp) {
          // Actualizar 'tareas'
          await supabase
            .from('tareas')
            .update({ estado: 'Completada', porcentaje_avance: 100 })
            .eq('empleado_id', emp.id)
            .ilike('titulo', `%${cleanTitle}%`);

          await supabase
            .from('tareas')
            .update({ estado: 'Completada', porcentaje_avance: 100 })
            .eq('empleado_id', emp.id)
            .eq('estado', 'En Proceso');

          // Liberar disponibilidad
          try {
            const { data: tareasPendientes } = await supabase
              .from('tareas')
              .select('id')
              .eq('empleado_id', emp.id)
              .eq('estado', 'En Proceso');

            if (!tareasPendientes || tareasPendientes.length === 0) {
              await supabase
                .from('empleados')
                .update({ disponibilidad: true })
                .eq('id', emp.id);
            }
          } catch (e) {
            console.warn('Omitiendo actualización de disponibilidad:', e);
          }

          // Notificación
          try {
            await supabase.from('notificaciones').insert([{
              empleado_id: emp.id,
              titulo_tarea: `✅ Revisión Aprobada: ${cleanTitle}`,
              estado: 'Aprobado',
            }] as any);
          } catch (e) {
            console.warn('Omitiendo notificación opcional:', e);
          }
        }
      }

      alert(`✅ Estado cambiado a "${nuevoEstado}" en Supabase.`);
      await fetchRevisiones();

    } catch (err: any) {
      console.error('Error actualizando historial:', err);
      alert(`Error al actualizar: ${err.message || 'Error de conexión'}`);
    } finally {
      setLoading(false);
    }
  };

  // 🗑️ Eliminar Reunión/Revisión
  const handleDeleteMeeting = async (id: string, titulo: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar la sesión "${titulo}"?`)) {
      return;
    }

    try {
      const { error } = await supabase.from('reuniones').delete().eq('id', id);
      if (error) throw error;

      alert('🗑️ Sesión eliminada correctamente.');
      await fetchRevisiones();
    } catch (err: any) {
      console.error('Error al eliminar reunión:', err);
      alert(`Error al eliminar: ${err.message || 'Error de conexión'}`);
    }
  };

  // Generación dinámica de enlace de Zoom vía API Server-to-Server
  const handleGenerateZoomMeeting = async () => {
    if (!meetingFormData.titulo.trim() || !meetingFormData.fechaInicio) {
      alert('Ingresa el título y la fecha/hora de inicio antes de generar el enlace de Zoom.');
      return;
    }

    try {
      setIsGeneratingZoom(true);

      const res = await fetch('/api/zoom/meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: meetingFormData.titulo,
          descripcion: meetingFormData.descripcion,
          fechaInicio: meetingFormData.fechaInicio,
        }),
      });

      const data = await res.json();

      if (data.link) {
        setMeetingFormData(prev => ({ ...prev, link: data.link }));
        alert('✨ Enlace de Zoom generado exitosamente.');
      } else {
        alert(`Error al generar enlace: ${data.error || 'Revisa la configuración de Zoom.'}`);
      }
    } catch (err) {
      console.error('Error al conectar con la API de Zoom:', err);
      alert('Error de conexión al generar la sala de Zoom.');
    } finally {
      setIsGeneratingZoom(false);
    }
  };

  // Guardar reunión o revisión en Supabase
  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingFormData.titulo.trim() || !meetingFormData.fechaInicio) {
      alert('Por favor completa el título y la fecha/hora.');
      return;
    }

    if (meetingFormData.modalidad === 'virtual' && !meetingFormData.link.trim()) {
      alert('Genera o ingresa un enlace de Zoom para la revisión virtual.');
      return;
    }

    try {
      setIsSavingMeeting(true);

      const targetProjectId = meetingFormData.proyectoId ? meetingFormData.proyectoId : null;

      const dtInicio = new Date(meetingFormData.fechaInicio);
      const dtFin = new Date(dtInicio.getTime() + 60 * 60 * 1000);

      const fechaInicioISO = dtInicio.toISOString();
      const fechaFinISO = dtFin.toISOString();
      const fechaTexto = dtInicio.toISOString().split('T')[0];
      const horaTexto = dtInicio.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });

      const esPresencial = meetingFormData.modalidad === 'presencial';
      const notasFormateadas = esPresencial
        ? `🏢 [Reunión Presencial en Oficina Ing. Luis] ${meetingFormData.descripcion.trim()}`
        : meetingFormData.descripcion.trim();

      let meetingsToInsert: any[] = [];

      if (meetingFormData.targetType === 'todos') {
        meetingsToInsert = [{
          titulo: meetingFormData.titulo.trim(),
          descripcion: `👥 [Convocatoria Grupal - Todo el Equipo] ${notasFormateadas || (esPresencial ? 'Reunión presencial en oficina' : 'Revisión virtual de avances')}`,
          fecha_inicio: fechaInicioISO,
          fecha_fin: fechaFinISO,
          fecha: fechaTexto,
          hora: horaTexto,
          link: esPresencial ? null : meetingFormData.link.trim(),
          estado: 'Programada',
          empleado_id: null,
          proyecto_id: targetProjectId,
        }];
      } else {
        meetingsToInsert = meetingFormData.selectedEmployeeIds.map(empId => ({
          titulo: meetingFormData.titulo.trim(),
          descripcion: notasFormateadas || (esPresencial ? 'Reunión presencial en oficina' : 'Revisión virtual de avances'),
          fecha_inicio: fechaInicioISO,
          fecha_fin: fechaFinISO,
          fecha: fechaTexto,
          hora: horaTexto,
          link: esPresencial ? null : meetingFormData.link.trim(),
          estado: 'Programada',
          empleado_id: empId || null,
          proyecto_id: targetProjectId,
        }));
      }

      const { error: meetingErr } = await supabase.from('reuniones').insert(meetingsToInsert as any);
      if (meetingErr) throw meetingErr;

      alert(`✅ ${esPresencial ? 'Reunión Presencial' : 'Revisión Virtual'} agendada con éxito.`);

      setMeetingFormData({
        titulo: '',
        proyectoId: '',
        fechaInicio: '',
        descripcion: '',
        modalidad: 'presencial',
        link: '',
        targetType: 'todos',
        selectedEmployeeIds: [],
      });
      setIsScheduleModalOpen(false);

      await fetchRevisiones();

    } catch (err: any) {
      console.error('Error al guardar:', err);
      alert(`Error al agendar: ${err.message || 'Error de conexión'}`);
    } finally {
      setIsSavingMeeting(false);
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
    if (estado === 'Completada' || estado === 'Completado' || estado === 'Aprobado') {
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
      <Sidebar />

      <main className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden h-full min-w-0">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Gestión de Revisiones y Reuniones</h1>
            <p className="text-xs text-slate-500">
              Coagenda reuniones presenciales en oficina o revisiones virtuales vía Zoom
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>📢</span>
              <span>+ Agendar Sesión</span>
            </button>

            <div className="bg-slate-200/80 p-1 rounded-xl flex items-center gap-1 shadow-2xs ml-1">
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

        {activeTab === 'calendario' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <CalendarioRevisiones />
          </div>
        )}

        {activeTab === 'historial' && (
          <div className="flex-1 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col min-h-0 overflow-hidden">
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
                <option value="Completada">Completada</option>
                <option value="Ajuste por tiempo">Ajuste por tiempo</option>
                <option value="Pendiente">Pendiente</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl min-h-0">
              {loading ? (
                <div className="flex items-center justify-center h-48 text-xs font-bold text-slate-500 gap-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  Cargando historial de sesiones...
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold sticky top-0 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Sesión / Proyecto</th>
                      <th className="p-3">Tipo / Modalidad</th>
                      <th className="p-3">Convocados</th>
                      <th className="p-3">Fecha y Hora</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Notas</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredHistorial.map((rev) => (
                      <tr key={rev.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{rev.title}</div>
                          <div className="text-[10px] text-blue-600 font-semibold">{rev.project}</div>
                        </td>
                        <td className="p-3">
                          {rev.modalidad === 'virtual' ? (
                            rev.link ? (
                              <a href={rev.link} target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1">
                                🎥 Entrar a Zoom
                              </a>
                            ) : (
                              <span className="text-indigo-600 font-semibold">🎥 Revisión Virtual</span>
                            )
                          ) : (
                            <span className="text-slate-700 font-semibold">🏢 Reunión Presencial</span>
                          )}
                        </td>
                        <td className="p-3 font-semibold text-slate-800">👤 {rev.empleado}</td>
                        <td className="p-3 font-mono text-[11px]">{rev.fecha}</td>
                        <td className="p-3">{renderBadge(rev.estado)}</td>
                        <td className="p-3 text-slate-500 max-w-xs truncate">{rev.notas}</td>
                        <td className="p-3 text-center flex items-center justify-center gap-1.5">
                          {rev.estado !== 'Completada' ? (
                            <button
                              onClick={() => handleUpdateStatusInHistorial(rev.id, 'Completada')}
                              title="Marcar como Completada"
                              className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] border border-emerald-200 transition-colors cursor-pointer"
                            >
                              ✅ Completar
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateStatusInHistorial(rev.id, 'Programada')}
                              title="Reabrir reunión"
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] border border-slate-200 transition-colors cursor-pointer"
                            >
                              ↩ Reabrir
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteMeeting(rev.id, rev.title)}
                            title="Eliminar sesión"
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal Único para Agendar */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Agendar Sesión de Trabajo</h3>
                <p className="text-[11px] text-slate-500">Selecciona si la sesión será presencial o una revisión online</p>
              </div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="text-slate-400 font-bold cursor-pointer hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleCreateMeeting} className="space-y-3.5 text-xs">
              
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Tipo de Sesión</label>
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setMeetingFormData({ ...meetingFormData, modalidad: 'presencial' })}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                      meetingFormData.modalidad === 'presencial' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    🏢 Reunión (Presencial)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeetingFormData({ ...meetingFormData, modalidad: 'virtual' })}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                      meetingFormData.modalidad === 'virtual' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    🎥 Revisión (Virtual Zoom)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  {meetingFormData.modalidad === 'presencial' ? 'Título de la Reunión' : 'Título de la Revisión'}
                </label>
                <input 
                  type="text" 
                  required 
                  placeholder={meetingFormData.modalidad === 'presencial' ? "Ej. Reunión de Alineación General" : "Ej. Revisión de Avances del Proyecto"}
                  value={meetingFormData.titulo} 
                  onChange={(e) => setMeetingFormData({ ...meetingFormData, titulo: e.target.value })} 
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20" 
                />
              </div>

              {meetingFormData.modalidad === 'presencial' ? (
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-[11px] text-slate-600 flex items-center gap-2">
                  <span>📍</span>
                  <span>Lugar: <strong>Oficina Ing. Luis</strong></span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase">Enlace de Zoom</label>
                    <button
                      type="button"
                      onClick={handleGenerateZoomMeeting}
                      disabled={isGeneratingZoom}
                      className="text-[10px] text-blue-600 font-bold hover:underline bg-blue-50 px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                    >
                      {isGeneratingZoom ? 'Generando...' : '✨ Generar Enlace Zoom'}
                    </button>
                  </div>
                  <input 
                    type="url" 
                    required
                    placeholder="https://us05web.zoom.us/j/123456789..." 
                    value={meetingFormData.link} 
                    onChange={(e) => setMeetingFormData({ ...meetingFormData, link: e.target.value })} 
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20" 
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Proyecto Asociado</label>
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

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Fecha y Hora de Inicio</label>
                <input 
                  type="datetime-local" 
                  required 
                  value={meetingFormData.fechaInicio} 
                  onChange={(e) => setMeetingFormData({ ...meetingFormData, fechaInicio: e.target.value })} 
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Convocados</label>
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setMeetingFormData({ ...meetingFormData, targetType: 'todos' })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      meetingFormData.targetType === 'todos' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    👥 Todo el Equipo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeetingFormData({ ...meetingFormData, targetType: 'seleccionados' })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      meetingFormData.targetType === 'seleccionados' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    👤 Seleccionar
                  </button>
                </div>
              </div>

              {meetingFormData.targetType === 'seleccionados' && (
                <div className="max-h-32 overflow-y-auto border border-slate-300 rounded-xl p-2 space-y-1 bg-white">
                  {dbEmployees.map((emp) => {
                    const isChecked = meetingFormData.selectedEmployeeIds.includes(emp.id);
                    return (
                      <label key={emp.id} className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer text-xs ${isChecked ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-50 text-slate-800'}`}>
                        <input type="checkbox" checked={isChecked} onChange={() => handleToggleEmployeeSelection(emp.id)} className="rounded text-blue-600" />
                        <span>👤 {emp.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Notas / Orden del Día</label>
                <textarea 
                  rows={2} 
                  placeholder="Puntos clave de la sesión..." 
                  value={meetingFormData.descripcion} 
                  onChange={(e) => setMeetingFormData({ ...meetingFormData, descripcion: e.target.value })} 
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" 
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsScheduleModalOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-semibold cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" disabled={isSavingMeeting} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold cursor-pointer transition-colors shadow-xs">
                  {isSavingMeeting ? 'Guardando...' : 'Confirmar & Notificar'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}