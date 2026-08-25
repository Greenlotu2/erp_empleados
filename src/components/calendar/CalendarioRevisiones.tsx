'use client';

import React, { useRef, useState, useEffect, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { EventClickArg } from '@fullcalendar/core';
import { formatFechaLimite } from '../../lib/dates';
import { supabase } from '../../lib/supabaseClient';
import { getCurrentAdminId } from '../../lib/currentAdmin';

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
  tareaDueDate?: string | null;
  esGrupal?: boolean;
  tareaId?: number | null;
  creadoPorNombre?: string | null;
  link?: string | null;
  lugar?: string | null;
}

interface ProyectoSelect {
  id: string;
  nombre: string;
}

const AREAS = ['Administrativo y RRHH', 'Proyectos y Obra', 'TICs', 'Financiero-Contable'] as const;

interface EmpleadoSelect {
  id: string;
  nombre: string;
  color?: string;
  rol?: string;
  nivel?: string;
  area?: string | null;
}

interface TareaResumen {
  id: number;
  titulo: string;
  fecha_limite: string | null;
  estado: string | null;
  empleado_id: string | null;
  asignada_por: string | null;
}

interface ActividadItem {
  id: string;
  tipo: 'tarea' | 'reunion';
  titulo: string;
  fecha: string;
  empleadoNombre: string;
  proyectoNombre: string | null;
  estado: string | null;
  creadoPorNombre: string | null;
}

