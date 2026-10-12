"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMovil, SesionExpirada } from "./api";
import type { TareaMovil } from "./equipo";

export interface Persona {
  id: string;
  nombre: string;
  color: string | null;
  avatar_url: string | null;
  rol: string | null;
  especialidad: string | null;
}

export interface DetalleTarea extends TareaMovil {
  fecha_asignada: string | null;
  revision_comentario: string | null;
  revision_por: string | null;
  revision_fecha: string | null;
  responsable: Persona | null;
  asignadaPor: string | null;
  colaboradores: Persona[];
}

export interface EventoHilo {
  clave: string;
  tipo: "revision" | "reunion" | "decision" | "minuta";
  fecha: string;
  titulo: string;
  cuerpo: string;
  detalle?: string | null;
  enlace?: string | null;
  aprobada?: boolean;
  archivo?: { nombre: string; url: string | null } | null;
}

export interface DatosTarea {
  tarea: DetalleTarea;
  hilo: EventoHilo[];
}

// Carga /api/movil/tareas/[id] (tarea + hilo); si la sesión venció, al login.
export function useDetalleTarea(id: string) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosTarea | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setError(null);
      setDatos(await apiMovil<DatosTarea>(`/api/movil/tareas/${id}`));
    } catch (err: any) {
      if (err instanceof SesionExpirada) router.replace("/movil/login");
      else setError(err.message);
    }
  }, [id, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  return { datos, error, cargar };
}

export function fechaHora(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function especialidadVisible(p: Persona | null | undefined) {
  return p?.especialidad && p.especialidad !== "General" ? p.especialidad : null;
}
