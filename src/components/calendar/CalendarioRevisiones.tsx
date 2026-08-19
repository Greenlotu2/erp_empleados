'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { EventClickArg, EventChangeArg } from '@fullcalendar/core';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface MeetingEvent {
  id: string;
  title: string;
  proyecto_id: string;
  proyecto_nombre?: string;
  empleado_id?: string;
  empleado_nombre?: string;
  descripcion?: string;
  estado?: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
}

interface ProyectoSelect {
  id: string;
  nombre: string;
}

interface EmpleadoSelect {
  id: string;
  nombre: string;
  color?: string;
  rol?: string;
}

export default function CalendarioRevisiones({ refreshTrigger }: { refreshTrigger?: number }) {
  const calendarRef = useRef<FullCalendar | null>(null);

  const [eventsList, setEventsList] = useState<MeetingEvent[]>([]);
  const [proyectosList, setProyectosList] = useState<ProyectoSelect[]>([]);
  const [empleadosList, setEmpleadosList] = useState<EmpleadoSelect[]>([]);
  
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('all');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all'); 
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  // Estado del Popover flotante
  const [popoverState, setPopoverState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    event: MeetingEvent | null;
  }>({ visible: false, x: 0, y: 0, event: null });

  const [selectedEventDetails, setSelectedEventDetails] = useState<MeetingEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({
    titulo: '',
    proyecto_id: '',
    empleado_id: '',
    fecha: '',
    hora_inicio: '',
    duracion_minutos: '30',
    descripcion: '',
  });

  const fetchCalendarData = async () => {
    try {
      setFetchingData(true);

      const { data: projData } = await supabase.from('proyectos').select('id, nombre');
      if (projData) setProyectosList(projData);

      const { data: empData } = await supabase.from('empleados').select('id, nombre, color, rol');
      if (empData) setEmpleadosList(empData);

      const { data: reunionesData, error: reunionesErr } = await supabase
        .from('reuniones')
        .select(`
          id,
          titulo,
          descripcion,
          fecha_inicio,
          fecha_fin,
          estado,
          empleado_id,
          proyecto_id,
          empleados!reuniones_empleado_id_fkey (nombre, color),
          proyectos (nombre)
        `);

      if (reunionesErr) throw reunionesErr;

      if (reunionesData) {
        const mappedEvents: MeetingEvent[] = reunionesData.map((r: any) => {
          const startDate = r.fecha_inicio || new Date().toISOString();
          const endDate = r.fecha_fin || new Date(new Date(startDate).getTime() + 30 * 60000).toISOString();

          const esGrupal = r.descripcion?.includes('[Convocatoria Grupal') || r.empleado_id === null;
          const nombreIntegrante = esGrupal ? 'Todo el equipo' : (r.empleados?.nombre || 'Todo el equipo');

          const customColor = r.empleados?.color || '#0ea5e9';
          const bgFinal = r.estado === 'Completada' ? '#059669' : customColor;

          return {
            id: r.id,
            title: r.titulo || 'Revisión sin título',
            proyecto_id: r.proyecto_id,
            proyecto_nombre: r.proyectos?.nombre || 'General',
            empleado_id: r.empleado_id,
            empleado_nombre: nombreIntegrante,
            descripcion: r.descripcion || '',
            estado: r.estado || 'Programada',
            start: startDate,
            end: endDate,
            backgroundColor: bgFinal,
            borderColor: bgFinal,
          };
        });

        setEventsList(mappedEvents);
      }
    } catch (err) {
      console.error('Error al cargar datos del calendario:', err);
    } finally {
      setFetchingData(false);
    }
  };

  useEffect(() => {
    fetchCalendarData();
  }, [refreshTrigger]);

  const soloEmpleadosList = useMemo(() => {
    return empleadosList.filter(emp => {
      const rolLower = (emp as any).rol?.toLowerCase() || '';
      return !rolLower.includes('admin');
    });
  }, [empleadosList]);

  const filteredEvents = useMemo(() => {
    return eventsList.filter(ev => {
      const matchProj = selectedProjectFilter === 'all' || ev.proyecto_id === selectedProjectFilter;
      const matchEmp = selectedEmployeeFilter === 'all' || ev.empleado_id === selectedEmployeeFilter;
      return matchProj && matchEmp;
    });
  }, [eventsList, selectedProjectFilter, selectedEmployeeFilter]);

  const handleEventClick = (clickInfo: EventClickArg) => {
    clickInfo.jsEvent.preventDefault();
    clickInfo.jsEvent.stopPropagation();

    const rect = clickInfo.el.getBoundingClientRect();
    const foundEvent = eventsList.find(e => e.id === clickInfo.event.id);

    if (foundEvent) {
      setPopoverState({
        visible: true,
        x: rect.right + 8,
        y: rect.top - 12,
        event: foundEvent,
      });
    }
  };

  const handleEventChange = async (changeInfo: EventChangeArg) => {
    const fcEvent = changeInfo.event;
    const newStart = fcEvent.start ? fcEvent.start.toISOString() : null;
    const newEnd = fcEvent.end 
      ? fcEvent.end.toISOString() 
      : (fcEvent.start ? new Date(fcEvent.start.getTime() + 30 * 60000).toISOString() : null);

    if (!newStart || !newEnd) return;

    try {
      const { error } = await supabase
        .from('reuniones')
        .update({
          fecha_inicio: newStart,
          fecha_fin: newEnd,
          estado: 'Ajuste por tiempo'
        })
        .eq('id', fcEvent.id);

      if (error) {
        changeInfo.revert();
        throw error;
      }

      await fetchCalendarData();
    } catch (err: any) {
      console.error('Error moviendo reunión:', err);
      alert('No se pudo mover la reunión: ' + (err.message || 'Error'));
    }
  };

  const handleStartEdit = () => {
    if (!selectedEventDetails) return;

    const startDate = new Date(selectedEventDetails.start);
    const endDate = new Date(selectedEventDetails.end);
    const durationMin = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

    const yyyy = startDate.getFullYear();
    const mm = String(startDate.getMonth() + 1).padStart(2, '0');
    const dd = String(startDate.getDate()).padStart(2, '0');
    const hh = String(startDate.getHours()).padStart(2, '0');
    const min = String(startDate.getMinutes()).padStart(2, '0');

    setEditFormData({
      titulo: selectedEventDetails.title,
      proyecto_id: selectedEventDetails.proyecto_id || (proyectosList[0]?.id || ''),
      empleado_id: selectedEventDetails.empleado_id || (soloEmpleadosList[0]?.id || ''),
      fecha: `${yyyy}-${mm}-${dd}`,
      hora_inicio: `${hh}:${min}`,
      duracion_minutos: String(durationMin > 0 ? durationMin : 30),
      descripcion: selectedEventDetails.descripcion || '',
    });

    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventDetails) return;

    try {
      setLoading(true);
      const startDateTime = new Date(`${editFormData.fecha}T${editFormData.hora_inicio}:00`);
      const endDateTime = new Date(startDateTime.getTime() + parseInt(editFormData.duracion_minutos) * 60000);

      const { error } = await supabase
        .from('reuniones')
        .update({
          titulo: editFormData.titulo.trim(),
          proyecto_id: editFormData.proyecto_id,
          empleado_id: editFormData.empleado_id,
          descripcion: editFormData.descripcion.trim() || null,
          fecha_inicio: startDateTime.toISOString(),
          fecha_fin: endDateTime.toISOString(),
          estado: 'Ajuste por tiempo',
        })
        .eq('id', selectedEventDetails.id);

      if (error) throw error;

      setSelectedEventDetails(null);
      setIsEditing(false);
      await fetchCalendarData();
    } catch (err: any) {
      alert('Error al guardar cambios: ' + (err.message || 'Error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta reunión?')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('reuniones').delete().eq('id', id);
      if (error) throw error;
      setPopoverState({ visible: false, x: 0, y: 0, event: null });
      setSelectedEventDetails(null);
      await fetchCalendarData();
    } catch (err: any) {
      alert('Error al eliminar: ' + (err.message || 'Error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main 
      onClick={() => setPopoverState(prev => ({ ...prev, visible: false }))}
      className="flex-1 flex flex-col p-3 overflow-hidden h-full w-full min-w-0 select-none bg-[#f8fafc] relative gap-2"
    >
      {/* BARRA SUPERIOR DE ACCIONES Y FILTROS */}
      <header className="flex flex-wrap justify-between items-center gap-2 shrink-0 bg-white border border-slate-200 rounded-lg p-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800 tracking-tight">
            📅 Calendario de Revisiones
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedEmployeeFilter}
            onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-xs font-medium py-1 px-2.5 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
          >
            <option value="all">👥 Todo el equipo ({soloEmpleadosList.length})</option>
            {soloEmpleadosList.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.nombre}</option>
            ))}
          </select>

          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-xs font-medium py-1 px-2.5 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
          >
            <option value="all">📁 Todos los proyectos</option>
            {proyectosList.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
      </header>

      {/* CONTENEDOR DEL CALENDARIO */}
      <div className="flex-1 bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden relative p-2.5
        [&_.fc-theme-standard_td]:!border-slate-100
        [&_.fc-theme-standard_th]:!border-slate-100
        [&_.fc-theme-standard_.fc-scrollgrid]:!border-slate-200
        [&_.fc-col-header-cell]:!bg-white [&_.fc-col-header-cell]:!py-1.5
        [&_.fc-col-header-cell-cushion]:!text-slate-700 [&_.fc-col-header-cell-cushion]:!text-[11px] [&_.fc-col-header-cell-cushion]:!font-semibold
        [&_.fc-timegrid-slot-label-cushion]:!text-slate-500 [&_.fc-timegrid-slot-label-cushion]:!text-[10px] [&_.fc-timegrid-slot-label-cushion]:!font-normal
        [&_.fc-timegrid-slot]:!h-9 [&_.fc-timegrid-slot-minor]:!border-none
        [&_.fc-toolbar-title]:!text-xs [&_.fc-toolbar-title]:!font-bold [&_.fc-toolbar-title]:!text-slate-800
        [&_.fc-button-primary]:!bg-white [&_.fc-button-primary]:!text-slate-700 [&_.fc-button-primary]:!border-slate-200 [&_.fc-button-primary]:!text-[10px] [&_.fc-button-primary]:!font-semibold [&_.fc-button-primary]:!py-1 [&_.fc-button-primary]:!px-2.5 [&_.fc-button-primary]:hover:!bg-slate-50
        [&_.fc-button-active]:!bg-slate-900 [&_.fc-button-active]:!text-white [&_.fc-button-active]:!border-slate-900
        [&_.fc-daygrid-dot-event_.fc-event-title]:!text-slate-800
        [&_.fc-daygrid-day-number]:!text-slate-700 [&_.fc-daygrid-day-number]:!text-[10px]
        [&_.fc-timegrid-event-harness]:!inset-y-0
        [&_.fc-event]:!bg-transparent [&_.fc-event]:!border-none [&_.fc-event]:!shadow-none [&_.fc-event]:!p-0"
      >
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          locale="es"
          editable={true}
          eventDurationEditable={false}
          allDaySlot={false}
          hiddenDays={[0]}
          slotMinTime="09:00:00"
          slotMaxTime="18:00:00"
          slotDuration="01:00:00"
          slotLabelInterval="01:00:00"
          slotLabelFormat={{
            hour: 'numeric',
            minute: '2-digit',
            omitZeroMinute: false,
            meridiem: false,
            hour12: false
          }}
          dayHeaderFormat={{
            weekday: 'long',
            day: 'numeric',
            omitCommas: true
          }}
          events={filteredEvents}
          eventClick={handleEventClick}
          eventChange={handleEventChange}
          eventContent={(eventInfo) => {
            const isCompleted = eventInfo.event.extendedProps.estado === 'Completada';
            const isMonthView = eventInfo.view.type === 'dayGridMonth';
            const badgeColor = isCompleted ? '#059669' : '#0284c7';

            if (isMonthView) {
              return (
                <div 
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-2xs truncate cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: badgeColor }}
                >
                  <span>●</span>
                  <span className="truncate">{eventInfo.event.title}</span>
                </div>
              );
            }

            return (
              <div className="flex items-center justify-center h-full w-full">
                <div 
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-xs hover:scale-115 transition-transform cursor-pointer"
                  style={{ backgroundColor: badgeColor }}
                  title={eventInfo.event.title}
                >
                  1
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* POPOVER / TOOLTIP FLOTANTE */}
      {popoverState.visible && popoverState.event && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 bg-white border border-slate-200/90 rounded-xl shadow-xl w-80 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: `${Math.min(popoverState.y, window.innerHeight - 220)}px`,
            left: `${Math.min(popoverState.x, window.innerWidth - 340)}px`
          }}
        >
          <div className="absolute -left-2 top-4 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-white drop-shadow-xs"></div>

          <div className="text-center py-2 px-3 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
            <span className="text-xs font-bold text-sky-500">
              Reunión / Llamada: 1
            </span>
          </div>

          <div className="p-3 space-y-2">
            <div className="flex items-start gap-2 bg-slate-50/80 p-2 rounded-lg border border-slate-100">
              <span className="bg-sky-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                {new Date(popoverState.event.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-800 line-clamp-2">
                  {popoverState.event.title}
                </span>
                <span className="block text-[10px] text-slate-500 truncate mt-0.5">
                  👤 {popoverState.event.empleado_nombre} • 📁 {popoverState.event.proyecto_nombre}
                </span>
              </div>
            </div>

            {popoverState.event.descripcion && (
              <p className="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-100 line-clamp-2">
                {popoverState.event.descripcion}
              </p>
            )}

            <div className="flex justify-end gap-1.5 pt-1 border-t border-slate-100">
              <button
                onClick={() => {
                  setSelectedEventDetails(popoverState.event);
                  setPopoverState(prev => ({ ...prev, visible: false }));
                  setIsEditing(false);
                }}
                className="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 text-[10px] font-bold rounded cursor-pointer transition-colors"
              >
                Ver Detalles / Editar
              </button>
              <button
                onClick={() => handleDeleteMeeting(popoverState.event!.id)}
                className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold rounded cursor-pointer transition-colors"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLES / EDICIÓN COMPLETA */}
      {selectedEventDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <span className="text-xs font-bold text-slate-700">
                {isEditing ? '✏️ Editar Reunión' : 'Detalles de la Revisión'}
              </span>
              <button onClick={() => setSelectedEventDetails(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer">✕</button>
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="p-4 space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Título</label>
                  <input
                    type="text"
                    required
                    value={editFormData.titulo}
                    onChange={(e) => setEditFormData({ ...editFormData, titulo: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-bold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Proyecto</label>
                    <select
                      value={editFormData.proyecto_id}
                      onChange={(e) => setEditFormData({ ...editFormData, proyecto_id: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                    >
                      {proyectosList.map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Empleado</label>
                    <select
                      value={editFormData.empleado_id}
                      onChange={(e) => setEditFormData({ ...editFormData, empleado_id: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                    >
                      {soloEmpleadosList.map(e => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={editFormData.fecha}
                      onChange={(e) => setEditFormData({ ...editFormData, fecha: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Hora</label>
                    <input
                      type="time"
                      value={editFormData.hora_inicio}
                      onChange={(e) => setEditFormData({ ...editFormData, hora_inicio: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Duración</label>
                    <select
                      value={editFormData.duracion_minutos}
                      onChange={(e) => setEditFormData({ ...editFormData, duracion_minutos: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                    >
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="45">45 min</option>
                      <option value="60">1 hora</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1 border rounded text-xs cursor-pointer">Cancelar</button>
                  <button type="submit" disabled={loading} className="px-3 py-1 bg-sky-600 text-white font-bold rounded text-xs cursor-pointer">Guardar</button>
                </div>
              </form>
            ) : (
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selectedEventDetails.title}</h3>
                  <span className="text-[10px] text-slate-500">
                    ⏱️ {new Date(selectedEventDetails.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedEventDetails.end).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="bg-slate-50 p-2.5 rounded text-xs space-y-1">
                  <p>📁 <strong>Proyecto:</strong> {selectedEventDetails.proyecto_nombre}</p>
                  <p>👤 <strong>Integrante:</strong> {selectedEventDetails.empleado_nombre}</p>
                  {selectedEventDetails.descripcion && <p className="pt-1 text-slate-600">📝 {selectedEventDetails.descripcion}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button onClick={handleStartEdit} className="px-3 py-1 bg-amber-500 text-white rounded text-xs font-bold cursor-pointer">Editar</button>
                  <button onClick={() => setSelectedEventDetails(null)} className="px-3 py-1 bg-slate-100 text-slate-700 rounded text-xs font-bold cursor-pointer">Cerrar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}