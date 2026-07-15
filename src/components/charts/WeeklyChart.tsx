'use client';

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function WeeklyChart() {
  const [filter, setFilter] = useState<'semana' | 'mes' | 'año'>('semana');

  // useMemo para calcular las fechas automáticas dependiendo del día de hoy
  const dynamicData = useMemo(() => {
    const today = new Date();

    if (filter === 'semana') {
      // Calcular los días de la semana actual (Lunes a Viernes)
      const currentDay = today.getDay(); // 0: Dom, 1: Lun, ..., 6: Sáb
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(today);
      monday.setDate(today.getDate() + distanceToMonday);

      const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
      // Simulamos tareas (puedes cambiar estos números fijos por lógica más adelante)
      const tareasSimuladas = [14, 18, 12, 9, 21]; 

      return diasSemana.map((day, index) => {
        const dateForDay = new Date(monday);
        dateForDay.setDate(monday.getDate() + index);
        
        // Formato automático: "Lun 06", "Mar 07", etc.
        const dayNumber = dateForDay.getDate().toString().padStart(2, '0');
        
        return {
          name: `${day} ${dayNumber}`,
          tareas: tareasSimuladas[index]
        };
      });
    }

    if (filter === 'mes') {
      // Obtener el nombre del mes actual de forma automática
      const nombreMes = today.toLocaleString('es-MX', { month: 'long' });
      const capitalizado = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);

      return [
        { name: `Sem 1 ${capitalizado}`, tareas: 42 },
        { name: `Sem 2 ${capitalizado}`, tareas: 55 },
        { name: `Sem 3 ${capitalizado}`, tareas: 36 },
        { name: `Sem 4 ${capitalizado}`, tareas: 49 },
      ];
    }

    if (filter === 'año') {
      // Mostrar el año en curso automáticamente
      const currentYear = today.getFullYear();
      return [
        { name: `Ene ${currentYear}`, tareas: 150 },
        { name: `Feb ${currentYear}`, tareas: 190 },
        { name: `Mar ${currentYear}`, tareas: 210 },
        { name: `Abr ${currentYear}`, tareas: 165 },
        { name: `May ${currentYear}`, tareas: 230 },
        { name: `Jun ${currentYear}`, tareas: 195 },
      ];
    }

    return [];
  }, [filter]);

  // Obtener etiqueta de rango dinámico para el subtítulo
  const rangeSubtitle = useMemo(() => {
    const today = new Date();
    if (filter === 'semana') return 'Días de la semana en curso';
    if (filter === 'mes') return `Semanas correspondientes a ${today.toLocaleString('es-MX', { month: 'long' })} ${today.getFullYear()}`;
    return `Progreso histórico del año ${today.getFullYear()}`;
  }, [filter]);

  return (
    <div className="w-full h-[320px] bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            Rendimiento de Actividades
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{rangeSubtitle}</p>
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'semana' | 'mes' | 'año')}
          className="bg-slate-50 border border-slate-200 text-slate-600 font-semibold text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all"
        >
          <option value="semana">Esta Semana</option>
          <option value="mes">Este Mes</option>
          <option value="año">Este Año</option>
        </select>
      </div>
      
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dynamicData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#94a3b8', fontSize: 11 }} 
            />
            <Tooltip 
              cursor={{ fill: '#f8fafc' }}
              contentStyle={{ 
                backgroundColor: '#1e293b', 
                borderRadius: '12px', 
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }} 
            />
            <Bar 
              dataKey="tareas" 
              fill="#3b82f6" 
              radius={[6, 6, 0, 0]} 
              maxBarSize={45}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}