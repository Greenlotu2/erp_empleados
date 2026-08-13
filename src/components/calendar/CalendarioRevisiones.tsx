'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { EventClickArg, EventChangeArg } from '@fullcalendar/core';
import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase
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
  role?: string;
}

export default function CalendarioRevisiones() {
  const calendarRef = useRef<FullCalendar | null>(null);

  const [eventsList, setEventsList] = useState<MeetingEvent[]>([]);
  const [proyectosList, setProyectosList] = useState<ProyectoSelect[]>([]);
  const [empleadosList, setEmpleadosList] = useState<EmpleadoSelect[]>([]);
  
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('all');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all'); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

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

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [selectedFormattedDate, setSelectedFormattedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const [formData, setFormData] = useState({
    titulo: '',
    proyecto_id: '',
    descripcion: '',
    fecha: new Date().toISOString().split('T')[0],
    hora_inicio: '10:00',
    duracion_minutos: '30',
    empleado_id: '',
  });

  // 🔄 CARGA DE DATOS DESDE SUPABASE (INCLUYENDO COLOR Y ROL)
  const fetchCalendarData = async () => {
    try {
      setFetchingData(true);

      const { data: projData } = await supabase.from('proyectos').select('id, nombre');
      if (projData) setProyectosList(projData);

      // Traemos el campo 'color' y 'rol' directamente de la tabla empleados
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

          const customColor = r.empleados?.color || '#2563eb';
          const bgFinal = r.estado === 'Completada' ? '#059669' : customColor;

          return {
            id: r.id,
            title: r.titulo || 'Reunión sin título',
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
  }, []);

  // 🧹 Filtrar para excluir administradores (dejar solo empleados/practicantes)
  const soloEmpleadosList = useMemo(() => {
    return empleadosList.filter(emp => {
      const rolLower = (emp as any).rol?.toLowerCase() || '';
      return !rolLower.includes('admin');
    });
  }, [empleadosList]);

  // 🎯 ACTUALIZACIÓN DE ESTATUS EN REUNIONES + TABLA TAREAS (PARA LA EXTENSIÓN)
  const handleUpdateStatus = async (id: string, nuevoEstado: string) => {
    try {
      setLoading(true);

      const { error: reunErr } = await supabase
        .from('reuniones')
        .update({ estado: nuevoEstado })
        .eq('id', id);

      if (reunErr) throw reunErr;

      const targetMeeting = eventsList.find(e => e.id === id);
      const targetEmpId = targetMeeting?.empleado_id;
      const meetingTitle = targetMeeting?.title || '';

      if (nuevoEstado === 'Completada') {
        const cleanTaskTitle = meetingTitle.replace(/^Revisión:\s*/i, '').trim();

        if (targetEmpId) {
          await supabase
            .from('tareas')
            .update({ estado: 'Completada', porcentaje_avance: 100 })
            .eq('empleado_id', targetEmpId)
            .ilike('titulo', `%${cleanTaskTitle}%`);

          await supabase
            .from('tareas')
            .update({ estado: 'Completada', porcentaje_avance: 100 })
            .eq('empleado_id', targetEmpId)
            .eq('estado', 'En Proceso');

          try {
            const { data: tareasRestantes } = await supabase
              .from('tareas')
              .select('id')
              .eq('empleado_id', targetEmpId)
              .eq('estado', 'En Proceso');

            if (!tareasRestantes || tareasRestantes.length === 0) {
              await supabase
                .from('empleados')
                .update({ disponibilidad: true })
                .eq('id', targetEmpId);
            }
          } catch (e) {
            console.warn('Omitiendo actualización de disponibilidad:', e);
          }

          try {
            await supabase.from('notificaciones').insert([{
              empleado_id: targetEmpId,
              proyecto_id: targetMeeting?.proyecto_id || null,
              titulo_tarea: `✅ Tarea y Revisión Completadas: ${cleanTaskTitle}`,
              estado: 'Aprobado',
            }] as any);
          } catch (e) {
            console.warn('Omitiendo notificación opcional:', e);
          }
        }
      }

      if (selectedEventDetails && selectedEventDetails.id === id) {
        setSelectedEventDetails(prev => prev ? { ...prev, estado: nuevoEstado } : null);
      }

      alert(`✅ Estado cambiado a "${nuevoEstado}" con éxito.`);
      await fetchCalendarData();

    } catch (err: any) {
      console.error('❌ Error en handleUpdateStatus:', err);
      alert('Error al actualizar: ' + (err.message || 'Error de conexión'));
    } finally {
      setLoading(false);
    }
  };

  const monthName = currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const formattedMonthTitle = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const miniCalendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false, monthOffset: -1 });
    }

    for (let i = 1; i <= daysInCurrentMonth; i++) {
      days.push({ day: i, isCurrentMonth: true, monthOffset: 0 });
    }

    const remainingCells = 35 - days.length;
    const extraCells = remainingCells < 0 ? 42 - days.length : remainingCells;
    for (let i = 1; i <= extraCells; i++) {
      days.push({ day: i, isCurrentMonth: false, monthOffset: 1 });
    }

    return days;
  }, [currentDate]);

  const handleSelectMiniCalendarDay = (day: number, monthOffset: number) => {
    let targetMonth = currentDate.getMonth() + monthOffset;
    let targetYear = currentDate.getFullYear();

    if (targetMonth < 0) {
      targetMonth = 11;
      targetYear -= 1;
    } else if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }

    const targetDate = new Date(targetYear, targetMonth, day);
    setSelectedDay(day);

    if (monthOffset !== 0) {
      setCurrentDate(new Date(targetYear, targetMonth, 1));
    }

    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}-${mm}-${dd}`;

    setSelectedFormattedDate(formattedDate);
    setFormData(prev => ({ ...prev, fecha: formattedDate }));

    if (calendarRef.current) {
      calendarRef.current.getApi().gotoDate(formattedDate);
    }
  };

  const daysOfWeek = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

  const filteredEvents = useMemo(() => {
    if (selectedProjectFilter === 'all') return eventsList;
    return eventsList.filter(ev => ev.proyecto_id === selectedProjectFilter);
  }, [selectedProjectFilter, eventsList]);

  // 📋 FILTRAR TAREAS / REVISIONES DEL DÍA SELECCIONADO Y POR EMPLEADO SELECCIONADO
  const eventsOfSelectedDay = useMemo(() => {
    return filteredEvents.filter(ev => {
      const evDateStr = ev.start.split('T')[0];
      const matchDate = evDateStr === selectedFormattedDate;
      const matchEmp = selectedEmployeeFilter === 'all' || ev.empleado_id === selectedEmployeeFilter;
      return matchDate && matchEmp;
    });
  }, [filteredEvents, selectedFormattedDate, selectedEmployeeFilter]);

  const handleEventClick = (clickInfo: EventClickArg) => {
    const fcEvent = clickInfo.event;
    const foundEvent = eventsList.find(e => e.id === fcEvent.id);

    if (foundEvent) {
      setSelectedEventDetails(foundEvent);
      setIsEditing(false);
    }
  };

  // 🗑️ ELIMINAR REVISIÓN
  const handleDeleteMeeting = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta revisión?')) return;

    try {
      setLoading(true);
      const { error } = await supabase.from('reuniones').delete().eq('id', id);
      if (error) throw error;

      alert('🗑️ Revisión eliminada correctamente.');
      setSelectedEventDetails(null);
      await fetchCalendarData();
    } catch (err: any) {
      console.error('Error al eliminar revisión:', err);
      alert('Error al eliminar: ' + (err.message || 'Ocurrió un error.'));
    } finally {
      setLoading(false);
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
      console.error('Error al actualizar la reunión:', err);
      alert('Error al guardar cambios: ' + (err.message || 'Intente nuevamente.'));
    } finally {
      setLoading(false);
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
      console.error('Error actualizando fecha de reunión arrastrada:', err);
      alert('No se pudo mover la reunión: ' + (err.message || 'Error de conexión.'));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const startDateTime = new Date(`${formData.fecha}T${formData.hora_inicio}:00`);
      const endDateTime = new Date(startDateTime.getTime() + parseInt(formData.duracion_minutos) * 60000);

      if (!formData.proyecto_id) {
        alert('Debes seleccionar un proyecto.');
        return;
      }

      const { error } = await supabase
        .from('reuniones')
        .insert({
          titulo: formData.titulo.trim(),
          proyecto_id: formData.proyecto_id,
          empleado_id: formData.empleado_id || null,
          creado_por: formData.empleado_id || null,
          descripcion: formData.descripcion.trim() || null,
          fecha_inicio: startDateTime.toISOString(),
          fecha_fin: endDateTime.toISOString(),
          estado: 'Programada'
        });

      if (error) throw error;

      setIsModalOpen(false);
      setFormData({
        titulo: '',
        proyecto_id: '',
        descripcion: '',
        fecha: new Date().toISOString().split('T')[0],
        hora_inicio: '10:00',
        duracion_minutos: '30',
        empleado_id: '',
      });

      await fetchCalendarData();
    } catch (error: any) {
      console.error('Error al agendar la reunión:', error);
      alert('Error al agendar la reunión: ' + (error.message || 'Ocurrió un error.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col p-2 md:p-4 overflow-hidden h-full w-full min-w-0 select-none bg-slate-50 relative gap-3">
      
      {/* BARRA SUPERIOR DE ACCIONES Y FILTROS */}
      <header className="flex flex-wrap justify-between items-center gap-3 shrink-0 bg-white border border-slate-200/80 rounded-2xl p-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold text-slate-900">Calendario de Revisiones</h1>
          
          <button 
            onClick={() => {
              const today = new Date();
              setCurrentDate(today);
              setSelectedDay(today.getDate());
              const todayFormatted = today.toISOString().split('T')[0];
              setSelectedFormattedDate(todayFormatted);
              if (calendarRef.current) {
                calendarRef.current.getApi().today();
              }
            }}
            className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors shadow-2xs cursor-pointer"
          >
            Hoy
          </button>

          {/* 🔄 BOTÓN DE ACTUALIZAR SIN RECARGAR PÁGINA */}
          <button 
            onClick={fetchCalendarData}
            disabled={fetchingData}
            className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors shadow-2xs cursor-pointer flex items-center gap-1 disabled:opacity-50"
            title="Actualizar datos sin recargar la página"
          >
            <span className={fetchingData ? "animate-spin" : ""}>🔄</span>
            <span>{fetchingData ? 'Cargando...' : 'Actualizar'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold py-1.5 px-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
          >
            <option value="all">📁 Todos los proyectos ({eventsList.length})</option>
            {proyectosList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>

          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3.5 rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span className="text-sm leading-none">+</span> Agendar Revisión
          </button>
        </div>
      </header>

      {/* CONTENEDOR PRINCIPAL VERTICAL */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto gap-3 pr-1">
        
        {/* 1. CALENDARIO GRANDE (FULLCALENDAR) */}
        <div className="flex-1 min-h-[480px] bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col relative shrink-0
  [&_.fc-toolbar-title]:text-base [&_.fc-toolbar-title]:font-bold [&_.fc-toolbar-title]:text-slate-900
  [&_.fc-col-header-cell-cushion]:text-xs [&_.fc-col-header-cell-cushion]:font-bold [&_.fc-col-header-cell-cushion]:text-slate-700
  [&_.fc-timegrid-axis-cushion]:text-[11px] [&_.fc-timegrid-axis-cushion]:font-semibold [&_.fc-timegrid-axis-cushion]:!text-black
  [&_.fc-timegrid-slot-label-cushion]:text-[11px] [&_.fc-timegrid-slot-label-cushion]:font-medium [&_.fc-timegrid-slot-label-cushion]:!text-black
  [&_.fc-button-primary]:bg-white [&_.fc-button-primary]:text-slate-700 [&_.fc-button-primary]:border-slate-200 [&_.fc-button-primary]:text-xs [&_.fc-button-primary]:font-semibold
  [&_.fc-button-active]:!bg-slate-100 [&_.fc-button-active]:!text-slate-900 [&_.fc-button-active]:!border-slate-300
  [&_.fc-daygrid-dot-event_.fc-event-title]:!text-black
  [&_.fc-daygrid-day-number]:!text-black [&_.fc-daygrid-day-number]:font-bold
  [&_.fc-daygrid-event]:!rounded-lg [&_.fc-daygrid-event]:!border-none [&_.fc-daygrid-event]:my-0.5
  [&_.fc-timegrid-event]:!rounded-xl [&_.fc-timegrid-event]:!border-none [&_.fc-timegrid-event]:!shadow-md
  [&_.fc-timegrid-col]:!bg-white
  [&_.fc-timegrid-slot]:!h-16
  [&_.fc-timegrid-slot]:!bg-white
  [&_.fc-event]:cursor-pointer [&_.fc-event]:transition-transform [&_.fc-event:hover]:scale-[1.01]"
        >
          {fetchingData && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-xs z-10 flex items-center justify-center text-xs font-bold text-slate-500 gap-2">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              Sincronizando reuniones...
            </div>
          )}

          <div className="flex-1 min-h-0 text-xs">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              headerToolbar={{
                left: 'prev,next',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
              }}
              locale="es"
              editable={true}
              selectable={true}
              height="100%"
              slotMinTime="09:00:00"
              slotMaxTime="17:30:00" 
              allDaySlot={false}
              businessHours={[
                {
                  daysOfWeek: [1, 2, 3, 4, 5],
                  startTime: '09:00',
                  endTime: '17:00',
                },
                {
                  daysOfWeek: [6],
                  startTime: '09:00',
                  endTime: '13:00',
                }
              ]}
              selectConstraint="businessHours"
              events={filteredEvents}
              eventClick={handleEventClick}
              eventChange={handleEventChange}
              eventDisplay="block"
              displayEventTime={true}
              eventTimeFormat={{
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false,
                hour12: false
              }}
              eventContent={(eventInfo) => {
                const isTimeGrid = eventInfo.view.type.startsWith('timeGrid');
                const isCompleted = eventInfo.event.extendedProps.estado === 'Completada';

                if (isTimeGrid) {
                  return (
                    <div className="flex flex-col h-full w-full p-2.5 overflow-hidden justify-start gap-1.5 leading-snug text-white select-none">
                      <div className="flex items-center justify-between gap-1 shrink-0">
                        <span className="font-mono text-[10px] font-bold bg-white/20 border border-white/20 px-1.5 py-0.5 rounded-md text-white tracking-tight">
                          ⏱️ {eventInfo.timeText}
                        </span>
                        {isCompleted && (
                          <span className="text-[9px] font-bold bg-emerald-800 text-white px-1.5 py-0.5 rounded-md">
                            ✓ COMPLETADA
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-[12px] leading-snug text-white line-clamp-3 break-words drop-shadow-xs">
                        {eventInfo.event.title}
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-white overflow-hidden rounded-md w-full shadow-2xs">
                    <span className="opacity-90 font-mono text-[10px] shrink-0 bg-black/20 px-1 rounded">
                      {eventInfo.timeText}
                    </span>
                    <span className="truncate">{isCompleted ? '✓ ' : ''}{eventInfo.event.title}</span>
                  </div>
                );
              }}
            />
          </div>
        </div>

        {/* 2. PANEL INFERIOR: MINI CALENDARIO + HISTORIAL DEL DÍA CON FILTRO DE EMPLEADOS */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col lg:flex-row gap-5 shrink-0">
          
          {/* A) Mini Calendario Interactivo */}
          <div className="w-full lg:w-auto shrink-0 flex flex-col items-center">
            <div className="flex justify-between items-center w-full mb-2 px-1 gap-4">
              <span className="text-xs font-bold text-slate-900">
                📅 {formattedMonthTitle}
              </span>

              <div className="flex gap-1 text-slate-600">
                <button 
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-slate-100 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  title="Mes anterior"
                >
                  ‹
                </button>
                <button 
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-slate-100 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  title="Mes siguiente"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 text-center mb-1 w-60">
              {daysOfWeek.map((d, index) => (
                <span key={index} className="text-[10px] font-bold text-slate-400">
                  {d}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1 text-center text-xs w-60">
              {miniCalendarDays.map((item, idx) => {
                const isSelected = item.isCurrentMonth && item.day === selectedDay;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectMiniCalendarDay(item.day, item.monthOffset)}
                    className={`h-7 w-7 mx-auto flex items-center justify-center rounded-full transition-all text-[11px] cursor-pointer ${
                      !item.isCurrentMonth 
                        ? 'text-slate-300 font-normal hover:bg-slate-50' 
                        : isSelected
                          ? 'bg-blue-600 text-white font-bold shadow-2xs'
                          : 'text-slate-700 hover:bg-slate-100 font-medium'
                    }`}
                  >
                    {item.day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* B) Historial y Detalle del Día Seleccionado con Menú Desplegable y Scroll de Empleados */}
          <div className="flex-1 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-5 flex flex-col min-w-0">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  📜 Revisiones del Día ({selectedFormattedDate})
                </h3>
                <p className="text-[11px] text-slate-500">
                  {eventsOfSelectedDay.length} revisiones programadas en esta fecha
                </p>
              </div>

              {/* 🔍 Menú desplegable para filtrar por todos o un empleado específico (Solo Practicantes) */}
              <select
                value={selectedEmployeeFilter}
                onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold py-1.5 px-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer w-full sm:w-52"
              >
                <option value="all">👥 Todos los integrantes ({soloEmpleadosList.length})</option>
                {soloEmpleadosList.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    ● {emp.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* BARRA HORIZONTAL CON SCROLL PARA VER A TODOS LOS INTEGRANTES SIN ADMINS */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-thin">
              <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0 mr-1">Equipo:</span>
              {soloEmpleadosList.map(emp => {
                const empColor = emp.color || '#2563eb';
                const isSelected = selectedEmployeeFilter === emp.id;
                return (
                  <button
                    key={emp.id} 
                    type="button"
                    onClick={() => setSelectedEmployeeFilter(isSelected ? 'all' : emp.id)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border truncate shrink-0 shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all ${
                      isSelected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-slate-50'
                    }`}
                    style={!isSelected ? { color: empColor, borderColor: empColor } : {}}
                  >
                    <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: isSelected ? '#ffffff' : empColor }}></span>
                    <span>{emp.nombre}</span>
                  </button>
                );
              })}
              {selectedEmployeeFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedEmployeeFilter('all')}
                  className="text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-full shrink-0 cursor-pointer"
                >
                  ✕ Ver todos
                </button>
              )}
            </div>

            {/* LISTA DE REVISIONES DEL DÍA */}
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {eventsOfSelectedDay.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl text-center text-xs text-slate-400">
                  No hay revisiones agendadas para este filtro en el <strong className="text-slate-700">{selectedFormattedDate}</strong>.
                </div>
              ) : (
                eventsOfSelectedDay.map((rev) => {
                  const isCompleted = rev.estado === 'Completada';
                  
                  const empleadoAsignado = empleadosList.find(e => e.id === rev.empleado_id);
                  const colorBadge = empleadoAsignado?.color || rev.backgroundColor || '#2563eb';

                  return (
                    <div 
                      key={rev.id}
                      className="p-3 rounded-xl border transition-all flex items-center justify-between gap-3 bg-white shadow-2xs"
                      style={{ borderLeftWidth: '4px', borderLeftColor: isCompleted ? '#059669' : colorBadge }}
                    >
                      <div 
                        onClick={() => {
                          setSelectedEventDetails(rev);
                          setIsEditing(false);
                        }}
                        className="space-y-1 min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <h4 className={`font-bold text-xs truncate ${isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}>{rev.title}</h4>
                          
                          <span 
                            className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-white truncate"
                            style={{ color: colorBadge, borderColor: colorBadge }}
                          >
                            👤 {rev.descripcion?.includes('[Convocatoria Grupal') || rev.empleado_nombre?.includes('Todo el equipo') ? 'Todo el equipo' : rev.empleado_nombre}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                            📁 {rev.proyecto_nombre}
                          </span>
                          <span>•</span>
                          <span>Estado: <strong className={isCompleted ? 'text-emerald-700' : ''}>{rev.estado}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* 🎯 BOTONES RÁPIDOS PARA MARCAR COMPLETADA/REABRIR */}
                        {!isCompleted ? (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(rev.id, 'Completada')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2 py-1 rounded-lg transition-colors cursor-pointer"
                            title="Marcar como Completada"
                          >
                            ✓ Completar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(rev.id, 'Programada')}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] px-2 py-1 rounded-lg transition-colors cursor-pointer"
                            title="Reabrir reunión"
                          >
                            ↩ Reabrir
                          </button>
                        )}

                        <span className="font-mono text-xs font-bold text-slate-800 bg-white/80 border border-slate-200 px-2 py-1 rounded-lg">
                          ⏱️ {new Date(rev.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleDeleteMeeting(rev.id)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 text-xs cursor-pointer transition-colors"
                          title="Eliminar revisión"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>

        </div>

      </div>

      {/* MODAL AGENDAR REVISIÓN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-base font-bold text-slate-900">Agendar Revisión</h2>
                <p className="text-xs text-slate-500">Selecciona el proyecto y empleado a revisar.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Título de la Revisión <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="titulo"
                  required
                  value={formData.titulo}
                  onChange={handleInputChange}
                  placeholder="Ej. Revisión Módulo de Autenticación"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all placeholder:text-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Proyecto <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="proyecto_id"
                    required
                    value={formData.proyecto_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                  >
                    <option value="" className="text-slate-400">Seleccionar...</option>
                    {proyectosList.map((p) => (
                      <option key={p.id} value={p.id} className="text-slate-900">{p.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Empleado{' '}
                    <span className="text-slate-400 font-normal">(opcional — vacío = todos)</span>
                  </label>
                  <select
                    name="empleado_id"
                    value={formData.empleado_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                  >
                    <option value="" className="text-slate-700 font-semibold">🌐 Todos los empleados (General)</option>
                    {soloEmpleadosList.map((e) => (
                      <option key={e.id} value={e.id} className="text-slate-900">{e.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Fecha <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="fecha"
                    required
                    value={formData.fecha}
                    onChange={handleInputChange}
                    className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Hora <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    name="hora_inicio"
                    required
                    value={formData.hora_inicio}
                    onChange={handleInputChange}
                    className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Duración
                  </label>
                  <select
                    name="duracion_minutos"
                    value={formData.duracion_minutos}
                    onChange={handleInputChange}
                    className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hora</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Notas / Temas a tratar
                </label>
                <textarea
                  name="descripcion"
                  rows={2}
                  value={formData.descripcion}
                  onChange={handleInputChange}
                  placeholder="Detalles sobre las tareas finalizadas que se van a revisar..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all resize-none placeholder:text-slate-400"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Guardando...' : 'Guardar Revisión'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALLES Y EDICIÓN DE REUNIÓN CON BOTÓN DE ELIMINAR, COMPLETAR Y AJUSTAR TIEMPO */}
      {selectedEventDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedEventDetails.backgroundColor }}></span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {isEditing ? '✏️ Editar Revisión' : 'Detalles de Revisión'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEventDetails(null)}
                className="text-slate-400 hover:text-slate-600 h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Título</label>
                  <input
                    type="text"
                    required
                    value={editFormData.titulo}
                    onChange={(e) => setEditFormData({ ...editFormData, titulo: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Proyecto</label>
                    <select
                      value={editFormData.proyecto_id}
                      onChange={(e) => setEditFormData({ ...editFormData, proyecto_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                    >
                      {proyectosList.map(p => (
                        <option key={p.id} value={p.id} className="text-slate-900">{p.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Empleado</label>
                    <select
                      value={editFormData.empleado_id}
                      onChange={(e) => setEditFormData({ ...editFormData, empleado_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                    >
                      {soloEmpleadosList.map(e => (
                        <option key={e.id} value={e.id} className="text-slate-900">{e.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Fecha</label>
                    <input
                      type="date"
                      required
                      value={editFormData.fecha}
                      onChange={(e) => setEditFormData({ ...editFormData, fecha: e.target.value })}
                      className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Hora</label>
                    <input
                      type="time"
                      required
                      value={editFormData.hora_inicio}
                      onChange={(e) => setEditFormData({ ...editFormData, hora_inicio: e.target.value })}
                      className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Duración</label>
                    <select
                      value={editFormData.duracion_minutos}
                      onChange={(e) => setEditFormData({ ...editFormData, duracion_minutos: e.target.value })}
                      className="w-full px-2 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                    >
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="45">45 min</option>
                      <option value="60">1 hora</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Notas / Temas</label>
                  <textarea
                    rows={2}
                    value={editFormData.descripcion}
                    onChange={(e) => setEditFormData({ ...editFormData, descripcion: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all resize-none"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                  >
                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {selectedEventDetails.title}
                  </h3>
                  <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    selectedEventDetails.estado === 'Completada'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : selectedEventDetails.estado === 'Ajuste por tiempo'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    Estado: {selectedEventDetails.estado || 'Programada'}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-500">📁 Proyecto:</span>
                    <span className="font-bold text-slate-800">
                      {selectedEventDetails.proyecto_nombre}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-500">👤 Integrante:</span>
                    <span className="font-bold text-slate-800">
                      {selectedEventDetails.descripcion?.includes('[Convocatoria Grupal') || selectedEventDetails.empleado_nombre?.includes('Todo el equipo')
                        ? 'Todo el equipo'
                        : selectedEventDetails.empleado_nombre}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-500">📅 Hora / Horario:</span>
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                      {new Date(selectedEventDetails.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedEventDetails.end).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-800 mb-1">📝 Notas / Agenda</h4>
                  <p className="text-xs text-slate-700 font-medium bg-white border border-slate-200 p-3 rounded-xl min-h-16">
                    {selectedEventDetails.descripcion || 'Sin notas adicionadas.'}
                  </p>
                </div>

                {/* ACCIONES DEL MODAL: COMPLETAR, AJUSTAR TIEMPO, EDITAR Y ELIMINAR */}
                <div className="pt-2 flex flex-col gap-2 border-t border-slate-100">
                  <div className="flex gap-2">
                    {selectedEventDetails.estado !== 'Completada' ? (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(selectedEventDetails.id, 'Completada')}
                        disabled={loading}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-1"
                      >
                        ✅ Marcar Completada
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(selectedEventDetails.id, 'Programada')}
                        disabled={loading}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                      >
                        ↩ Reabrir Revisión
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-1"
                    >
                      ⏳ Ajustar Tiempo / Editar
                    </button>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <button
                      type="button"
                      onClick={() => handleDeleteMeeting(selectedEventDetails.id)}
                      disabled={loading}
                      className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                    >
                      🗑️ Eliminar
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedEventDetails(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      )}

    </main>
  );
}