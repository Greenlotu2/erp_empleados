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
}

interface KpiArea {
  id: string;
  nombre: string;
  icono: string;
  colorBorde: string;
  colorTexto: string;
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
    colorBorde: 'border-blue-700',
    colorTexto: 'text-white',
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
    colorBorde: 'border-blue-700',
    colorTexto: 'text-white',
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
    colorBorde: 'border-blue-700',
    colorTexto: 'text-white',
    kpis: [
      {
        id: 'facturacion',
        nombre: 'Facturación Total vs. Utilidad Real',
        actual: '$5,163,325.00 MXN (28% Utilidad Real)',
        meta: '≥ 25% de Utilidad Real',
        formula: 'Utilidad Real (%) = [(Facturación Total - Gastos Operativos y Administrativos) / Facturación Total] * 100',
        descripcion: 'Mide la ganancia real neta obtenida tras deducir costos de operación sobre la facturación emitida.',
      },
      {
        id: 'utilidad',
        nombre: 'Utilidad Real',
        actual: '28%',
        meta: '≥ 25%',
        formula: 'Utilidad Real (%) = [(Facturación Total - Gastos Operativos y Administrativos) / Facturación Total] * 100',
        descripcion: 'Porcentaje de utilidad real sobre la facturación total emitida en el periodo.',
      },
    ],
    extraStats: [
      { label: 'Tiempo Promedio de Emisión y Cobro', value: '18 hrs (Meta: ≤ 24 hrs)' },
      { label: 'Cumplimiento de Tiempos en Cierres Financieros', value: '96%' },
      { label: 'Cartera Vencida Controlada', value: '$350,000.00 MXN' },
    ],
  },
  {
    id: 'marketing',
    nombre: 'Área de Marketing y Posicionamiento',
    icono: '📢',
    colorBorde: 'border-blue-700',
    colorTexto: 'text-white',
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
        const { data, error } = await supabase
          .from('tareas')
          .select('id, fecha_asignada, fecha_limite, estado, porcentaje_avance');

        if (error) throw error;

        const tareas: TareaKpi[] = data || [];
        const hoyStr = new Date().toISOString().split('T')[0];
        const hoyMs = new Date(hoyStr).getTime();

        const mesActual = getMonthRange(0);
        const mesAnterior = getMonthRange(-1);

        // --- OTD: de las tareas que ya "cerraron" (completadas o vencidas sin completar),
        // qué porcentaje se entregó a tiempo. Las que aún están dentro de plazo se excluyen
        // porque todavía no sabemos si terminarán a tiempo o no.
        const completadas = tareas.filter(t => t.estado === 'Completada');
        const vencidasSinCompletar = tareas.filter(t =>
          t.estado !== 'Completada' && !!t.fecha_limite && t.fecha_limite < hoyStr
        );
        const otdDenominador = completadas.length + vencidasSinCompletar.length;
        const otdActualNum = otdDenominador > 0 ? (completadas.length / otdDenominador) * 100 : null;

        const otdMesActual = calcularOTDEnRango(tareas, hoyStr, mesActual.start, mesActual.end);
        const otdMesAnterior = calcularOTDEnRango(tareas, hoyStr, mesAnterior.start, mesAnterior.end);

        const otdValue: LiveKpiValue = otdActualNum !== null
          ? {
              actual: `${Math.round(otdActualNum)}%`,
              status: otdActualNum >= 90 ? 'ÓPTIMO' : undefined,
              nota: `Calculado sobre ${otdDenominador} tarea(s) con resultado definido (completadas o vencidas).`,
              delta: calcularDelta(otdMesActual, otdMesAnterior),
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

        const spiMesActual = calcularSPIEnRango(tareas, hoyMs, mesActual.start, mesActual.end);
        const spiMesAnterior = calcularSPIEnRango(tareas, hoyMs, mesAnterior.start, mesAnterior.end);

        const spiValue: LiveKpiValue = spiActualNum !== null
          ? {
              actual: spiActualNum.toFixed(2),
              nota: `Aproximado (peso igual por tarea) sobre ${tareasSpiTotal} tarea(s) con fecha de asignación y límite.`,
              delta: calcularDelta(spiMesActual, spiMesAnterior),
            }
          : {
              actual: 'Sin datos',
              nota: 'Aún no hay tareas con fecha de asignación y fecha límite para calcular este indicador.',
            };

        setLiveValues({ otd: otdValue, spi: spiValue });
      } catch (err) {
        console.error('Error calculando KPIs en vivo:', err);
      } finally {
        setLoadingLive(false);
      }
    };

    calcularKpisEnVivo();
  }, []);

  return (
    <aside className="h-full w-full xl:w-[300px] 2xl:w-[380px] shrink-0 bg-white text-slate-800 flex flex-col overflow-hidden border border-slate-200 rounded-lg shadow-lg">
      <div className="p-4 border-b border-slate-700/80 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">📈</span>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-black leading-tight">
              Estrategia de KPIs
            </h2>
            <p className="text-[10px] text-slate-400 leading-tight">
              Ficha técnica: 8 KPIs principales
            </p>
          </div>
        </div>

        <div className="mt-3 bg-blue-700 -inset-0 border border-sky-800/60 rounded-lg px-3 py-2">
          <p className="text-[10px] font-bold text-[#FFFFFF] uppercase tracking-wide">
            Propuesta de Integración de KPIs
          </p>
          <p className="text-[10px] text-slate-400">
            Resumen de Métricas Clave y Objetivos
          </p>
        </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3 shadow-lg">
          {KPI_AREAS.map(area => {
            const isCollapsed = collapsedAreas[area.id];
            return (
              <div key={area.id} className={`bg-slate-3000 border-l-4 border ${area.colorBorde} rounded-lg overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => toggleArea(area.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-blue-700 hover:bg-blue-600 transition-colors cursor-pointer"
                >
                  <span className={`text-[11px] font-bold ${area.colorTexto} flex items-center gap-1.5`}>
                    <span>{area.icono}</span>
                    <span className="uppercase tracking-wide">{area.nombre}</span>
                  </span>
                  <span className={`text-slate-400 text-[10px] transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>▲</span>
                </button>

                {!isCollapsed && (
                  <div className="p-2.5 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    {area.kpis.map(kpi => {
                      const live = liveValues[kpi.id];
                      const esVivo = !!live;
                      const actualMostrado = esVivo ? live!.actual : kpi.actual;
                      const statusMostrado = esVivo ? live!.status : kpi.status;
                      // Los KPIs en vivo usan su delta calculado de verdad; los estáticos usan
                      // `staticDelta` (el mismo valor que traía el mockup, ej. "↑ 4%").
                      const delta = esVivo ? live!.delta : kpi.staticDelta;

                      return (
                        <div key={kpi.id} className="bg-white border border-slate-700/60 rounded-lg overflow-hidden shadow-sm">
                          <div className="px-2.5 py-2 bg-blue-700 flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-bold text-slate-100 leading-snug">{kpi.nombre}</span>
                            {esVivo && (
                              <span
                                title="Calculado en tiempo real desde la tabla de tareas"
                                className="shrink-0 text-[8px] font-bold text-emerald-300 bg-emerald-900/40 border border-emerald-500/40 px-1.5 py-0.5 rounded-full"
                              >
                                📡 En vivo
                              </span>
                            )}
                          </div>

                          <div className="px-3 py-3 text-center border-b border-slate-700/60">
                            <p className="text-lg font-extrabold text-slate-900 leading-tight break-words">
                              {esVivo && loadingLive ? '…' : actualMostrado}
                            </p>
                            <p className="text-[10px] text-slate-500 font-semibold mt-1">
                              (Meta Recom: {kpi.meta})
                            </p>
                            {statusMostrado && (
                              <span className="inline-block mt-1.5 text-[8px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                {statusMostrado}
                              </span>
                            )}
                            {delta && (
                              <p
                                title="Comparado contra el mismo cálculo del mes anterior"
                                className={`text-[11px] font-bold mt-1.5 ${
                                  delta.direccion === 'up' ? 'text-sky-600' : 'text-red-600'
                                }`}
                              >
                                {delta.direccion === 'up' ? '↑' : '↓'} {delta.porcentaje}% vs. Mes Anterior
                              </p>
                            )}
                          </div>

                          <div className="px-2.5 py-2">
                            <p className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">¿Qué mide?</p>
                            <p className="text-[10px] text-slate-400 leading-snug">{kpi.descripcion}</p>
                          </div>

                          {esVivo && !loadingLive && (
                            <div className="px-2.5 py-2 bg-slate-50 border-t border-slate-100">
                              <p className="text-[9px] text-slate-500 italic leading-snug">ℹ️ {live!.nota}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                    {area.extraStats.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
                        {area.extraStats.map(stat => (
                          <div key={stat.label} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                            <span className="text-[10px] text-slate-600">{stat.label}:</span>
                            <span className="text-[10px] font-bold text-slate-800 shrink-0">{stat.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <p className="text-[9px] text-slate-600 text-center pt-1 pb-2">
            📡 En vivo = calculado ahora mismo desde tareas. El resto son valores de la propuesta original, pendientes de una fuente de datos real.
          </p>
        </div>
    </aside>
  );
}
