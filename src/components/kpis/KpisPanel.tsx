'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface KpiDelta {
  direccion: 'up' | 'down';
  porcentaje: number;
}

interface KpiItem {
  id: string;
  nombre: string;
  actual: string;
  meta: string;
  status?: string;
  formula: string;
  descripcion: string;
  // Comparativo estático "vs. mes anterior" para los KPIs sin datos reales todavía
  // (los que sí tienen datos usan `LiveKpiValue.delta`, calculado de verdad).
  staticDelta?: KpiDelta;
}

interface KpiExtraStat {
  label: string;
  value: string;
  // Si se define, el valor se reemplaza en tiempo real por `liveValues[id].actual`
  // (mismo mecanismo que usan las tarjetas de KPI en vivo) — `value` queda solo
  // como placeholder mientras carga.
  id?: string;
}

interface KpiArea {
  id: string;
  nombre: string;
  icono: string;
  kpis: KpiItem[];
  // Líneas de estadística adicionales del mockup (sin tarjeta propia). Estáticas por
  // ahora — igual que el resto de los KPIs no conectados, no hay tabla en el CRM
  // todavía para calcularlas; se conectan cuando exista esa fuente de datos.
  extraStats: KpiExtraStat[];
}

// 📌 Contenido estático tomado de "KPIs_Estrategia_Estructura_TICs.docx".
// No se calcula desde Supabase: varias de estas métricas (facturación, leads,
// gastos) no existen todavía en ninguna tabla del CRM. Cuando esos datos existan,
// este array se puede reemplazar por un fetch real.
const KPI_AREAS: KpiArea[] = [
  {
    id: 'consultoria',
    nombre: 'Área de Consultoría y Proyectos',
    icono: '📁',
    kpis: [
      {
        id: 'otd',
        nombre: 'Cumplimiento de Entregables (OTD - On-Time Delivery)',
        actual: '95%',
        status: 'ÓPTIMO',
        meta: '≥ 90%',
        formula: 'OTD (%) = (Entregables Finalizados a Tiempo / Total de Entregables Programados) * 100',
        descripcion: 'Mide el porcentaje de entregables de proyectos finalizados dentro de la fecha límite establecida.',
      },
      {
        id: 'spi',
        nombre: 'Eficiencia en Tiempos de Ejecución (SPI - Schedule Performance Index)',
        actual: '1.05',
        meta: '≥ 1.00',
        formula: 'SPI = EV (Valor Ganado / Avance Real Completo) / PV (Valor Planificado / Avance Programado)',
        descripcion: 'Mide el avance real del proyecto en comparación con la planificación de tiempo.',
      },
    ],
    extraStats: [
      { label: 'Puntualidad en Hitos Estratégicos', value: '94%' },
      { label: 'Cumplimiento de Capacitaciones Internas', value: '90%' },
    ],
  },
  {
    id: 'comercial',
    nombre: 'Área Comercial y Ventas',
    icono: '📈',
    kpis: [
      {
        id: 'conversion',
        nombre: 'Tasa de Conversión (Propuestas vs. Cierres)',
        actual: '65%',
        meta: '≥ 60%',
        staticDelta: { direccion: 'up', porcentaje: 4 },
        formula: 'Tasa de Conversión (%) = (Número de Propuestas Ganadas / Número Total de Propuestas Enviadas) * 100',
        descripcion: 'Mide la efectividad del equipo comercial para cerrar contratos a partir de propuestas enviadas.',
      },
      {
        id: 'margen',
        nombre: 'Margen de Utilidad Proyectado',
        actual: '28%',
        meta: '≥ 25%',
        formula: 'Margen Proyectado (%) = [(Precio Total Vendido - Costo Directo Estimado) / Precio Total Vendido] * 100',
        descripcion: 'Mide el porcentaje estimado de ganancia bruta/neta contemplado en las cotizaciones cerradas.',
      },
    ],
    extraStats: [
      { label: 'Oportunidades Activas en Pipeline', value: '18 Cuentas' },
      { label: 'Valor Total Promedio Cotizado', value: '$1,250,000 MXN' },
    ],
  },
  {
    id: 'administrativa',
    nombre: 'Área Administrativa, Financiera y Contable',
    icono: '💰',
    kpis: [
      {
        id: 'cumplimientoAdmin',
        nombre: 'Índice de Cumplimiento de Tareas Asignadas',
        actual: '82%',
        meta: '≥ 95% de Cumplimiento',
        formula: 'Cumplimiento de Tareas (%) = [(Tareas Contables-Financieras Completadas en Fecha Límite) / Total de Tareas Asignadas en el Periodo] * 100',
        descripcion: 'Mide la efectividad del equipo para finalizar en tiempo y forma las tareas, entregables y asignaciones operativas programadas para el área.',
      },
    ],
    extraStats: [
      { id: 'tiempoEntregaAdmin', label: 'Tiempo Promedio de Entrega (Asignación → Fecha Límite)', value: 'Calculando...' },
    ],
  },
  {
    id: 'marketing',
    nombre: 'Área de Marketing y Posicionamiento',
    icono: '📢',
    kpis: [
      {
        id: 'leads',
        nombre: 'Volumen de Prospectos Calificados (Leads MQL/SQL)',
        actual: '142 Leads',
        meta: 'Crecimiento sostenido mes a mes',
        staticDelta: { direccion: 'up', porcentaje: 12 },
        formula: 'Total MQL/SQL = Suma(Leads Registrados Calificados que Cumplen Criterios de Ventas)',
        descripcion: 'Mide la cantidad de contactos generados por campañas que cumplen con el perfil objetivo.',
      },
      {
        id: 'cpl',
        nombre: 'Costo por Lead Adquirido (CPL)',
        actual: '$185 MXN',
        meta: '≤ $200 MXN',
        formula: 'CPL = Inversión Total en Publicidad y Campañas / Número Total de Leads Generados',
        descripcion: 'Mide la eficiencia del gasto en marketing para obtener un prospecto individual.',
      },
    ],
    extraStats: [
      { label: 'Alcance Orgánico en Redes Sociales', value: '+25%' },
      { label: 'Tasa de Interacción (Engagement Rate)', value: '4.8%' },
    ],
  },
];

