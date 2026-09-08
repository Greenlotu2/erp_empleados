import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// El bucket `documentacion` es PRIVADO. No hay URL pública: cada archivo se abre
// con una URL firmada de vida corta que solo genera una sesión autenticada.
// Aquí se centraliza esa lógica.

export const DOC_BUCKET = "documentacion";
const MARCAS = [`/object/public/${DOC_BUCKET}/`, `/object/sign/${DOC_BUCKET}/`];

// Ruta relativa dentro del bucket. Acepta:
//  - una ruta pelada: "proyectos/abc/123_file.pdf"
//  - una URL pública/firmada ya guardada (filas antiguas): la recorta.
export function rutaEnBucket(
  guardado: string | null | undefined,
): string | null {
  if (!guardado) return null;
  for (const marca of MARCAS) {
    const i = guardado.indexOf(marca);
    if (i !== -1) {
      return decodeURIComponent(guardado.slice(i + marca.length).split("?")[0]);
    }
  }
  return guardado.replace(/^\/+/, "") || null;
}

// URL firmada (válida `segundos`) para abrir o previsualizar el archivo.
export async function urlFirmada(
  guardado: string | null | undefined,
  segundos = 3600,
): Promise<string | null> {
  const ruta = rutaEnBucket(guardado);
  if (!ruta) return null;
  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(ruta, segundos);
  if (error) {
    console.error("No se pudo firmar la URL del archivo:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

// Abre el archivo en una pestaña nueva, firmando la URL al momento del click.
export async function abrirArchivo(guardado: string | null | undefined) {
  const url = await urlFirmada(guardado);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  else alert("No se pudo abrir el archivo. Vuelve a intentarlo.");
}

// Hook para <img>/previews que necesitan la URL desde el render.
export function useUrlFirmada(guardado: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!guardado) {
      setUrl(null);
      return;
    }
    urlFirmada(guardado).then((u) => {
      if (vivo) setUrl(u);
    });
    return () => {
      vivo = false;
    };
  }, [guardado]);
  return url;
}
