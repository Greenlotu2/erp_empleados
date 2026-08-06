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

// Interfaz adaptada a las columnas reales de 'reuniones'
interface HistorialRevision {
  id: string;
  title: string;
  project: string;
  empleado: string;
  fecha: string;
  estado: string;
  notas: string;
}

export default function RevisionesPage() {
  const [activeTab, setActiveTab] = useState<'calendario' | 'historial'>('calendario');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [historial, setHistorial] = useState<HistorialRevision[]>([]);
  const [loading, setLoading] = useState(true);

// 🔄 CARGA DE REVISIONES Y REUNIONES DESDE SUPABASE
  const fetchRevisiones = async () => {
    try {
      setLoading(true);
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
          project: item.proyectos?.nombre || 'General',
          empleado: item.empleados?.nombre || 'Integrante',
          fecha: item.fecha_inicio ? item.fecha_inicio.split('T')[0] : 'Sin fecha',
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
        
        {/* ENCABEZADO CON CONTROL DE PESTAÑAS */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Gestión de Revisiones</h1>
            <p className="text-xs text-slate-500">
              Supervisa reuniones en el calendario y consulta el historial de ajustes de la Ruta Crítica
            </p>
          </div>

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
              📜 Historial de Revisiones ({historial.length})
            </button>
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
                <option value="Completado">Completado</option>
                <option value="Ajuste por tiempo">Ajuste por tiempo</option>
                <option value="Programada">Programada</option>
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
                      <th className="p-3">Empleado</th>
                      <th className="p-3">Fecha</th>
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
                        <td className="p-3 font-semibold text-slate-800">{rev.empleado}</td>
                        <td className="p-3 font-mono">{rev.fecha}</td>
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
    </div>
  );
}