"use client";

import React from "react";
import { useUrlFirmada } from "../lib/storageUrls";

// <img> para archivos del bucket privado: resuelve una URL firmada de vida corta
// a partir de la ruta/URL guardada. Mientras carga muestra un placeholder.
export function ArchivoImg({
  path,
  alt,
  className,
}: {
  path: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  const url = useUrlFirmada(path);
  if (!url) {
    return (
      <span
        className={`${className ?? ""} inline-block bg-slate-100 animate-pulse`}
        aria-label={alt}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt ?? ""} className={className} />;
}
