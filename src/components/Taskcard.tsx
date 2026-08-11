'use client';

import React from 'react';

export interface TaskCardProps {
  id: string | number;
  title: string;
  projectName: string;
  description?: string;
  assignedByName?: string;
  dueDate?: string;
  priority: 'Baja' | 'Media' | 'Alta' | 'Urgente';
  status: 'Pendiente' | 'En Proceso' | 'Postergada' | 'Completada';
  progressPercent: number;
  collaborators?: { id: string; name: string; avatar?: string }[];
  isCritical?: boolean;
  slackDays?: number;
  onRequestReview?: () => void;
  onRequestExtension?: () => void;
}

export default function TaskCard({
  id,
  title,
  projectName,
  description,
  assignedByName = 'Administrador',
  dueDate,
  priority,
  status,
  progressPercent,
  collaborators = [],
  isCritical,
  slackDays,
  onRequestReview,
  onRequestExtension,
}: TaskCardProps) {

  // Colors & badges
  const priorityColors = {
    Baja: 'bg-slate-100 text-slate-700 border-slate-200',
    Media: 'bg-blue-50 text-blue-700 border-blue-200',
    Alta: 'bg-amber-50 text-amber-800 border-amber-200',
    Urgente: 'bg-red-50 text-red-700 border-red-200 animate-pulse',
  };

  const statusColors = {
    Pendiente: 'bg-slate-100 text-slate-700',
    'En Proceso': 'bg-blue-600 text-white',
    Postergada: 'bg-amber-500 text-white',
    Completada: 'bg-emerald-600 text-white',
  };

  return (
    <div className={`p-4 rounded-2xl border transition-all bg-white shadow-2xs hover:shadow-md space-y-3 relative overflow-hidden ${
      isCritical ? 'border-rose-300 ring-1 ring-rose-500/20' : 'border-slate-200/80'
    }`}>
      
      {/* Listón superior si es Ruta Crítica */}
      {isCritical && (
        <div className="absolute top-0 right-0 bg-rose-600 text-white text-[9px] font-bold px-3 py-0.5 rounded-bl-xl uppercase tracking-wider flex items-center gap-1 shadow-xs">
          ⚡ Ruta Crítica
        </div>
      )}

      {/* Encabezado de la Tarjeta */}
      <div className="flex items-start justify-between gap-2 pr-16">
        <div>
          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
            📁 {projectName}
          </span>
          <h4 className="font-bold text-slate-900 text-sm mt-1.5 leading-snug">{title}</h4>
        </div>
      </div>

      {/* Descripción / Indicaciones */}
      {description && (
        <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          {description}
        </p>
      )}

      {/* Barra de Progreso */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
          <span>Avance de Actividad</span>
          <span className="font-mono text-slate-800">{progressPercent}%</span>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
          <div 
            className={`h-full transition-all duration-300 ${
              status === 'Completada' ? 'bg-emerald-500' :
              status === 'Postergada' ? 'bg-amber-500' : 'bg-blue-600'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Meta Información (Prioridad, Asignada Por, Fecha Límite) */}
      <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] border-t border-slate-100/80">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Prioridad</span>
          <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold mt-0.5 ${priorityColors[priority]}`}>
            {priority}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Asignada Por</span>
          <span className="font-medium text-slate-800 truncate block mt-0.5">
            🔑 {assignedByName}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Fecha Límite</span>
          <span className="font-mono text-slate-700 font-medium block mt-0.5">
            📅 {dueDate || 'Sin fecha'}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Holgura Estimada</span>
          <span className={`font-mono text-[10px] font-bold block mt-0.5 ${
            isCritical ? 'text-rose-600' : 'text-emerald-600'
          }`}>
            {isCritical ? '0 días (Crítica)' : `+${slackDays || 0} días`}
          </span>
        </div>
      </div>

      {/* Colaboradores Asignados */}
      {collaborators.length > 0 && (
        <div className="pt-2 border-t border-slate-100/80">
          <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
            🤝 Equipo Colaborador ({collaborators.length})
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {collaborators.map((c) => (
              <span 
                key={c.id} 
                className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-800 text-[10px] font-semibold px-2 py-0.5 rounded-lg"
              >
                👤 {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Acciones Rápidas para el Empleado / Desarrollador */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${statusColors[status]}`}>
          {status}
        </span>

        {status !== 'Completada' && (
          <div className="flex gap-1.5">
            {onRequestExtension && (
              <button
                type="button"
                onClick={onRequestExtension}
                className="bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-800 border border-slate-200 hover:border-amber-300 font-bold px-2.5 py-1 rounded-xl text-[10px] transition-all cursor-pointer"
                title="Solicitar extensión de tiempo al Administrador"
              >
                ⏱️ Tiempo Extra
              </button>
            )}

            {onRequestReview && (
              <button
                type="button"
                onClick={onRequestReview}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1 rounded-xl text-[10px] transition-all shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <span>🚀</span>
                <span>Entregar / Revisión</span>
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );
}