export default function CalendarioRevisiones({ refreshTrigger }: { refreshTrigger?: number }) {
  const calendarRef = useRef<FullCalendar | null>(null);

  const [eventsList, setEventsList] = useState<MeetingEvent[]>([]);
  const [tareasList, setTareasList] = useState<TareaResumen[]>([]);
  const [proyectosList, setProyectosList] = useState<ProyectoSelect[]>([]);
  const [empleadosList, setEmpleadosList] = useState<EmpleadoSelect[]>([]);

  const [selectedProjectFilter, setSelectedProjectFilter] = useState('all');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  const [popoverState, setPopoverState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    event: MeetingEvent | null;
  }>({ visible: false, x: 0, y: 0, event: null });

  const [selectedEventDetails, setSelectedEventDetails] = useState<MeetingEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  // El modal de "crear" tiene dos modos independientes: agendar una reunión/revisión,
  // o asignar una tarea nueva (mismo patrón que el modal de /admin/revisiones).
  const [createMode, setCreateMode] = useState<'reunion' | 'tarea'>('reunion');
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [formData, setFormData] = useState({
    titulo: '',
    proyecto_id: '',
    empleado_id: '',
    fecha: '',
    hora_inicio: '10:00',
    duracion_minutos: '30',
    descripcion: '',
    tarea_id: '',
    modalidad: 'presencial' as 'presencial' | 'virtual',
    lugar: 'Oficina Ing. Luis' as 'Oficina Ing. Luis' | 'Comedor',
    link: '',
  });
  const [isGeneratingZoom, setIsGeneratingZoom] = useState(false);

  const [newTaskFormData, setNewTaskFormData] = useState({
    empleadoId: '',
    proyectoId: '',
    titulo: '',
    descripcion: '',
    prioridad: 'Media' as 'Baja' | 'Media' | 'Alta' | 'Urgente',
    fechaLimite: '',
  });

  // 🔑 ID del administrador con sesión iniciada (quien asigna la tarea). Ya no se
  // pregunta por selector: siempre es quien está usando el panel en ese momento.
  const [currentAdminId, setCurrentAdminId] = useState<string>('');

  useEffect(() => {
    getCurrentAdminId().then(id => { if (id) setCurrentAdminId(id); });
  }, []);

  const fetchCalendarData = async () => {
    try {
      setFetchingData(true);

      const { data: projData } = await (supabase.from('proyectos') as any).select('id, nombre');
      if (projData) setProyectosList(projData);

      const { data: empData } = await (supabase.from('empleados') as any).select('id, nombre, color, rol, nivel, area');
      if (empData) setEmpleadosList(empData);

      const { data: tareasData } = await (supabase.from('tareas') as any)
        .select('id, titulo, fecha_limite, estado, empleado_id, asignada_por');
      if (tareasData) setTareasList(tareasData);

      const { data: reunionesData, error: reunionesErr } = await (supabase.from('reuniones') as any)
        .select(`
          id,
          titulo,
          descripcion,
          fecha_inicio,
          fecha_fin,
          estado,
          empleado_id,
          proyecto_id,
          tarea_id,
          fecha,
          hora,
          link,
          lugar,
          empleados!reuniones_empleado_id_fkey (nombre, color),
          creador:empleados!reuniones_creado_por_fkey (nombre),
          proyectos (nombre),
          tareas (fecha_limite)
        `);

      if (reunionesErr) throw reunionesErr;

      if (reunionesData) {
        const mappedEvents: MeetingEvent[] = reunionesData.map((r: any) => {
          const startDate = r.fecha_inicio || (r.fecha && r.hora ? `${r.fecha}T${r.hora}:00` : new Date().toISOString());
          const endDate = r.fecha_fin || new Date(new Date(startDate).getTime() + 30 * 60000).toISOString();

          const esGrupal = r.empleado_id === null;
          const nombreIntegrante = esGrupal ? 'Todo el equipo' : (r.empleados?.nombre || 'Todo el equipo');

          const customColor = r.empleados?.color || '#0ea5e9';
          const bgFinal = r.estado === 'Fecha Límite'
            ? '#dc2626'
            : r.estado === 'Completada'
              ? '#059669'
              : customColor;

          return {
            id: String(r.id),
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
            tareaDueDate: r.tareas?.fecha_limite || null,
            esGrupal,
            tareaId: r.tarea_id ? Number(r.tarea_id) : null,
            creadoPorNombre: r.creador?.nombre || null,
            link: r.link || null,
            lugar: r.lugar || null,
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

  // 🔎 Si llegamos desde "Asignar Tarea" (Panel Principal) con un evento recién creado
  // (el marcador de Fecha Límite), lo abrimos ya seleccionado y navegamos el calendario
  // a su fecha, para que se vea "ya marcada" sin tener que buscarla manualmente.
  useEffect(() => {
    if (eventsList.length === 0) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const highlightId = params.get('highlightEventId');
    if (!highlightId) return;

    const evento = eventsList.find(ev => String(ev.id) === highlightId);
    if (evento) {
      setSelectedEventDetails(evento);
      calendarRef.current?.getApi().gotoDate(evento.start);
    }

    window.history.replaceState({}, document.title, window.location.pathname);
  }, [eventsList]);

  // Antes excluía a cualquier empleado con "admin" en el rol, pero en esta plataforma
  // TODOS los usuarios que inician sesión tienen rol "Administrador" (es el rol que da
  // acceso al panel, no implica que no sea parte del equipo). El campo correcto para
  // decidir si alguien es Gerencia/Coordinador/Trabajador es `nivel`, no `rol`.
  const soloEmpleadosList = empleadosList;

  const getColorEmpleado = (empleadoId?: string) => {
    if (!empleadoId) return undefined;
    return empleadosList.find(e => e.id === empleadoId)?.color || '#0ea5e9';
  };

  const getNivelEmpleado = (emp: EmpleadoSelect): 'gerencia' | 'coordinador' | 'trabajador' => {
    const nivel = emp.nivel?.toLowerCase().trim() || '';
    if (nivel.includes('geren')) return 'gerencia';
    if (nivel.includes('coordin')) return 'coordinador';
    return 'trabajador';
  };

  const empleadosPorNivel = useMemo(() => {
    const grupos = {
      gerencia: [] as EmpleadoSelect[],
      coordinador: [] as EmpleadoSelect[],
      trabajador: [] as EmpleadoSelect[],
    };
    soloEmpleadosList.forEach(emp => grupos[getNivelEmpleado(emp)].push(emp));
    return grupos;
  }, [soloEmpleadosList]);

  // Sub-agrupación de "Trabajadores" por área (Administrativo y RRHH, Proyectos y
  // Obra, TICs, Financiero-Contable — según el organigrama), para que la lista no
  // crezca de forma plana e ilegible conforme se agreguen más trabajadores.
  const trabajadoresPorArea = useMemo(() => {
    const grupos: Record<string, EmpleadoSelect[]> = {};
    AREAS.forEach(area => { grupos[area] = []; });
    grupos['Sin área'] = [];

    empleadosPorNivel.trabajador.forEach(emp => {
      const area = (AREAS as readonly string[]).includes(emp.area || '') ? (emp.area as string) : 'Sin área';
      grupos[area].push(emp);
    });

    return grupos;
  }, [empleadosPorNivel]);

  const filteredEvents = useMemo(() => {
    return eventsList.filter(ev => {
      const matchProj = selectedProjectFilter === 'all' || ev.proyecto_id === selectedProjectFilter;
      const matchEmp = selectedEmployeeFilter === 'all' || ev.empleado_id === selectedEmployeeFilter;
      return matchProj && matchEmp;
    });
  }, [eventsList, selectedProjectFilter, selectedEmployeeFilter]);

  const isTareaCerrada = (estado: string | null) => {
    const e = (estado || '').toLowerCase();
    return e === 'completada' || e === 'completado' || e === 'cancelada' || e === 'rechazada';
  };

  const actividadesStats = useMemo(() => {
    const hoyStr = new Date().toISOString().split('T')[0];
    const ahora = new Date();

    const tareasFiltradas = tareasList.filter(t =>
      selectedEmployeeFilter === 'all' || t.empleado_id === selectedEmployeeFilter
    );
    const reunionesReales = eventsList.filter(ev =>
      ev.estado !== 'Fecha Límite' &&
      (selectedEmployeeFilter === 'all' || ev.empleado_id === selectedEmployeeFilter)
    );

    // Empaquetan cada tarea/reunión con los datos que necesita el modal de detalle
    // (tipo, empleado, proyecto, estado) además del título/fecha que ya usaba la
    // lista compacta del acordeón.
    const empaquetarTarea = (t: TareaResumen): ActividadItem => ({
      id: `tarea-${t.id}`,
      tipo: 'tarea',
      titulo: t.titulo,
      fecha: t.fecha_limite || '',
      empleadoNombre: empleadosList.find(e => e.id === t.empleado_id)?.nombre || 'Sin asignar',
      proyectoNombre: null,
      estado: t.estado,
      creadoPorNombre: empleadosList.find(e => e.id === t.asignada_por)?.nombre || null,
    });

    const empaquetarReunion = (ev: MeetingEvent): ActividadItem => ({
      id: ev.id,
      tipo: 'reunion',
      titulo: ev.title,
      fecha: ev.start,
      empleadoNombre: ev.esGrupal ? 'Todo el equipo' : (ev.empleado_nombre || 'Sin asignar'),
      proyectoNombre: ev.proyecto_nombre || null,
      estado: ev.estado || null,
      creadoPorNombre: ev.creadoPorNombre || null,
    });

    const tareasHoyItems = tareasFiltradas
      .filter(t => t.fecha_limite === hoyStr && !isTareaCerrada(t.estado))
      .map(empaquetarTarea);
    const reunionesHoyItems = reunionesReales
      .filter(ev => ev.start.split('T')[0] === hoyStr)
      .map(empaquetarReunion);

    const agendadasItems = reunionesReales
      .filter(ev => new Date(ev.start) > ahora)
      .map(empaquetarReunion);

    const pasadasItems = reunionesReales
      .filter(ev => new Date(ev.end || ev.start) < ahora)
      .map(empaquetarReunion);

    const vencidasItems = tareasFiltradas
      .filter(t => t.fecha_limite && t.fecha_limite < hoyStr && !isTareaCerrada(t.estado))
      .map(empaquetarTarea);

    return {
      hoy: [...tareasHoyItems, ...reunionesHoyItems],
      agendadas: agendadasItems,
      pasadas: pasadasItems,
      vencidas: vencidasItems,
    };
  }, [tareasList, eventsList, empleadosList, selectedEmployeeFilter]);

  const [expandedCategoria, setExpandedCategoria] = useState<'hoy' | 'agendadas' | 'pasadas' | 'vencidas' | null>(null);
  const [detalleCategoria, setDetalleCategoria] = useState<{ label: string; items: ActividadItem[] } | null>(null);
  const [trabajadoresExpanded, setTrabajadoresExpanded] = useState(false);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const handleEventClick = (clickInfo: EventClickArg) => {
    clickInfo.jsEvent.preventDefault();
    clickInfo.jsEvent.stopPropagation();

    const rect = clickInfo.el.getBoundingClientRect();
    const foundEvent = eventsList.find(e => String(e.id) === String(clickInfo.event.id));

    if (foundEvent) {
      setPopoverState({
        visible: true,
        x: rect.right + 8,
        y: rect.top - 12,
        event: foundEvent,
      });
    }
  };

  const handleOpenCreateModal = (fechaDefault?: string, horaDefault?: string) => {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');

    setFormData({
      titulo: '',
      proyecto_id: proyectosList[0]?.id || '',
      empleado_id: soloEmpleadosList[0]?.id || '',
      fecha: fechaDefault || `${yyyy}-${mm}-${dd}`,
      hora_inicio: horaDefault || '10:00',
      duracion_minutos: '30',
      descripcion: '',
      tarea_id: '',
      modalidad: 'presencial',
      lugar: 'Oficina Ing. Luis',
      link: '',
    });
    setNewTaskFormData({
      empleadoId: '',
      proyectoId: '',
      titulo: '',
      descripcion: '',
      prioridad: 'Media',
      fechaLimite: fechaDefault || '',
    });
    setCreateMode('reunion');
    setIsCreating(true);
  };

  // 📋 ASIGNAR TAREA NUEVA desde el calendario — mismo flujo que en /admin/revisiones
  // y en el Panel Principal: crea la fila en 'tareas' y, si tiene fecha límite, el
  // marcador automático en el calendario (estado 'Fecha Límite').
  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskFormData.titulo.trim() || !newTaskFormData.empleadoId) {
      alert('Selecciona un integrante y escribe el título de la tarea.');
      return;
    }
    if (!newTaskFormData.proyectoId) {
      alert('Selecciona el proyecto de la tarea.');
      return;
    }

    try {
      setIsSavingTask(true);

      const taskPayload = {
        empleado_id: newTaskFormData.empleadoId,
        proyecto_id: newTaskFormData.proyectoId,
        titulo: newTaskFormData.titulo.trim(),
        descripcion: newTaskFormData.descripcion.trim() || null,
        estado: 'En Proceso',
        prioridad: newTaskFormData.prioridad,
        asignada_por: currentAdminId || null,
        fecha_asignada: new Date().toISOString().split('T')[0],
        fecha_limite: newTaskFormData.fechaLimite || null,
      };

      const { data: nuevaTarea, error } = await (supabase.from('tareas') as any)
        .insert(taskPayload)
        .select('id')
        .single();

      if (error) throw error;

      await (supabase.from('empleados') as any)
        .update({ disponibilidad: false })
        .eq('id', newTaskFormData.empleadoId);

      if (newTaskFormData.fechaLimite && nuevaTarea?.id) {
        const dtInicioLimite = new Date(`${newTaskFormData.fechaLimite}T09:00:00`);
        const dtFinLimite = new Date(`${newTaskFormData.fechaLimite}T10:00:00`);

        const { error: calErr } = await (supabase.from('reuniones') as any).insert({
          titulo: newTaskFormData.titulo.trim(),
          // Sin descripción: el título, el ícono ⏳ y la etiqueta "Fecha Límite" ya
          // dejan claro de qué se trata — repetirlo en una descripción es redundante.
          descripcion: null,
          fecha_inicio: dtInicioLimite.toISOString(),
          fecha_fin: dtFinLimite.toISOString(),
          fecha: newTaskFormData.fechaLimite,
          hora: '09:00 AM',
          estado: 'Fecha Límite',
          empleado_id: newTaskFormData.empleadoId,
          proyecto_id: newTaskFormData.proyectoId,
          tarea_id: nuevaTarea.id,
          creado_por: currentAdminId || null,
        });

        if (calErr) {
          console.error('No se pudo crear el evento de fecha límite en el calendario:', calErr);
        }
      }

      alert('✅ Tarea asignada con éxito.');
      setIsCreating(false);
      await fetchCalendarData();
    } catch (err: any) {
      console.error('Error al asignar tarea:', err);
      alert('No se pudo asignar la tarea: ' + (err.message || 'Error de conexión'));
    } finally {
      setIsSavingTask(false);
    }
  };

  // Generación dinámica de enlace de Zoom vía API Server-to-Server (mismo endpoint
  // que usa /admin/revisiones).
  const handleGenerateZoomMeeting = async () => {
    if (!formData.titulo.trim() || !formData.fecha || !formData.hora_inicio) {
      alert('Ingresa el título, la fecha y la hora antes de generar el enlace de Zoom.');
      return;
    }

    try {
      setIsGeneratingZoom(true);

      const res = await fetch('/api/zoom/meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: formData.titulo,
          descripcion: formData.descripcion,
          fechaInicio: `${formData.fecha}T${formData.hora_inicio}`,
        }),
      });

      const data = await res.json();

      if (data.link) {
        setFormData(prev => ({ ...prev, link: data.link }));
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

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titulo.trim() || !formData.fecha || !formData.hora_inicio) {
      return alert('Por favor llena los campos requeridos.');
    }
    if (formData.modalidad === 'virtual' && !formData.link.trim()) {
      return alert('Genera o ingresa un enlace de Zoom para la revisión virtual.');
    }

    const esPresencial = formData.modalidad === 'presencial';

    try {
      setLoading(true);

      const startDateTime = new Date(`${formData.fecha}T${formData.hora_inicio}:00`);
      const endDateTime = new Date(startDateTime.getTime() + parseInt(formData.duracion_minutos) * 60000);

      const payload: any = {
        titulo: formData.titulo.trim(),
        proyecto_id: formData.proyecto_id || null,
        empleado_id: formData.empleado_id || null,
        descripcion: formData.descripcion.trim() || null,
        fecha: formData.fecha,
        hora: formData.hora_inicio,
        fecha_inicio: startDateTime.toISOString(),
        fecha_fin: endDateTime.toISOString(),
        estado: 'Programada',
        tarea_id: formData.tarea_id ? parseInt(formData.tarea_id, 10) : null,
        creado_por: currentAdminId || null,
        link: esPresencial ? null : formData.link.trim(),
        lugar: esPresencial ? formData.lugar : null,
      };

      const { error } = await (supabase.from('reuniones') as any).insert([payload]);

      if (error) throw error;

      setIsCreating(false);
      alert('✅ Sesión agendada con éxito.');
      await fetchCalendarData();
    } catch (err: any) {
      console.error('Error creando reunión:', err);
      alert('No se pudo crear la reunión: ' + (err.message || 'Error'));
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

    setFormData({
      titulo: selectedEventDetails.title,
      proyecto_id: selectedEventDetails.proyecto_id || (proyectosList[0]?.id || ''),
      empleado_id: selectedEventDetails.empleado_id || (soloEmpleadosList[0]?.id || ''),
      fecha: `${yyyy}-${mm}-${dd}`,
      hora_inicio: `${hh}:${min}`,
      duracion_minutos: String(durationMin > 0 ? durationMin : 30),
      descripcion: selectedEventDetails.descripcion || '',
      tarea_id: selectedEventDetails.tareaId ? String(selectedEventDetails.tareaId) : '',
      modalidad: selectedEventDetails.link ? 'virtual' : 'presencial',
      lugar: (selectedEventDetails.lugar as 'Oficina Ing. Luis' | 'Comedor') || 'Oficina Ing. Luis',
      link: selectedEventDetails.link || '',
    });

    setIsEditing(true);
  };

  // 📅⏰ CAMBIO RÁPIDO DE DÍA/HORA (sin abrir el modal completo ni depender del
  // arrastre nativo, que resultó no ser confiable en este entorno). `nuevaFechaStr`
  // y `nuevaHoraStr` son ambos opcionales: cada input del popover (fecha, hora) manda
  // solo el que cambió, y el otro se conserva del evento actual.
  const handleQuickChangeFechaHora = async (
    event: MeetingEvent,
    nuevaFechaStr?: string,
    nuevaHoraStr?: string
  ) => {
    const startOriginal = new Date(event.start);
    const endOriginal = new Date(event.end);
    const duracionMs = Math.max(15 * 60000, endOriginal.getTime() - startOriginal.getTime());

    const fechaActual = `${startOriginal.getFullYear()}-${String(startOriginal.getMonth() + 1).padStart(2, '0')}-${String(startOriginal.getDate()).padStart(2, '0')}`;
    const horaActual = `${String(startOriginal.getHours()).padStart(2, '0')}:${String(startOriginal.getMinutes()).padStart(2, '0')}`;

    const fecha = nuevaFechaStr || fechaActual;
    const hora = nuevaHoraStr || horaActual;
    if (!fecha || !hora) return;

    const esMarcadorFechaLimite = event.estado === 'Fecha Límite';
    const nuevoInicio = new Date(`${fecha}T${hora}:00`);
    const nuevoFin = new Date(nuevoInicio.getTime() + duracionMs);

    const isoInicio = nuevoInicio.toISOString();
    const isoFin = nuevoFin.toISOString();

    try {
      setLoading(true);

      const payload: any = {
        fecha_inicio: isoInicio,
        fecha_fin: isoFin,
        fecha,
        hora,
      };
      if (!esMarcadorFechaLimite) {
        payload.estado = 'Ajuste por tiempo';
      }

      const { error } = await (supabase.from('reuniones') as any)
        .update(payload)
        .eq('id', event.id);

      if (error) throw error;

      if (esMarcadorFechaLimite && event.tareaId) {
        const { error: tareaErr } = await (supabase.from('tareas') as any)
          .update({ fecha_limite: fecha })
          .eq('id', event.tareaId);

        if (tareaErr) {
          alert('Se movió el marcador, pero no se pudo actualizar la fecha límite de la tarea: ' + tareaErr.message);
        } else {
          setTareasList(prev => prev.map(t =>
            t.id === event.tareaId ? { ...t, fecha_limite: fecha } : t
          ));
        }
      }

      const eventoActualizado = {
        ...event,
        start: isoInicio,
        end: isoFin,
        estado: esMarcadorFechaLimite ? 'Fecha Límite' : 'Ajuste por tiempo',
        tareaDueDate: esMarcadorFechaLimite ? fecha : event.tareaDueDate,
      };

      setEventsList(prev => prev.map(ev => (ev.id === event.id ? eventoActualizado : ev)));
      setPopoverState(prev => (prev.event?.id === event.id ? { ...prev, event: eventoActualizado } : prev));
    } catch (err: any) {
      alert('No se pudo cambiar la fecha/hora: ' + (err.message || 'Error de conexión'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventDetails) return;

    // 📅 Sustituto del arrastre nativo (que no dispara `eventChange` de forma
    // confiable en este entorno): este formulario SÍ funciona porque es un submit
    // normal, no depende del drag-and-drop del navegador/FullCalendar.
    const esMarcadorFechaLimite = selectedEventDetails.estado === 'Fecha Límite';

    if (!esMarcadorFechaLimite && formData.modalidad === 'virtual' && !formData.link.trim()) {
      return alert('Genera o ingresa un enlace de Zoom para la revisión virtual.');
    }

    try {
      setLoading(true);
      const startDateTime = new Date(`${formData.fecha}T${formData.hora_inicio}:00`);
      const endDateTime = new Date(startDateTime.getTime() + parseInt(formData.duracion_minutos) * 60000);

      const payload: any = {
        titulo: formData.titulo.trim(),
        proyecto_id: formData.proyecto_id,
        empleado_id: formData.empleado_id || null,
        descripcion: formData.descripcion.trim() || null,
        fecha_inicio: startDateTime.toISOString(),
        fecha_fin: endDateTime.toISOString(),
        fecha: formData.fecha,
        hora: formData.hora_inicio,
        tarea_id: formData.tarea_id ? parseInt(formData.tarea_id, 10) : null,
      };

      // Un marcador de Fecha Límite debe seguir siendo 'Fecha Límite' (no
      // 'Ajuste por tiempo', que es el estado de las reuniones reales) y no tiene
      // modalidad/lugar/link — es solo un aviso informativo.
      if (!esMarcadorFechaLimite) {
        payload.estado = 'Ajuste por tiempo';
        const esPresencial = formData.modalidad === 'presencial';
        payload.link = esPresencial ? null : formData.link.trim();
        payload.lugar = esPresencial ? formData.lugar : null;
      }

      const { error } = await (supabase.from('reuniones') as any)
        .update(payload)
        .eq('id', selectedEventDetails.id);

      if (error) throw error;

      // La fecha_limite real de la tarea vinculada es la fuente de verdad que usa
      // el resto de la app (historial, widget de Actividades, notificaciones).
      if (esMarcadorFechaLimite && selectedEventDetails.tareaId) {
        const { error: tareaErr } = await (supabase.from('tareas') as any)
          .update({ fecha_limite: formData.fecha })
          .eq('id', selectedEventDetails.tareaId);

        if (tareaErr) {
          alert('Se movió el marcador, pero no se pudo actualizar la fecha límite de la tarea: ' + tareaErr.message);
        } else {
          setTareasList(prev => prev.map(t =>
            t.id === selectedEventDetails.tareaId ? { ...t, fecha_limite: formData.fecha } : t
          ));
        }
      }

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
      const { error } = await (supabase.from('reuniones') as any).delete().eq('id', id);
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
      <header className="flex flex-wrap justify-between items-center gap-2 shrink-0 bg-white border border-slate-200 rounded-lg p-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800 tracking-tight">
            📅 Calendario de Revisiones
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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

      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-y-auto lg:overflow-y-hidden lg:overflow-x-auto">
        {/* Barra Lateral Izquierda */}
        <div className="w-full lg:w-56 xl:w-64 lg:shrink-0 flex flex-col gap-2.5 lg:min-h-0 lg:overflow-y-auto pr-0.5">
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs p-3 shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
              Equipo
            </span>
            <p className="text-[9px] text-slate-400 mb-2.5">💡 Haz clic en un integrante para filtrar el calendario.</p>

            <div className="space-y-2.5">
              {([
                { key: 'gerencia', label: 'Gerencia', acento: 'border-violet-400', texto: 'text-violet-600', colapsable: false },
                { key: 'coordinador', label: 'Coordinadores', acento: 'border-sky-400', texto: 'text-sky-600', colapsable: false },
                { key: 'trabajador', label: 'Trabajadores', acento: 'border-emerald-400', texto: 'text-emerald-600', colapsable: true },
              ] as const).map(grupo => {
                const miembros = empleadosPorNivel[grupo.key];
                // Los grupos chicos (Gerencia/Coordinadores) van siempre visibles;
                // "Trabajadores" es el que más crece, así que arranca colapsado
                // (solo el conteo) para que el panel nunca necesite scroll interno.
                const isOpen = !grupo.colapsable || trabajadoresExpanded;
                return (
                  <div key={grupo.key}>
                    <button
                      type="button"
                      onClick={() => grupo.colapsable && setTrabajadoresExpanded(prev => !prev)}
                      className={`w-full flex items-center justify-between mb-1.5 ${grupo.colapsable ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${grupo.texto}`}>
                        {grupo.label}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">
                          {miembros.length}
                        </span>
                        {grupo.colapsable && (
                          <span className="text-[9px] text-slate-400">{isOpen ? '▲' : '▼'}</span>
                        )}
                      </span>
                    </button>

                    {isOpen && grupo.key === 'trabajador' && (
                      <div className={`space-y-1.5 border-l-2 ${grupo.acento} pl-2`}>
                        {miembros.length === 0 ? (
                          <p className="text-[10px] text-slate-300 italic">Sin integrantes</p>
                        ) : (
                          [...AREAS, 'Sin área'].map(area => {
                            const miembrosArea = trabajadoresPorArea[area] || [];
                            if (miembrosArea.length === 0) return null;
                            const areaOpen = expandedArea === area;
                            return (
                              <div key={area}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedArea(prev => (prev === area ? null : area))}
                                  className="w-full flex items-center justify-between cursor-pointer"
                                >
                                  <span className="text-[9px] font-bold text-slate-500">{area}</span>
                                  <span className="flex items-center gap-1 shrink-0">
                                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">
                                      {miembrosArea.length}
                                    </span>
                                    <span className="text-[9px] text-slate-400">{areaOpen ? '▲' : '▼'}</span>
                                  </span>
                                </button>

                                {areaOpen && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {miembrosArea.map(emp => {
                                      const activo = selectedEmployeeFilter === emp.id;
                                      return (
                                        <button
                                          type="button"
                                          key={emp.id}
                                          onClick={() => setSelectedEmployeeFilter(prev => (prev === emp.id ? 'all' : emp.id))}
                                          title={`Filtrar por ${emp.nombre}`}
                                          className={`inline-flex items-center gap-1 border rounded-full pl-1 pr-2 py-0.5 max-w-full cursor-pointer transition-colors ${
                                            activo ? 'bg-sky-100 border-sky-300' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                                          }`}
                                        >
                                          <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: emp.color || '#0ea5e9' }}
                                          />
                                          <span className="text-[10px] font-medium text-slate-700 truncate max-w-[7rem]">{emp.nombre}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {isOpen && grupo.key !== 'trabajador' && (
                      <div className={`flex flex-wrap gap-1 border-l-2 ${grupo.acento} pl-2`}>
                        {miembros.length === 0 ? (
                          <p className="text-[10px] text-slate-300 italic">Sin integrantes</p>
                        ) : (
                          miembros.map(emp => {
                            const activo = selectedEmployeeFilter === emp.id;
                            return (
                              <button
                                type="button"
                                key={emp.id}
                                onClick={() => setSelectedEmployeeFilter(prev => (prev === emp.id ? 'all' : emp.id))}
                                title={`Filtrar por ${emp.nombre}`}
                                className={`inline-flex items-center gap-1 border rounded-full pl-1 pr-2 py-0.5 max-w-full cursor-pointer transition-colors ${
                                  activo ? 'bg-sky-100 border-sky-300' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                                }`}
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: emp.color || '#0ea5e9' }}
                                />
                                <span className="text-[10px] font-medium text-slate-700 truncate max-w-[7rem]">{emp.nombre}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {soloEmpleadosList.length === 0 && (
              <p className="text-[10px] text-slate-400 mt-2">Sin empleados registrados.</p>
            )}
          </div>

          {selectedEmployeeFilter !== 'all' && (
            <div className="bg-sky-50 border border-sky-200 rounded-lg shadow-2xs p-2 flex items-center justify-between gap-2 shrink-0">
              <span className="text-[10px] font-bold text-sky-700 truncate">
                🔎 Filtrando por: {soloEmpleadosList.find(e => e.id === selectedEmployeeFilter)?.nombre || '—'}
              </span>
              <button
                type="button"
                onClick={() => setSelectedEmployeeFilter('all')}
                title="Quitar filtro"
                className="shrink-0 text-sky-600 hover:text-sky-800 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs divide-y divide-slate-100 overflow-hidden shrink-0">
            {([
              { key: 'hoy', label: 'Actividades Hoy', color: 'bg-sky-500', items: actividadesStats.hoy },
              { key: 'agendadas', label: 'Actividades Agendadas', color: 'bg-slate-900', items: actividadesStats.agendadas },
              { key: 'pasadas', label: 'Reuniones Pasadas', color: 'bg-slate-400', items: actividadesStats.pasadas },
              { key: 'vencidas', label: 'Actividades Vencidas', color: 'bg-red-500', items: actividadesStats.vencidas },
            ] as const).map(cat => {
              const isOpen = expandedCategoria === cat.key;
              return (
                <div key={cat.key}>
                  <div className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors">
                    <button
                      type="button"
                      onClick={() => setExpandedCategoria(isOpen ? null : cat.key)}
                      className="flex-1 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide cursor-pointer"
                    >
                      {cat.label}
                    </button>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {cat.items.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setDetalleCategoria({ label: cat.label, items: cat.items as unknown as ActividadItem[] })}
                          title="Ver detalle"
                          className="text-[10px] text-slate-400 hover:text-sky-600 transition-colors cursor-pointer"
                        >
                          🔍
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedCategoria(isOpen ? null : cat.key)}
                        className={`w-6 h-6 rounded-full ${cat.color} text-white text-[11px] font-bold flex items-center justify-center cursor-pointer`}
                      >
                        {cat.items.length}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedCategoria(isOpen ? null : cat.key)}
                        className={`text-slate-400 text-[9px] transition-transform cursor-pointer ${isOpen ? 'rotate-180' : ''}`}
                      >
                        ▼
                      </button>
                    </span>
                  </div>

                  {isOpen && (
                    <div className="bg-slate-50 px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
                      {cat.items.length === 0 ? (
                        <p className="text-[10px] text-slate-400 text-center py-1">Sin elementos.</p>
                      ) : (
                        cat.items.map(item => (
                          <div key={item.id} className="text-[10px] text-slate-700 bg-white border border-slate-100 rounded px-2 py-1.5">
                            <div className="font-semibold truncate">{item.titulo}</div>
                            <div className="text-slate-400 font-mono">
                              {item.fecha
                                ? (item.fecha.length === 10
                                    ? item.fecha.split('-').reverse().join('/')
                                    : new Date(item.fecha).toLocaleDateString('es-ES'))
                                : 'Sin fecha'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CONTENEDOR DEL CALENDARIO */}
        <div className="flex-1 min-w-0 min-h-[500px] h-full bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden relative p-2.5 flex flex-col
        [&_.fc]:!h-full [&_.fc-view-harness]:!h-full
        [&_.fc-theme-standard_td]:!border-slate-100
        [&_.fc-theme-standard_th]:!border-slate-100
        [&_.fc-theme-standard_.fc-scrollgrid]:!border-slate-200
        [&_.fc-col-header-cell]:!bg-white [&_.fc-col-header-cell]:!py-1.5
        [&_.fc-col-header-cell-cushion]:!text-slate-700 [&_.fc-col-header-cell-cushion]:!text-[11px] [&_.fc-col-header-cell-cushion]:!font-semibold
        [&_.fc-timegrid-slot-label-cushion]:!text-slate-500 [&_.fc-timegrid-slot-label-cushion]:!text-[10px] [&_.fc-timegrid-slot-label-cushion]:!font-normal
        [&_.fc-timegrid-slot-minor]:!border-none
        [&_.fc-toolbar-title]:!text-xs [&_.fc-toolbar-title]:!font-bold [&_.fc-toolbar-title]:!text-slate-800
        [&_.fc-button-primary]:!bg-white [&_.fc-button-primary]:!text-slate-700 [&_.fc-button-primary]:!border-slate-200 [&_.fc-button-primary]:!text-[10px] [&_.fc-button-primary]:!font-semibold [&_.fc-button-primary]:!py-1 [&_.fc-button-primary]:!px-2.5 [&_.fc-button-primary]:hover:!bg-slate-50
        [&_.fc-button-active]:!bg-slate-900 [&_.fc-button-active]:!text-white [&_.fc-button-active]:!border-slate-900
        [&_.fc-daygrid-dot-event_.fc-event-title]:!text-slate-800
        [&_.fc-daygrid-day-number]:!text-slate-700 [&_.fc-daygrid-day-number]:!text-[10px]
        [&_.fc-timegrid-event-harness]:!overflow-visible
        [&_.fc-timegrid-col-events]:!overflow-visible
        [&_.fc-event]:!bg-transparent [&_.fc-event]:!border-none [&_.fc-event]:!shadow-none [&_.fc-event]:!p-0 [&_.fc-event]:!overflow-visible"
        >
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            height="100%"
            expandRows={true}
            stickyHeaderDates={true}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            locales={[esLocale]}
            locale="es"
            // Arrastrar eventos quedó deshabilitado: en este entorno el drag-and-drop
            // nativo no disparaba `eventChange`/`eventDrop` de forma confiable (el
            // evento se veía mover pero nunca llegaba a guardarse). Cambiar día/hora
            // ahora se hace con los selectores del popover (📅⏰) o el botón "Editar".
            editable={false}
            selectable={true}
            selectMirror={true}
            dateClick={(info) => {
              const clickedDate = info.dateStr.split('T')[0];
              const clickedTime = info.dateStr.includes('T') ? info.dateStr.split('T')[1].substring(0, 5) : '10:00';
              handleOpenCreateModal(clickedDate, clickedTime);
            }}
            allDaySlot={false}
            hiddenDays={[0]}
            slotMinTime="09:00:00"
            slotMaxTime="21:00:00"
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
            eventContent={(eventInfo) => {
              const estadoEv = eventInfo.event.extendedProps.estado;
              const empleadoIdEv = eventInfo.event.extendedProps.empleado_id;
              const esGrupalEv = eventInfo.event.extendedProps.esGrupal;
              const isCompleted = estadoEv === 'Completada';
              const isDeadline = estadoEv === 'Fecha Límite';
              const isMonthView = eventInfo.view.type === 'dayGridMonth';

              const badgeColor = isDeadline
                ? '#dc2626'
                : isCompleted
                  ? '#059669'
                  : esGrupalEv
                    ? '#64748b'
                    : (getColorEmpleado(empleadoIdEv) || '#0284c7');
              const badgeIcon = isDeadline ? '⏳' : esGrupalEv ? '👥' : '1';

              if (isMonthView) {
                return (
                  <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-2xs truncate hover:opacity-90 transition-opacity cursor-pointer"
                    style={{ backgroundColor: badgeColor }}
                  >
                    <span className="pointer-events-none">{isDeadline ? '⏳' : esGrupalEv ? '👥' : '●'}</span>
                    <span className="truncate pointer-events-none">{eventInfo.event.title}</span>
                  </div>
                );
              }

              return (
                <div className="flex items-center justify-center h-full w-full py-1">
                  <div
                    className="w-6 h-6 min-w-[24px] min-h-[24px] rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-md hover:scale-115 active:scale-95 transition-transform shrink-0 cursor-pointer select-none"
                    style={{ backgroundColor: badgeColor }}
                    title={`${eventInfo.event.title} (click para ver detalles)`}
                  >
                    <span className="pointer-events-none">{badgeIcon}</span>
                  </div>
                </div>
              );
            }}
          />
        </div>
      </div>

      {/* POPOVER / TOOLTIP FLOTANTE */}
      {popoverState.visible && popoverState.event && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 bg-white border border-slate-200/90 rounded-xl shadow-xl w-[calc(100vw-2rem)] max-w-80 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: `${Math.max(8, Math.min(popoverState.y, window.innerHeight - 220))}px`,
            left: `${Math.max(8, Math.min(popoverState.x, window.innerWidth - 340))}px`
          }}
        >
          <div className="absolute -left-2 top-4 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-white drop-shadow-xs"></div>

          <div className="text-center py-2 px-3 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
            <span className={`text-xs font-bold ${popoverState.event.estado === 'Fecha Límite' ? 'text-red-500' : 'text-sky-500'}`}>
              {popoverState.event.estado === 'Fecha Límite' ? '⏳ Fecha Límite de Tarea' : 'Reunión / Llamada: 1'}
            </span>
          </div>

          <div className="p-3 space-y-2">
            <div className="flex items-start gap-2 bg-slate-50/80 p-2 rounded-lg border border-slate-100">
              <span className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${popoverState.event.estado === 'Fecha Límite' ? 'bg-red-500' : 'bg-sky-400'}`}>
                {popoverState.event.estado === 'Fecha Límite'
                  ? new Date(popoverState.event.start).toLocaleDateString('es-ES')
                  : new Date(popoverState.event.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-800 line-clamp-2">
                  {popoverState.event.title}
                </span>
                <span className="block text-[9px] text-slate-400 mt-1">
                  🔑 {popoverState.event.estado === 'Fecha Límite' ? 'Asignada por' : 'Agendada por'}: {popoverState.event.creadoPorNombre || 'Administración'}
                </span>
                <span className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="text-[9px] text-slate-400 shrink-0">
                    {popoverState.event.estado === 'Fecha Límite' ? 'Asignada a:' : 'Dirigida a:'}
                  </span>
                  {popoverState.event.esGrupal ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-dashed border-slate-400 text-slate-600 bg-slate-50">
                      <span>👥</span>
                      <span>General · Todo el equipo</span>
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-white max-w-full"
                      style={{
                        color: getColorEmpleado(popoverState.event.empleado_id),
                        borderColor: getColorEmpleado(popoverState.event.empleado_id),
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: getColorEmpleado(popoverState.event.empleado_id) }}
                      />
                      <span className="truncate">{popoverState.event.empleado_nombre}</span>
                    </span>
                  )}
                  <span className="text-[9px] text-slate-500 truncate">📁 {popoverState.event.proyecto_nombre}</span>
                </span>
                {popoverState.event.tareaDueDate && popoverState.event.estado !== 'Fecha Límite' && (
                  <span className="block text-[10px] text-amber-700 font-bold mt-0.5">
                    ⏳ Límite: {formatFechaLimite(popoverState.event.tareaDueDate)}
                  </span>
                )}
                {(() => {
                  const s = new Date(popoverState.event.start);
                  const valorFecha = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
                  const valorHora = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
                  return (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <label className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
                        <span>📅</span>
                        <input
                          type="date"
                          defaultValue={valorFecha}
                          disabled={loading}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleQuickChangeFechaHora(popoverState.event!, e.target.value, undefined)}
                          className="border border-slate-300 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-800 outline-none focus:ring-1 focus:ring-red-400 cursor-pointer disabled:opacity-50"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
                        <span>⏰</span>
                        <input
                          type="time"
                          defaultValue={valorHora}
                          disabled={loading}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleQuickChangeFechaHora(popoverState.event!, undefined, e.target.value)}
                          className="border border-slate-300 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-800 outline-none focus:ring-1 focus:ring-red-400 cursor-pointer disabled:opacity-50"
                        />
                      </label>
                    </div>
                  );
                })()}
              </div>
            </div>

            {popoverState.event.estado !== 'Fecha Límite' && (
              popoverState.event.link ? (
                <a
                  href={popoverState.event.link}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="block text-[10px] text-blue-700 font-bold bg-blue-50 border border-blue-100 px-2 py-1 rounded hover:bg-blue-100"
                >
                  🎥 Unirse a Zoom
                </a>
              ) : (
                <p className="text-[10px] text-slate-500 font-semibold bg-slate-50 border border-slate-100 px-2 py-1 rounded">
                  📍 {popoverState.event.lugar || 'Oficina Ing. Luis'}
                </p>
              )
            )}

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

      {/* MODAL CREAR NUEVA SESIÓN */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <span className="text-xs font-bold text-slate-800">
                {createMode === 'reunion' ? '➕ Agendar Nueva Sesión / Revisión' : '📋 Asignar Tarea'}
              </span>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer">✕</button>
            </div>

            <div className="flex bg-slate-100 p-1 mx-4 mt-3 rounded-lg gap-1 text-xs">
              <button
                type="button"
                onClick={() => setCreateMode('reunion')}
                className={`flex-1 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                  createMode === 'reunion' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                }`}
              >
                🗓️ Agendar Reunión
              </button>
              <button
                type="button"
                onClick={() => setCreateMode('tarea')}
                className={`flex-1 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                  createMode === 'tarea' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
                }`}
              >
                📋 Asignar Tarea
              </button>
            </div>

            {createMode === 'reunion' && (
            <form onSubmit={handleCreateMeeting} className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Título de la Sesión</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Revisión Sprint 1"
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Modalidad</label>
                <div className="flex bg-slate-100 p-1 rounded-md gap-1">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, modalidad: 'presencial' })}
                    className={`flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                      formData.modalidad === 'presencial' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    🏢 Presencial
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, modalidad: 'virtual' })}
                    className={`flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                      formData.modalidad === 'virtual' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    🎥 Virtual (Zoom)
                  </button>
                </div>
              </div>

              {formData.modalidad === 'presencial' ? (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">📍 Lugar</label>
                  <div className="flex bg-slate-100 p-1 rounded-md gap-1">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, lugar: 'Oficina Ing. Luis' })}
                      className={`flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                        formData.lugar === 'Oficina Ing. Luis' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      🏢 Oficina Ing. Luis
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, lugar: 'Comedor' })}
                      className={`flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                        formData.lugar === 'Comedor' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      🍽️ Comedor
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">Enlace de Zoom</label>
                    <button
                      type="button"
                      onClick={handleGenerateZoomMeeting}
                      disabled={isGeneratingZoom}
                      className="text-[10px] text-blue-600 font-bold hover:underline bg-blue-50 px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      {isGeneratingZoom ? 'Generando...' : '✨ Generar Enlace Zoom'}
                    </button>
                  </div>
                  <input
                    type="url"
                    required
                    placeholder="https://us05web.zoom.us/j/123456789..."
                    value={formData.link}
                    onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Proyecto</label>
                  <select
                    value={formData.proyecto_id}
                    onChange={(e) => setFormData({ ...formData, proyecto_id: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                  >
                    {proyectosList.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Empleado</label>
                  <select
                    value={formData.empleado_id}
                    onChange={(e) => setFormData({ ...formData, empleado_id: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                  >
                    <option value="">General · Todo el equipo</option>
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
                    required
                    value={formData.fecha}
                    onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Hora Inicio</label>
                  <input
                    type="time"
                    required
                    value={formData.hora_inicio}
                    onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Duración</label>
                  <select
                    value={formData.duracion_minutos}
                    onChange={(e) => setFormData({ ...formData, duracion_minutos: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hora</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Descripción / Notas</label>
                <textarea
                  rows={2}
                  placeholder="Temas a revisar..."
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsCreating(false)} className="px-3 py-1 border rounded text-xs cursor-pointer">Cancelar</button>
                <button type="submit" disabled={loading} className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded text-xs cursor-pointer">Guardar Sesión</button>
              </div>
            </form>
            )}

            {createMode === 'tarea' && (
            <form onSubmit={handleAssignTask} className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Integrante</label>
                <select
                  required
                  value={newTaskFormData.empleadoId}
                  onChange={(e) => setNewTaskFormData({ ...newTaskFormData, empleadoId: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                >
                  <option value="">— Selecciona un integrante —</option>
                  {soloEmpleadosList.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Título de la Tarea</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Integración de endpoint de autenticación"
                  value={newTaskFormData.titulo}
                  onChange={(e) => setNewTaskFormData({ ...newTaskFormData, titulo: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Proyecto</label>
                <select
                  required
                  value={newTaskFormData.proyectoId}
                  onChange={(e) => setNewTaskFormData({ ...newTaskFormData, proyectoId: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                >
                  <option value="">— Selecciona un proyecto —</option>
                  {proyectosList.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Prioridad</label>
                  <select
                    value={newTaskFormData.prioridad}
                    onChange={(e) => setNewTaskFormData({ ...newTaskFormData, prioridad: e.target.value as any })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                  >
                    <option value="Baja">🟢 Baja</option>
                    <option value="Media">🟡 Media</option>
                    <option value="Alta">🟠 Alta</option>
                    <option value="Urgente">🔴 Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Fecha Límite</label>
                  <input
                    type="date"
                    value={newTaskFormData.fechaLimite}
                    onChange={(e) => setNewTaskFormData({ ...newTaskFormData, fechaLimite: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Descripción / Indicaciones</label>
                <textarea
                  rows={2}
                  placeholder="Instrucciones específicas de la tarea..."
                  value={newTaskFormData.descripcion}
                  onChange={(e) => setNewTaskFormData({ ...newTaskFormData, descripcion: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsCreating(false)} className="px-3 py-1 border rounded text-xs cursor-pointer">Cancelar</button>
                <button type="submit" disabled={isSavingTask} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs cursor-pointer">
                  {isSavingTask ? 'Guardando...' : 'Asignar Tarea'}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL DETALLES / EDICIÓN EXISTENTE */}
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
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900 font-bold"
                  />
                </div>

                {selectedEventDetails.estado !== 'Fecha Límite' && (
                <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Modalidad</label>
                  <div className="flex bg-slate-100 p-1 rounded-md gap-1">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, modalidad: 'presencial' })}
                      className={`flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                        formData.modalidad === 'presencial' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      🏢 Presencial
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, modalidad: 'virtual' })}
                      className={`flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                        formData.modalidad === 'virtual' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      🎥 Virtual (Zoom)
                    </button>
                  </div>
                </div>

                {formData.modalidad === 'presencial' ? (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">📍 Lugar</label>
                    <div className="flex bg-slate-100 p-1 rounded-md gap-1">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, lugar: 'Oficina Ing. Luis' })}
                        className={`flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                          formData.lugar === 'Oficina Ing. Luis' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                        }`}
                      >
                        🏢 Oficina Ing. Luis
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, lugar: 'Comedor' })}
                        className={`flex-1 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                          formData.lugar === 'Comedor' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                        }`}
                      >
                        🍽️ Comedor
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[11px] font-bold text-slate-700">Enlace de Zoom</label>
                      <button
                        type="button"
                        onClick={handleGenerateZoomMeeting}
                        disabled={isGeneratingZoom}
                        className="text-[10px] text-blue-600 font-bold hover:underline bg-blue-50 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      >
                        {isGeneratingZoom ? 'Generando...' : '✨ Generar Enlace Zoom'}
                      </button>
                    </div>
                    <input
                      type="url"
                      required
                      placeholder="https://us05web.zoom.us/j/123456789..."
                      value={formData.link}
                      onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                    />
                  </div>
                )}
                </>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Proyecto</label>
                    <select
                      value={formData.proyecto_id}
                      onChange={(e) => setFormData({ ...formData, proyecto_id: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                    >
                      {proyectosList.map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Empleado</label>
                    <select
                      value={formData.empleado_id}
                      onChange={(e) => setFormData({ ...formData, empleado_id: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                    >
                      <option value="">General · Todo el equipo</option>
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
                      value={formData.fecha}
                      onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Hora</label>
                    <input
                      type="time"
                      value={formData.hora_inicio}
                      onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Duración</label>
                    <select
                      value={formData.duracion_minutos}
                      onChange={(e) => setFormData({ ...formData, duracion_minutos: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
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

                <div className="bg-slate-50 p-2.5 rounded text-black space-y-1">
                  <p>📁 <strong>Proyecto:</strong> {selectedEventDetails.proyecto_nombre}</p>

                  <p>🔑 <strong>{selectedEventDetails.estado === 'Fecha Límite' ? 'Asignada por:' : 'Agendada por:'}</strong> {selectedEventDetails.creadoPorNombre || 'Administración'}</p>

                  <div className="flex items-center gap-2 flex-wrap">
                    <strong>{selectedEventDetails.estado === 'Fecha Límite' ? 'Asignada a:' : 'Dirigida a:'}</strong>
                    {selectedEventDetails.esGrupal ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border border-dashed border-slate-400 text-slate-600 bg-white">
                        <span>👥</span>
                        <span>General · Todo el equipo</span>
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border bg-white"
                        style={{
                          color: getColorEmpleado(selectedEventDetails.empleado_id),
                          borderColor: getColorEmpleado(selectedEventDetails.empleado_id),
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: getColorEmpleado(selectedEventDetails.empleado_id) }}
                        />
                        <span>{selectedEventDetails.empleado_nombre}</span>
                      </span>
                    )}
                  </div>
                  {selectedEventDetails.tareaDueDate && selectedEventDetails.estado !== 'Fecha Límite' && (
                    <p className="text-amber-700 font-bold">⏳ <strong>Fecha límite de la tarea:</strong> {formatFechaLimite(selectedEventDetails.tareaDueDate)}</p>
                  )}
                  {selectedEventDetails.estado !== 'Fecha Límite' && (
                    selectedEventDetails.link ? (
                      <p>🎥 <strong>Modalidad:</strong> Virtual — <a href={selectedEventDetails.link} target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline">Unirse a Zoom</a></p>
                    ) : (
                      <p>📍 <strong>Modalidad:</strong> Presencial — {selectedEventDetails.lugar || 'Oficina Ing. Luis'}</p>
                    )
                  )}
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

      {/* MODAL DE DETALLE DE ACTIVIDADES (vista ampliada de una categoría del acordeón) */}
      {detalleCategoria && (
        <div
          onClick={() => setDetalleCategoria(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <span className="text-xs font-bold text-slate-800">
                {detalleCategoria.label} ({detalleCategoria.items.length})
              </span>
              <button onClick={() => setDetalleCategoria(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer">✕</button>
            </div>

            <div className="p-3 space-y-2 overflow-y-auto">
              {detalleCategoria.items.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Sin elementos.</p>
              ) : (
                detalleCategoria.items.map(item => (
                  <div key={item.id} className="border border-slate-200 rounded-lg p-2.5 flex items-start gap-2.5">
                    <span className="shrink-0 text-base leading-none mt-0.5">
                      {item.tipo === 'tarea' ? '📋' : '🗓️'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 break-words">{item.titulo}</p>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[10px] text-slate-500">
                        <span className="font-semibold text-slate-700">👤 {item.empleadoNombre}</span>
                        <span>🔑 {item.creadoPorNombre || 'Administración'}</span>
                        {item.proyectoNombre && <span>📁 {item.proyectoNombre}</span>}
                        <span className="font-mono">
                          📅 {item.fecha
                            ? (item.fecha.length === 10
                                ? item.fecha.split('-').reverse().join('/')
                                : new Date(item.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))
                            : 'Sin fecha'}
                        </span>
                        {item.estado && (
                          <span className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full">{item.estado}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}