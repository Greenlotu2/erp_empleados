'use client';

import React, { useState, useEffect } from 'react';

export default function EmpleadoPage() {
  const [status, setStatus] = useState<'Disponible' | 'Ocupado'>('Disponible');
  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const simulateTask = () => {
    setCurrentTask('Revisión de flujos de trabajo en el módulo del empleado.');
    setStatus('Ocupado');
  };

  if (!isMounted) return <div className="p-4 text-slate-400 text-xs">Cargando...</div>;

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col justify-between p-4 font-sans select-none">
      <div className="bg-[#111827] p-4 rounded-xl border border-[#1f2937] flex justify-between items-center shadow-md">
        <div>
          <h2 className="font-bold text-sm text-white">Luis Martínez</h2>
          <p className="text-[10px] text-blue-500 font-medium">QA Tester</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status === 'Disponible' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
          {status}
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center my-4">
        {currentTask ? (
          <div className="bg-[#111827] border border-[#1f2937] p-4 rounded-xl space-y-3">
            <p className="text-xs text-slate-200">{currentTask}</p>
            <button onClick={() => { setCurrentTask(null); setStatus('Disponible'); }} className="w-full bg-blue-600 py-2 rounded-lg text-xs font-bold text-white hover:bg-blue-700">
              ⏹️ Finalizar Tarea
            </button>
          </div>
        ) : (
          <div className="text-center bg-[#111827]/40 p-6 rounded-xl border border-[#1f2937]/50 space-y-3">
            <p className="text-xs text-slate-400">Bandeja de entrada libre</p>
            <button onClick={simulateTask} className="text-[10px] text-slate-500 underline hover:text-slate-400">
              [ Simular Tarea ]
            </button>
          </div>
        )}
      </div>
      <p className="text-center text-[9px] text-slate-600 font-mono">CRM Widget v1.0</p>
    </div>
  );
}