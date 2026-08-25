'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Sidebar from '../../../components/Sidebar';
import { supabase } from '../../../lib/supabaseClient';
import { formatFechaLimite } from '../../../lib/dates';

const AREAS = ['Administrativo y RRHH', 'Proyectos y Obra', 'TICs', 'Financiero-Contable'] as const;
type Area = (typeof AREAS)[number];

interface Empleado {
  id: string;
  nombre: string;
  nivel?: string | null;
  area?: string | null;
  color?: string | null;
  horas_acumuladas?: number | null;
}

interface Tarea {
  id: number;
  empleado_id: string | null;
  estado: string | null;
  fecha_limite: string | null;
  proyecto_id: string | null;
}

interface Proyecto {
  id: string;
  nombre: string;
}

interface ArchivoArea {
  id: number;
  area: string;
  nombre_archivo: string;
  archivo_path: string;
  subido_por: string | null;
  created_at: string;
}

const isTareaCerrada = (estado: string | null) => {
  const e = (estado || '').toLowerCase();
  return e === 'completada' || e === 'completado' || e === 'cancelada' || e === 'rechazada';
};

export default function EquiposPage() {
  const [activeArea, setActiveArea] = useState<Area>(AREAS[0]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('all');
  const [archivos, setArchivos] = useState<ArchivoArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [{ data: empData }, { data: tareaData }, { data: proyData }, { data: archivoData }] = await Promise.all([
        (supabase.from('empleados') as any).select('id, nombre, nivel, area, color, horas_acumuladas'),
        (supabase.from('tareas') as any).select('id, empleado_id, estado, fecha_limite, proyecto_id'),
        (supabase.from('proyectos') as any).select('id, nombre'),
        (supabase.from('equipo_archivos') as any).select('*').order('created_at', { ascending: false }),
      ]);
      setEmpleados(empData || []);
      setTareas(tareaData || []);
      setProyectos(proyData || []);
      setArchivos(archivoData || []);
    } catch (err) {
      console.error('Error cargando datos de Equipos/Áreas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Ids de empleados con al menos una tarea (no cerrada) en el proyecto seleccionado.
  // Con "Todos los proyectos" no se filtra nada.
  const empleadosConProyecto = useMemo(() => {
    if (selectedProjectFilter === 'all') return null;
    const ids = new Set<string>();
    tareas.forEach(t => {
      if (t.proyecto_id === selectedProjectFilter && t.empleado_id && !isTareaCerrada(t.estado)) {
        ids.add(t.empleado_id);
      }
    });
    return ids;
  }, [tareas, selectedProjectFilter]);

  const empleadosDeArea = useMemo(() => {
    return empleados.filter(e =>
      e.area === activeArea && (!empleadosConProyecto || empleadosConProyecto.has(e.id))
    );
  }, [empleados, activeArea, empleadosConProyecto]);

  const coordinador = useMemo(
    () => empleadosDeArea.find(e => (e.nivel || '').toLowerCase().includes('coordin')) || null,
    [empleadosDeArea]
  );

  const trabajadores = useMemo(
    () => empleadosDeArea.filter(e => e.id !== coordinador?.id),
    [empleadosDeArea, coordinador]
  );

  // 📊 Reporte automático del área: calculado con datos reales de `tareas` y
  // `empleados`, sin necesidad de subir nada — mismo criterio de "cerrada" que
  // usa el panel de KPIs/calendario.
  const reporte = useMemo(() => {
    const idsArea = new Set(empleadosDeArea.map(e => e.id));
    const tareasArea = tareas.filter(t =>
      t.empleado_id && idsArea.has(t.empleado_id) &&
      (selectedProjectFilter === 'all' || t.proyecto_id === selectedProjectFilter)
    );
    const hoyStr = new Date().toISOString().split('T')[0];

    const completadas = tareasArea.filter(t => isTareaCerrada(t.estado) && (t.estado || '').toLowerCase().includes('completa'));
    const vencidas = tareasArea.filter(t => t.fecha_limite && t.fecha_limite < hoyStr && !isTareaCerrada(t.estado));
    const enProceso = tareasArea.filter(t => !isTareaCerrada(t.estado) && !(t.fecha_limite && t.fecha_limite < hoyStr));
    const cumplimiento = tareasArea.length > 0 ? Math.round((completadas.length / tareasArea.length) * 100) : null;
    const horasTotales = empleadosDeArea.reduce((sum, e) => sum + (e.horas_acumuladas || 0), 0);

    return {
      totalTareas: tareasArea.length,
      completadas: completadas.length,
      vencidas: vencidas.length,
      enProceso: enProceso.length,
      cumplimiento,
      horasTotales,
    };
  }, [tareas, empleadosDeArea, selectedProjectFilter]);

  const archivosArea = useMemo(
    () => archivos.filter(a => a.area === activeArea),
    [archivos, activeArea]
  );

  const handleUploadFile = async (file: File) => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const path = `equipos/${activeArea}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      const { error: uploadErr } = await supabase.storage.from('documentacion').upload(path, file);
      if (uploadErr) throw uploadErr;

      const { error: dbErr } = await (supabase.from('equipo_archivos') as any).insert({
        area: activeArea,
        nombre_archivo: file.name,
        archivo_path: path,
        tipo_mime: file.type || null,
      });
      if (dbErr) throw dbErr;

      await fetchAll();
    } catch (err: any) {
      console.error('Error subiendo archivo:', err);
      alert('No se pudo subir el archivo: ' + (err.message || 'Error de conexión'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (archivo: ArchivoArea) => {
    if (!confirm(`¿Eliminar "${archivo.nombre_archivo}"? Esta acción no se puede deshacer.`)) return;

    try {
      await supabase.storage.from('documentacion').remove([archivo.archivo_path]);
      const { error } = await (supabase.from('equipo_archivos') as any).delete().eq('id', archivo.id);
      if (error) throw error;
      await fetchAll();
    } catch (err: any) {
      console.error('Error eliminando archivo:', err);
      alert('No se pudo eliminar el archivo: ' + (err.message || 'Error de conexión'));
    }
  };

  const getFileUrl = (path: string) => supabase.storage.from('documentacion').getPublicUrl(path).data.publicUrl;

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden select-none">
      <Sidebar />

      <main className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden h-full min-w-0">
        <header className="mb-4 shrink-0">
          <h1 className="text-xl font-bold text-slate-900">Equipos / Áreas</h1>
          <p className="text-xs text-slate-500">Archivos y reporte de avance por área, según el organigrama</p>
        </header>

        {/* Tabs de área + filtro por proyecto */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 shrink-0">
          <div className="flex flex-wrap gap-2">
            {AREAS.map(area => (
              <button
                key={area}
                type="button"
                onClick={() => setActiveArea(area)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeArea === area
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {area}
              </button>
            ))}
          </div>

          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 text-xs font-medium py-2 px-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">📁 Todos los proyectos</option>
            {proyectos.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-xs font-bold text-slate-500 gap-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            Cargando información del área...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0 pb-2">
            {/* Columna: Equipo del área */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Equipo</h2>

              {coordinador && (
                <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: coordinador.color || '#0ea5e9' }} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{coordinador.nombre}</p>
                    <p className="text-[10px] text-sky-700 font-semibold">🧩 Coordinador(a) del área</p>
                  </div>
                </div>
              )}

              {trabajadores.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Sin trabajadores asignados a esta área.</p>
              ) : (
                <div className="space-y-1.5">
                  {trabajadores.map(emp => (
                    <div key={emp.id} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: emp.color || '#0ea5e9' }} />
                      <span className="text-xs text-slate-700 font-medium truncate">{emp.nombre}</span>
                    </div>
                  ))}
                </div>
              )}

              {empleadosDeArea.length === 0 && (
                <p className="text-[11px] text-slate-400 italic">
                  {selectedProjectFilter === 'all'
                    ? 'Nadie tiene esta área asignada todavía. Configúrala desde el Panel Principal, al editar cada integrante.'
                    : 'Nadie de esta área tiene tareas activas en el proyecto seleccionado.'}
                </p>
              )}
            </div>

            {/* Columna: Reporte automático */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Reporte del Área</h2>
              <p className="text-[10px] text-slate-400 -mt-2">Calculado en tiempo real desde las tareas del equipo.</p>

              {reporte.totalTareas === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Sin tareas registradas para este equipo todavía.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-extrabold text-slate-900">{reporte.cumplimiento ?? '—'}%</p>
                    <p className="text-[9px] text-slate-500 font-semibold uppercase">Cumplimiento</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-extrabold text-slate-900">{reporte.totalTareas}</p>
                    <p className="text-[9px] text-slate-500 font-semibold uppercase">Tareas Totales</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-extrabold text-emerald-700">{reporte.completadas}</p>
                    <p className="text-[9px] text-emerald-600 font-semibold uppercase">Completadas</p>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-extrabold text-red-700">{reporte.vencidas}</p>
                    <p className="text-[9px] text-red-600 font-semibold uppercase">Vencidas</p>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-700 uppercase">Horas Acumuladas (equipo)</span>
                <span className="text-xs font-extrabold text-blue-900">{reporte.horasTotales.toFixed(1)} hrs</span>
              </div>
            </div>

            {/* Columna: Archivos */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 flex flex-col min-h-0">
              <div className="flex items-center justify-between shrink-0">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Archivos</h2>
                <label className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  uploading ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}>
                  {uploading ? 'Subiendo...' : '+ Subir Archivo'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadFile(file);
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
                {archivosArea.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">Sin archivos subidos para esta área todavía.</p>
                ) : (
                  archivosArea.map(archivo => (
                    <div key={archivo.id} className="border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2">
                      <a
                        href={getFileUrl(archivo.archivo_path)}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 text-[11px] font-semibold text-blue-700 hover:underline truncate"
                        title={archivo.nombre_archivo}
                      >
                        📄 {archivo.nombre_archivo}
                      </a>
                      <span className="text-[9px] text-slate-400 shrink-0">{formatFechaLimite(archivo.created_at)}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(archivo)}
                        title="Eliminar archivo"
                        className="shrink-0 text-red-500 hover:text-red-700 text-xs cursor-pointer"
                      >
                        🗑️
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
