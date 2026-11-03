"use client";

import { useCallback, useEffect, useState } from "react";
import { apiMovil } from "./api";
import { useRefrescoAlAvisar } from "./equipo";

// Quién está en obra hoy y cómo cambiarlo (solo Gerencia y Coordinación llegan aquí).
export function useEnObra() {
  const [ids, setIds] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    try {
      const d = await apiMovil<{ enObra: string[] }>("/api/movil/en-obra");
      setIds(new Set(d.enObra));
    } catch {
      // sin conexión: se queda lo último
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  useRefrescoAlAvisar(cargar);

  const cambiar = async (id: string, valor: boolean) => {
    setIds((prev) => {
      const n = new Set(prev);
      if (valor) n.add(id);
      else n.delete(id);
      return n;
    });
    try {
      await apiMovil("/api/movil/en-obra", {
        method: "POST",
        body: JSON.stringify({ empleadoId: id, enObra: valor }),
      });
    } catch (err: any) {
      alert(err.message || "No se pudo cambiar el estado.");
      cargar();
    }
  };

  return { ids, cambiar };
}
