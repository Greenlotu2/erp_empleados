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
}

export default function CalendarioRevisiones() {
  const calendarRef = useRef<FullCalendar | null>(null);

  const [eventsList, setEventsList] = useState<MeetingEvent[]>([]);
  const [proyectosList, setProyectosList] = useState<ProyectoSelect[]>([]);
  const [empleadosList, setEmpleadosList] = useState<EmpleadoSelect[]>([]);
  
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('all');
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

  const [formData, setFormData] = useState({
    titulo: '',
    proyecto_id: '',
    descripcion: '',
    fecha: new Date().toISOString().split('T')[0],
    hora_inicio: '10:00',
    duracion_minutos: '30',
    empleado_id: '',
  });

  // 🔄 CARGA DE DATOS DESDE SUPABASE
  const fetchCalendarData = async () => {
    try {
      setFetchingData(true);

      // A) Proyectos
      const { data: projData } = await supabase.from('proyectos').select('id, nombre');
      if (projData) setProyectosList(projData);

      // B) Empleados
      const { data: empData } = await supabase.from('empleados').select('id, nombre');
      if (empData) setEmpleadosList(empData);

      // C) Reuniones
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
          empleados!reuniones_empleado_id_fkey (nombre),
          proyectos (nombre)
        `);

      if (reunionesErr) throw reunionesErr;

      if (reunionesData) {
        const mappedEvents: MeetingEvent[] = reunionesData.map((r: any) => {
          const startDate = r.fecha_inicio || new Date().toISOString();
          // Si no hay fecha fin, asignar 30 min por defecto
          const endDate = r.fecha_fin || new Date(new Date(startDate).getTime() + 30 * 60000).toISOString();

          let color = '#2563eb'; // Azul por defecto
          if (r.estado === 'Completado' || r.estado === 'Aprobado') color = '#059669'; // Verde
          if (r.estado === 'Ajuste por tiempo' || r.estado === 'Pendiente') color = '#d97706'; // Ámbar
          if (r.estado === 'Cancelada' || r.estado === 'Rechazado') color = '#dc2626'; // Rojo

          return {
            id: r.id,
            title: r.titulo || 'Reunión sin título',
            proyecto_id: r.proyecto_id,
            empleado_id: r.empleado_id,
            empleado_nombre: r.empleados?.nombre || 'Sin asignar',
            descripcion: r.descripcion || '',
            estado: r.estado || 'Programada',
            start: startDate,
            end: endDate,
            backgroundColor: color,
            borderColor: color,
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

  const handleEventClick = (clickInfo: EventClickArg) => {
    const fcEvent = clickInfo.event;
    const foundEvent = eventsList.find(e => e.id === fcEvent.id);

    if (foundEvent) {
      setSelectedEventDetails(foundEvent);
      setIsEditing(false);
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
      empleado_id: selectedEventDetails.empleado_id || (empleadosList[0]?.id || ''),
      fecha: `${yyyy}-${mm}-${dd}`,
      hora_inicio: `${hh}:${min}`,
      duracion_minutos: String(durationMin > 0 ? durationMin : 30),
      descripcion: selectedEventDetails.descripcion || '',
    });

    setIsEditing(true);
  };

  // 💾 GUARDAR EDICIÓN DESDE EL MODAL (ACTUALIZA SUPABASE)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventDetails) return;

    try {
      setLoading(true);

      const startDateTime = new Date(`${editFormData.fecha}T${editFormData.hora_inicio}:00`);
      const endDateTime = new Date(startDateTime.getTime() + parseInt(editFormData.duracion_minutos) * 60000);

      // Actualizar en Supabase (marca como 'Ajuste por tiempo' si cambió)
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

  // 🔄 DRAG & DROP O RESIZE DIRECTO EN EL CALENDARIO (ACTUALIZA SUPABASE)
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
          estado: 'Ajuste por tiempo' // Registra la reprogramación para el plugin
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

  // ➕ AGENDAR NUEVA REVISIÓN (INSERTA EN SUPABASE)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const startDateTime = new Date(`${formData.fecha}T${formData.hora_inicio}:00`);
      const endDateTime = new Date(startDateTime.getTime() + parseInt(formData.duracion_minutos) * 60000);

      if (!formData.proyecto_id || !formData.empleado_id) {
        alert('Debes seleccionar un proyecto y un empleado.');
        return;
      }

      const { error } = await supabase
        .from('reuniones')
        .insert({
          titulo: formData.titulo.trim(),
          proyecto_id: formData.proyecto_id,
          empleado_id: formData.empleado_id,
          creado_por: formData.empleado_id, // Asigna al creador
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
    <main className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden h-full w-full min-w-0 select-none bg-slate-50 relative">
      
      {/* Encabezado */}
      <header className="flex justify-between items-center mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Calendario de Revisiones</h1>
          <button 
            onClick={() => {
              const today = new Date();
              setCurrentDate(today);
              setSelectedDay(today.getDate());
              if (calendarRef.current) {
                calendarRef.current.getApi().today();
              }
            }}
            className="px-3 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            Hoy
          </button>
        </div>

        <span className="text-xs text-slate-500 font-semibold hidden sm:inline-block">
          Horario Laboral: L-V 9:00 - 17:00 | S 9:00 - 13:00
        </span>
      </header>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
        
        {/* PANEL LATERAL */}
        <div className="w-full lg:w-72 xl:w-80 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col gap-4 min-h-0 shrink-0 overflow-y-auto">
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span className="text-base leading-none">+</span> Agendar Revisión
          </button>

          {/* MINI CALENDARIO INTERACTIVO */}
          <div className="pt-1">
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-xs font-bold text-slate-900">
                {formattedMonthTitle}
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

            <div className="grid grid-cols-7 text-center mb-1">
              {daysOfWeek.map((d, index) => (
                <span key={index} className="text-[10px] font-bold text-slate-400">
                  {d}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
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

          {/* FILTRO DE REVISIONES POR PROYECTO */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Filtrar por Proyecto
            </span>

            <select
              value={selectedProjectFilter}
              onChange={(e) => setSelectedProjectFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold py-2 px-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              <option value="all">📁 Todos los proyectos ({eventsList.length})</option>
              {proyectosList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* FULLCALENDAR */}
        <div className="flex-1 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col min-h-0 overflow-hidden relative
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

                if (isTimeGrid) {
                  return (
                    <div className="flex flex-col h-full w-full p-2.5 overflow-hidden justify-start gap-1.5 leading-snug text-white select-none">
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="font-mono text-[10px] font-bold bg-white/20 border border-white/20 px-1.5 py-0.5 rounded-md text-white tracking-tight">
                          ⏱️ {eventInfo.timeText}
                        </span>
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
                    <span className="truncate">{eventInfo.event.title}</span>
                  </div>
                );
              }}
            />
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
                    Empleado <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="empleado_id"
                    required
                    value={formData.empleado_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
                  >
                    <option value="" className="text-slate-400">Seleccionar...</option>
                    {empleadosList.map((e) => (
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

      {/* 🔍 MODAL DE DETALLES Y EDICIÓN DE LA REUNIÓN */}
      {selectedEventDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header Modal */}
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

            {/* MODO EDICIÓN */}
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
                      {empleadosList.map(e => (
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
              /* MODO LECTURA DE DETALLES */
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {selectedEventDetails.title}
                  </h3>
                  <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    Estado: {selectedEventDetails.estado || 'Programada'}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-500">📁 Proyecto:</span>
                    <span className="font-bold text-slate-800">
                      {proyectosList.find(p => p.id === selectedEventDetails.proyecto_id)?.nombre || 'Proyecto General'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-500">👤 Integrante:</span>
                    <span className="font-bold text-slate-800">{selectedEventDetails.empleado_nombre || 'Sin asignar'}</span>
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

                <div className="pt-2 flex justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    ✏️ Editar Horario / Notas
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
            )}

          </div>
        </div>
      )}

    </main>
  );
}