interface TareaKpi {
  id: number;
  fecha_asignada: string | null;
  fecha_limite: string | null;
  estado: string | null;
  porcentaje_avance: number | null;
  empleado_id: string | null;
}

interface LiveKpiValue {
  actual: string;
  status?: string;
  nota: string;
  delta?: KpiDelta | null;
}

// Rango [inicio, fin] de un mes calendario, desplazado `offsetMonths` desde el actual
// (0 = mes en curso, -1 = mes anterior), en formato "YYYY-MM-DD".
function getMonthRange(offsetMonths: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
  const toStr = (d: Date) => d.toISOString().split('T')[0];
  return { start: toStr(start), end: toStr(end) };
}

// Rango [inicio, fin] de una semana calendario (lunes a domingo), desplazada
// `offsetWeeks` desde la semana en curso (0 = semana en curso, -1 = semana anterior).
function getWeekRange(offsetWeeks: number) {
  const now = new Date();
  const dia = now.getDay(); // 0 = domingo ... 6 = sábado
  const diffALunes = dia === 0 ? -6 : 1 - dia;
  const lunes = new Date(now);
  lunes.setDate(now.getDate() + diffALunes + offsetWeeks * 7);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const toStr = (d: Date) => d.toISOString().split('T')[0];
  return { start: toStr(lunes), end: toStr(domingo) };
}

// OTD (%) para las tareas cuya fecha_limite cae dentro del rango dado, usando `hoyStr`
// como corte para decidir qué tareas ya "cerraron" (completadas o vencidas sin completar).
function calcularOTDEnRango(tareas: TareaKpi[], hoyStr: string, rangeStart: string, rangeEnd: string): number | null {
  const enRango = tareas.filter(t => t.fecha_limite && t.fecha_limite >= rangeStart && t.fecha_limite <= rangeEnd);
  const completadas = enRango.filter(t => t.estado === 'Completada');
  const vencidas = enRango.filter(t => t.estado !== 'Completada' && t.fecha_limite! < hoyStr);
  const denom = completadas.length + vencidas.length;
  return denom > 0 ? (completadas.length / denom) * 100 : null;
}

