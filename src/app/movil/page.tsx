"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  leerSesion,
  cerrarSesion,
  sesionPermitida,
  type MovilEmpleado,
} from "../../lib/movilSesion";

// Punto de entrada tras el login. Todavía no es la pantalla de tareas del
// mockup (viene en la siguiente tanda) — por ahora confirma que la sesión
// quedó guardada y sirve para probar el flujo de punta a punta.
export default function MovilInicioPage() {
  const router = useRouter();
  const [empleado, setEmpleado] = useState<MovilEmpleado | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const sesion = leerSesion();
    if (!sesion || !sesionPermitida(sesion.employee)) {
      cerrarSesion();
      router.replace("/movil/login");
      return;
    }
    setEmpleado(sesion.employee);
    setCargando(false);
  }, [router]);

  if (cargando || !empleado) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          Cargando…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-slate-200 px-4 pt-5 pb-3">
        <p className="text-[13px] text-slate-500">Hola,</p>
        <h1 className="text-lg font-semibold text-slate-900">
          {empleado.nombre}
        </h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-slate-500">
          Sesión iniciada correctamente. Las pantallas de tareas, avisos, equipo
          y recompensas se agregan en la siguiente tanda.
        </p>
        <button
          type="button"
          onClick={() => {
            cerrarSesion();
            router.replace("/movil/login");
          }}
          className="mt-2 h-11 px-5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium cursor-pointer"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
