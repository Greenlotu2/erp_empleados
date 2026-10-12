"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMovil, SesionExpirada } from "./api";

export interface PerfilMovil {
  id: string;
  nombre: string;
  username: string | null;
  rol: string | null;
  nivel: string | null;
  area: string[] | null;
  especialidad: string | null;
  color: string | null;
  avatar_url: string | null;
  celular: string | null;
  fecha_nacimiento: string | null;
  correo_personal: string | null;
  emergencia_nombre: string | null;
  emergencia_telefono: string | null;
}

export interface DatosPerfil {
  perfil: PerfilMovil;
  personasACargo: number;
  tareasPropias: number;
}

export function usePerfil() {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosPerfil | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setError(null);
      setDatos(await apiMovil<DatosPerfil>("/api/movil/perfil"));
    } catch (err: any) {
      if (err instanceof SesionExpirada) router.replace("/movil/login");
      else setError(err.message);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  return { datos, setDatos, error, cargar };
}

// Recorta al centro en cuadrado y reduce a 512×512 JPEG antes de subir: una
// foto de cámara de varios MB queda en ~50–100 KB.
export async function reducirFoto(
  archivo: File,
  lado = 512,
): Promise<{ base64: string; tipo: string }> {
  const bitmap = await createImageBitmap(archivo);
  const corte = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la foto.");
  ctx.drawImage(
    bitmap,
    (bitmap.width - corte) / 2,
    (bitmap.height - corte) / 2,
    corte,
    corte,
    0,
    0,
    lado,
    lado,
  );
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: dataUrl.split(",")[1], tipo: "image/jpeg" };
}

// "2001-03-14" → "14 de marzo de 2001" (sin conversión de zona horaria).
export function fechaLarga(valor: string | null) {
  if (!valor) return "";
  const [y, m, d] = valor.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
