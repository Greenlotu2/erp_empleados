// Funciones puras sobre las rutas del bucket privado de documentos. Viven aparte
// de storageUrls.ts (que usa el cliente de Supabase del navegador) para que las
// rutas de la API también puedan usarlas en el servidor.

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
