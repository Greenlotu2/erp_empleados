"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMovil, SesionExpirada } from "./api";

export interface EmpleadoMovil {
  id: string;
  nombre: string;
  color: string | null;
  avatar_url: string | null;
  nivel: string | null;
  area: string[] | null;
  rol: string | null;
  especialidad: string | null;
  disponibilidad: boolean | null;
}

export interface TareaMovil {
  id: number;
  titulo: string;
  descripcion: string | null;
  estado: string;
  prioridad: string | null;
  fecha_limite: string | null;
  porcentaje_avance: number | null;
  empleado_id: string;
  proyecto_id: string | null;
  proyecto: string | null;
  colaboradores_ids: string[] | null;
  revision_resultado: string | null;
}

export interface DatosEquipo {
  yo: { id: string; nombre: string; nivel: string; area: string[] };
  empleados: EmpleadoMovil[];
  tareas: TareaMovil[];
}

// Carga /api/movil/equipo; si la sesión venció, manda al login.
export function useDatosEquipo() {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosEquipo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setError(null);
      setDatos(await apiMovil<DatosEquipo>("/api/movil/equipo"));
    } catch (err: any) {
      if (err instanceof SesionExpirada) router.replace("/movil/login");
      else setError(err.message);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recargar();
  }, [recargar]);

  return { datos, error, recargar };
}

// ---------- utilidades de presentación ----------

export const SIN_AREA = "Sin área asignada";

export function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase();
}

export function primerNombre(nombre: string) {
  return nombre.trim().split(/\s+/)[0] || nombre;
}

// "YYYY-MM-DD" de hoy en hora local (sin pasar por UTC).
function hoyLocal() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type Urgencia = "vencida" | "hoy" | null;

export function urgencia(t: TareaMovil): Urgencia {
  if (!t.fecha_limite || esPorRevisar(t)) return null;
  if ((t.estado || "").toLowerCase().includes("complet")) return null;
  const f = t.fecha_limite.slice(0, 10);
  const hoy = hoyLocal();
  if (f < hoy) return "vencida";
  if (f === hoy) return "hoy";
  return null;
}

export function esPorRevisar(t: TareaMovil) {
  return (t.estado || "").toLowerCase().includes("revisi");
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "2026-09-24" → "24 sep" (sin conversión de zona horaria).
export function fechaCorta(valor: string | null) {
  if (!valor) return "";
  const [, mm, dd] = valor.slice(0, 10).split("-");
  return `${Number(dd)} ${MESES[Number(mm) - 1] || ""}`;
}

// Orden de atención: por revisar → vencidas → vencen hoy → resto por fecha.
export function ordenUrgente(a: TareaMovil, b: TareaMovil) {
  const peso = (t: TareaMovil) =>
    esPorRevisar(t) ? 0 : urgencia(t) === "vencida" ? 1 : urgencia(t) === "hoy" ? 2 : 3;
  const d = peso(a) - peso(b);
  if (d !== 0) return d;
  return (a.fecha_limite || "9999").localeCompare(b.fecha_limite || "9999");
}
