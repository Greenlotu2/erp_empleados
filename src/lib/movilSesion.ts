// Sesión de la PWA móvil — un JWT propio (el mismo que ya usa la extensión de
// Chrome vía /api/auth/login), guardado en localStorage. No usa las cookies de
// Supabase Auth del dashboard web: cualquier rol entra aquí, no solo admins.

export interface MovilEmpleado {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  horas_acumuladas: number;
  horas_totales_objetivo: number | null;
  puntos_recompensa: number;
}

const CLAVE = "movil_sesion";

export function guardarSesion(token: string, employee: MovilEmpleado) {
  localStorage.setItem(CLAVE, JSON.stringify({ token, employee }));
}

export function leerSesion(): {
  token: string;
  employee: MovilEmpleado;
} | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cerrarSesion() {
  localStorage.removeItem(CLAVE);
}
