"use client";

import { useEffect, useState } from "react";
import { leerSesion } from "../../../lib/movilSesion";
import { apiMovil } from "./api";
import { useRefrescoAlAvisar } from "./equipo";

// Cuántas cosas esperan atención (mismo "N por atender" de la pantalla Avisos).
// Una sola copia compartida: la barra inferior la mantiene al día y cualquier
// pantalla puede leerla. También se pone en el ícono de la app (iPhone/Android
// instalada) cuando el navegador lo permite.

// Gerencia y Coordinación atienden revisiones; un trabajador ya entregó lo suyo.
const esMando = () => {
  const nivel = leerSesion()?.employee?.nivel;
  return nivel === "Gerencia" || nivel === "Coordinador";
};

let conteo = 0;
let cargando = false;
const oyentes = new Set<(n: number) => void>();

function fijar(n: number) {
  conteo = n;
  oyentes.forEach((f) => f(n));
  try {
    if (n > 0) navigator.setAppBadge?.(n);
    else navigator.clearAppBadge?.();
  } catch {
    // el navegador no soporta insignias en el ícono
  }
}

async function actualizar() {
  if (cargando) return;
  cargando = true;
  try {
    const d = await apiMovil<{
      porRevisar: unknown[];
      porVencer: unknown[];
      reuniones: unknown[];
      nuevas?: unknown[];
    }>("/api/movil/avisos");
    fijar(
      (esMando() ? d.porRevisar.length : 0) +
        d.porVencer.length +
        d.reuniones.length +
        (d.nuevas?.length || 0),
    );
  } catch {
    // sin conexión o sesión vencida: se queda el último número
  } finally {
    cargando = false;
  }
}

// Solo lee el número (lo actualiza quien use useConteoAvisos).
export function useConteoLeer() {
  const [n, setN] = useState(conteo);
  useEffect(() => {
    oyentes.add(setN);
    setN(conteo);
    return () => {
      oyentes.delete(setN);
    };
  }, []);
  return n;
}

// Lee el número y lo mantiene al día: al cambiar de pantalla, cada minuto, al
// llegar un push y al volver a la app.
export function useConteoAvisos(ruta: string) {
  const n = useConteoLeer();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    actualizar();
  }, [ruta]);
  useEffect(() => {
    const t = setInterval(actualizar, 60000);
    return () => clearInterval(t);
  }, []);
  useRefrescoAlAvisar(actualizar);
  return n;
}
