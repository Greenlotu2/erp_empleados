"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiMovil } from "../_lib/api";
import { useRefrescoAlAvisar } from "../_lib/equipo";
import { fechaHora } from "../_lib/tarea";

interface Reunion {
  id: string;
  titulo: string;
  fecha: string;
  link: string | null;
  lugar: string | null;
}

// Las próximas reuniones del usuario, en la pantalla de Tareas. Los datos son
// los mismos de Avisos (/api/movil/avisos) y se actualizan solos al llegar un push.
export function ProximasReuniones() {
  const [reuniones, setReuniones] = useState<Reunion[]>([]);

  const cargar = useCallback(async () => {
    try {
      const datos = await apiMovil<{ reuniones: Reunion[] }>("/api/movil/avisos");
      setReuniones(datos.reuniones || []);
    } catch {
      // sin conexión o sesión vencida: la pantalla de Tareas ya lo maneja
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  useRefrescoAlAvisar(cargar);

  if (reuniones.length === 0) return null;

  return (
    <div className="px-4 pt-3 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Próximas reuniones
        </h2>
        <Link href="/movil/avisos" className="text-[12px] font-semibold text-indigo-600">
          Ver todas
        </Link>
      </div>
      {reuniones.slice(0, 3).map((r) => (
        <div
          key={r.id}
          className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 flex items-center gap-3"
        >
          <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M16 3v4M8 3v4M3 10h18" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 leading-snug truncate">{r.titulo}</p>
            <p className="text-[13px] text-slate-500">
              {fechaHora(r.fecha)}
              {r.link ? " · Virtual" : r.lugar ? ` · ${r.lugar}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