// SPI para las tareas cuya fecha_limite cae dentro del rango dado. Limitación real: solo
// tenemos el `porcentaje_avance` ACTUAL de cada tarea, no una foto histórica de cómo iba
// a fin del mes anterior — así que la comparación con meses pasados es aproximada.
function calcularSPIEnRango(tareas: TareaKpi[], hoyMs: number, rangeStart: string, rangeEnd: string): number | null {
  let sumaReal = 0;
  let sumaPlaneado = 0;

  tareas.forEach(t => {
    if (!t.fecha_asignada || !t.fecha_limite) return;
    if (t.fecha_limite < rangeStart || t.fecha_limite > rangeEnd) return;

    const inicioMs = new Date(t.fecha_asignada).getTime();
    const limiteMs = new Date(t.fecha_limite).getTime();
    const duracionMs = limiteMs - inicioMs;
    if (duracionMs <= 0) return;

    const transcurridoMs = Math.min(Math.max(hoyMs - inicioMs, 0), duracionMs);
    const avancePlaneado = (transcurridoMs / duracionMs) * 100;
    const avanceReal = t.estado === 'Completada' ? 100 : (t.porcentaje_avance ?? 0);

    sumaReal += avanceReal;
    sumaPlaneado += avancePlaneado;
  });

  return sumaPlaneado > 0 ? sumaReal / sumaPlaneado : null;
}

function calcularDelta(actual: number | null, anterior: number | null): LiveKpiValue['delta'] {
  if (actual === null || anterior === null || anterior === 0) return null;
  const cambio = ((actual - anterior) / Math.abs(anterior)) * 100;
  if (Math.abs(cambio) < 0.5) return null;
  return { direccion: cambio >= 0 ? 'up' : 'down', porcentaje: Math.abs(Math.round(cambio)) };
}

