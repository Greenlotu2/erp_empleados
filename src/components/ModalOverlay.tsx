"use client";

import React from "react";
import { useModalDismiss } from "../lib/useModalDismiss";

const DEFAULT_CLASS =
  "fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-2";

interface Props {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  // Fuerza el aviso de cambios sin guardar; si se omite se detecta solo con los
  // onChange que burbujean de los campos del formulario dentro del modal.
  dirty?: boolean;
  confirmMessage?: string;
}

// Reemplaza el <div> overlay de un modal: clic en el fondo o Escape lo cierran,
// pidiendo confirmación si hay cambios sin guardar. Se monta solo cuando el modal
// está abierto (va dentro del `{cond && ( ... )}` que ya existe).
export function ModalOverlay({
  onClose,
  children,
  className = DEFAULT_CLASS,
  style,
  dirty,
  confirmMessage,
}: Props) {
  const { overlayProps } = useModalDismiss({
    open: true,
    onClose,
    dirty,
    confirmMessage,
  });
  return (
    <div {...overlayProps} className={className} style={style}>
      {children}
    </div>
  );
}
