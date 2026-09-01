import { useCallback, useEffect, useRef } from "react";

// Cierre uniforme de modales:
//  - clic en el fondo (overlay) cierra; clic dentro no.
//  - tecla Escape cierra.
//  - si el usuario ya tocó algún campo del formulario, pide confirmación antes de cerrar.
//
// El "dirty" se detecta solo con el evento onChange que burbujea de los
// inputs/selects/textarea dentro del modal — no hay que cablear nada por campo.
// Se reinicia cada vez que el modal se abre. NO reinicies el estado del
// formulario al cerrar: así el borrador sigue ahí si se cierra sin querer
// (se pierde al recargar la pestaña, que es el alcance acordado).

interface Options {
  open: boolean;
  onClose: () => void;
  // Texto de confirmación al cerrar con cambios sin guardar.
  confirmMessage?: string;
  // Forzar/desactivar el aviso de cambios sin guardar (si se omite, se detecta solo).
  dirty?: boolean;
}

export function useModalDismiss({
  open,
  onClose,
  confirmMessage = "Tienes cambios sin guardar. ¿Cerrar de todas formas?",
  dirty,
}: Options) {
  const touched = useRef(false);

  useEffect(() => {
    if (open) touched.current = false;
  }, [open]);

  const isDirty = dirty ?? touched.current;

  const requestClose = useCallback(() => {
    if (isDirty && !window.confirm(confirmMessage)) return;
    onClose();
  }, [isDirty, confirmMessage, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  // Props para el <div> overlay del modal.
  const overlayProps = {
    onMouseDown: (e: React.MouseEvent) => {
      // Solo si el mousedown empezó en el overlay mismo, no en el contenido.
      if (e.target === e.currentTarget) requestClose();
    },
    onChange: () => {
      touched.current = true;
    },
  };

  return { overlayProps, requestClose };
}