export default function KpisPanel() {
  const [collapsedAreas, setCollapsedAreas] = useState<Record<string, boolean>>({});
  const [loadingLive, setLoadingLive] = useState(true);
  const [liveValues, setLiveValues] = useState<Record<string, LiveKpiValue>>({});
  // Los KPIs en vivo (OTD/SPI) pueden compararse contra la semana o el mes anterior.
  const [comparePeriod, setComparePeriod] = useState<'semana' | 'mes'>('mes');

  const toggleArea = (areaId: string) => {
    setCollapsedAreas(prev => ({ ...prev, [areaId]: !prev[areaId] }));
  };

  // 📡 OTD y SPI SÍ se pueden calcular con datos reales de `tareas` — el resto de los
  // KPIs (ventas, facturación, leads) no tienen tabla en el CRM todavía y se quedan
  // con el valor estático del docx.
  useEffect(() => {
    const calcularKpisEnVivo = async () => {
      try {
        setLoadingLive(true);
        const [{ data, error }, { data: empData, error: empError }] = await Promise.all([
          supabase.from('tareas').select('id, fecha_asignada, fecha_limite, estado, porcentaje_avance, empleado_id'),
          supabase.from('empleados').select('id, area'),
        ]);

        if (error) throw error;
        if (empError) throw empError;

        const tareas: TareaKpi[] = data || [];
        const areaPorEmpleado: Record<string, string | null> = {};
        (empData || []).forEach((e: any) => { areaPorEmpleado[e.id] = e.area || null; });
        const hoyStr = new Date().toISOString().split('T')[0];
        const hoyMs = new Date(hoyStr).getTime();

        const rangoActual = comparePeriod === 'semana' ? getWeekRange(0) : getMonthRange(0);
        const rangoAnterior = comparePeriod === 'semana' ? getWeekRange(-1) : getMonthRange(-1);

        // --- OTD: de las tareas que ya "cerraron" (completadas o vencidas sin completar),
        // qué porcentaje se entregó a tiempo. Las que aún están dentro de plazo se excluyen
        // porque todavía no sabemos si terminarán a tiempo o no.
        const completadas = tareas.filter(t => t.estado === 'Completada');
        const vencidasSinCompletar = tareas.filter(t =>
          t.estado !== 'Completada' && !!t.fecha_limite && t.fecha_limite < hoyStr
        );
        const otdDenominador = completadas.length + vencidasSinCompletar.length;
        const otdActualNum = otdDenominador > 0 ? (completadas.length / otdDenominador) * 100 : null;

        const otdActualRango = calcularOTDEnRango(tareas, hoyStr, rangoActual.start, rangoActual.end);
        const otdAnteriorRango = calcularOTDEnRango(tareas, hoyStr, rangoAnterior.start, rangoAnterior.end);

        const otdValue: LiveKpiValue = otdActualNum !== null
          ? {
              actual: `${Math.round(otdActualNum)}%`,
              status: otdActualNum >= 90 ? 'ÓPTIMO' : undefined,
              nota: `Calculado sobre ${otdDenominador} tarea(s) con resultado definido (completadas o vencidas).`,
              delta: calcularDelta(otdActualRango, otdAnteriorRango),
            }
          : {
              actual: 'Sin datos',
              nota: 'Aún no hay tareas completadas o vencidas para calcular este indicador.',
            };

        // --- SPI (aproximado): compara el avance real (porcentaje_avance) contra el avance
        // que "debería" llevar cada tarea según cuánto tiempo transcurrió entre su fecha de
        // asignación y su fecha límite. Es una aproximación por tarea con peso igual entre
        // ellas — el SPI formal de gestión de proyectos pondera por presupuesto/valor, dato
        // que este CRM no registra todavía. El comparativo vs. mes anterior también es
        // aproximado: solo tenemos el avance ACTUAL de cada tarea, no una foto histórica de
        // cómo iba a fin del mes pasado.
        const spiActualNum = calcularSPIEnRango(tareas, hoyMs, '0000-01-01', '9999-12-31');
        const tareasSpiTotal = tareas.filter(t => t.fecha_asignada && t.fecha_limite && new Date(t.fecha_limite).getTime() > new Date(t.fecha_asignada).getTime()).length;

        const spiActualRango = calcularSPIEnRango(tareas, hoyMs, rangoActual.start, rangoActual.end);
        const spiAnteriorRango = calcularSPIEnRango(tareas, hoyMs, rangoAnterior.start, rangoAnterior.end);

        const spiValue: LiveKpiValue = spiActualNum !== null
          ? {
              actual: spiActualNum.toFixed(2),
              nota: `Aproximado (peso igual por tarea) sobre ${tareasSpiTotal} tarea(s) con fecha de asignación y límite.`,
              delta: calcularDelta(spiActualRango, spiAnteriorRango),
            }
          : {
              actual: 'Sin datos',
              nota: 'Aún no hay tareas con fecha de asignación y fecha límite para calcular este indicador.',
            };

        // --- Índice de Cumplimiento de Tareas Asignadas (Área Administrativa/Financiera):
        // mismo cálculo que OTD, pero limitado a las tareas de empleados con
        // `area = 'Financiero-Contable'`.
        const tareasFinanciero = tareas.filter(t => t.empleado_id && areaPorEmpleado[t.empleado_id] === 'Financiero-Contable');
        const completadasFin = tareasFinanciero.filter(t => t.estado === 'Completada');
        const vencidasFin = tareasFinanciero.filter(t => t.estado !== 'Completada' && !!t.fecha_limite && t.fecha_limite < hoyStr);
        const cumplimientoDenominador = completadasFin.length + vencidasFin.length;
        const cumplimientoActualNum = cumplimientoDenominador > 0 ? (completadasFin.length / cumplimientoDenominador) * 100 : null;

        const cumplimientoActualRango = calcularOTDEnRango(tareasFinanciero, hoyStr, rangoActual.start, rangoActual.end);
        const cumplimientoAnteriorRango = calcularOTDEnRango(tareasFinanciero, hoyStr, rangoAnterior.start, rangoAnterior.end);

        const cumplimientoAdminValue: LiveKpiValue = cumplimientoActualNum !== null
          ? {
              actual: `${Math.round(cumplimientoActualNum)}%`,
              status: cumplimientoActualNum >= 95 ? 'ÓPTIMO' : undefined,
              nota: `Calculado sobre ${cumplimientoDenominador} tarea(s) del área Financiero-Contable con resultado definido.`,
              delta: calcularDelta(cumplimientoActualRango, cumplimientoAnteriorRango),
            }
          : {
              actual: 'Sin datos',
              nota: 'Aún no hay tareas completadas o vencidas asignadas a empleados del área Financiero-Contable.',
            };

        // --- Tiempo Promedio de Entrega (Área Administrativa/Financiera): días entre
        // la asignación y la fecha límite de sus tareas. Nota real: el CRM no guarda
        // una fecha/hora de cuándo se completó cada tarea, así que esto mide la
        // VENTANA PLANEADA de entrega, no el tiempo real que tardó en completarse.
        const tareasConVentana = tareasFinanciero.filter(t => t.fecha_asignada && t.fecha_limite);
        const tiempoEntregaValue: LiveKpiValue = tareasConVentana.length > 0
          ? (() => {
              const promedioDias = tareasConVentana.reduce((suma, t) => {
                const dias = (new Date(t.fecha_limite!).getTime() - new Date(t.fecha_asignada!).getTime()) / (1000 * 60 * 60 * 24);
                return suma + Math.max(dias, 0);
              }, 0) / tareasConVentana.length;
              return {
                actual: `${promedioDias.toFixed(1)} días`,
                nota: `Ventana planeada (asignación → fecha límite), promedio sobre ${tareasConVentana.length} tarea(s). No es el tiempo real de entrega: el CRM aún no registra cuándo se completó cada tarea.`,
              };
            })()
          : {
              actual: 'Sin datos',
              nota: 'Aún no hay tareas con fecha de asignación y fecha límite en el área Financiero-Contable.',
            };

        setLiveValues({ otd: otdValue, spi: spiValue, cumplimientoAdmin: cumplimientoAdminValue, tiempoEntregaAdmin: tiempoEntregaValue });
      } catch (err) {
        console.error('Error calculando KPIs en vivo:', err);
      } finally {
        setLoadingLive(false);
      }
    };

    calcularKpisEnVivo();
  }, [comparePeriod]);

  return (
    <aside className="h-full w-full xl:w-[300px] 2xl:w-[380px] shrink-0 bg-slate-900 text-slate-100 flex flex-col overflow-hidden border border-slate-800 rounded-lg shadow-lg">
      <div className="px-4 py-3.5 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-white leading-tight">
              Estrategia de KPIs
            </h2>
            <p className="text-[10.5px] text-slate-400 leading-tight mt-0.5">
              8 indicadores principales por área
            </p>
          </div>
          <span className="text-[9px] font-medium text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">
            v2
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">Comparar contra</span>
          <div className="flex bg-slate-800 p-0.5 rounded-md gap-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setComparePeriod('semana')}
              className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer ${
                comparePeriod === 'semana' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Semana pasada
            </button>
            <button
              type="button"
              onClick={() => setComparePeriod('mes')}
              className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer ${
                comparePeriod === 'mes' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mes pasado
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {KPI_AREAS.map(area => {
          const isCollapsed = collapsedAreas[area.id];
          return (
            <div key={area.id} className="border border-slate-800 rounded-lg overflow-hidden bg-slate-800/40">
              <button
                type="button"
                onClick={() => toggleArea(area.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <span className="text-[11px] font-semibold text-slate-200 flex items-center gap-2">
                  <span className="text-sm leading-none">{area.icono}</span>
                  <span>{area.nombre}</span>
                </span>
                <span className={`text-slate-500 text-[10px] transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}>▾</span>
              </button>

              <div
                className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                style={{ gridTemplateRows: isCollapsed ? '0fr' : '1fr' }}
              >
                <div className="overflow-hidden">
                  <div className="px-2.5 pb-2.5 pt-1 space-y-2.5 border-t border-slate-800">
                    <div className="grid grid-cols-2 gap-2">
                      {area.kpis.map((kpi, idx) => {
                        const live = liveValues[kpi.id];
                        const esVivo = !!live;
                        const actualMostrado = esVivo ? live!.actual : kpi.actual;
                        const statusMostrado = esVivo ? live!.status : kpi.status;
                        // Los KPIs en vivo usan su delta calculado de verdad; los estáticos usan
                        // `staticDelta` (el mismo valor que traía el mockup, ej. "↑ 4%").
                        const delta = esVivo ? live!.delta : kpi.staticDelta;

                        return (
                          <div
                            key={kpi.id}
                            style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'backwards' }}
                            className={`bg-slate-800 border border-slate-700 rounded-lg overflow-hidden ${!isCollapsed ? 'animate-[fade-slide-in_0.3s_ease-out]' : ''}`}
                          >
                            <div className="px-2.5 py-2.5 text-center">
                              <p className="text-[10px] font-medium text-slate-400 leading-snug min-h-[2.4em] flex items-center justify-center">
                                {kpi.nombre}
                              </p>

                              <p className="text-lg font-semibold text-white leading-tight break-words mt-1">
                                {esVivo && loadingLive ? '···' : actualMostrado}
                              </p>
                              <p className="text-[9.5px] text-slate-500 mt-0.5">
                                Meta: {kpi.meta}
                              </p>

                              <div className="flex items-center justify-center gap-1 flex-wrap mt-1.5 min-h-[16px]">
                                {esVivo && (
                                  <span
                                    title="Calculado en tiempo real desde la tabla de tareas"
                                    className="inline-flex items-center gap-1 text-[8.5px] font-medium text-slate-400"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    En vivo
                                  </span>
                                )}
                                {statusMostrado && (
                                  <span className="text-[8px] font-semibold text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                    {statusMostrado}
                                  </span>
                                )}
                              </div>

                              {delta && (
                                <p
                                  title={esVivo ? `Comparado contra el mismo cálculo de la ${comparePeriod === 'semana' ? 'semana' : 'mes'} anterior` : 'Comparado contra el mes anterior'}
                                  className={`text-[10.5px] font-medium mt-1 ${
                                    delta.direccion === 'up' ? 'text-sky-400' : 'text-red-400'
                                  }`}
                                >
                                  {delta.direccion === 'up' ? '↑' : '↓'} {delta.porcentaje}% vs. {esVivo ? (comparePeriod === 'semana' ? 'semana anterior' : 'mes anterior') : 'mes anterior'}
                                </p>
                              )}
                            </div>

                            {esVivo && !loadingLive && (
                              <div className="px-2 py-1.5 bg-slate-900/60 border-t border-slate-700">
                                <p className="text-[8.5px] text-slate-500 leading-snug">{live!.nota}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {area.extraStats.length > 0 && (
                      <div className="bg-slate-900/60 border border-slate-700 rounded-lg divide-y divide-slate-700 overflow-hidden">
                        {area.extraStats.map(stat => {
                          const liveStat = stat.id ? liveValues[stat.id] : undefined;
                          const valorMostrado = liveStat ? (loadingLive ? '···' : liveStat.actual) : stat.value;
                          return (
                            <div key={stat.label} className="flex items-center justify-between gap-2 px-2.5 py-1.5" title={liveStat?.nota}>
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                {stat.label}
                                {liveStat && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Calculado en tiempo real" />}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-100 shrink-0">{valorMostrado}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <p className="text-[9px] text-slate-500 text-center pt-1 pb-2 leading-snug">
          El punto verde indica un valor calculado en tiempo real. El resto son valores de referencia de la propuesta original, pendientes de una fuente de datos.
        </p>
      </div>
    </aside>
  );
}
