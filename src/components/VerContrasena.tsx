"use client";

// Botón del "ojo" para mostrar/ocultar una contraseña mientras se escribe.
// Va dentro de un contenedor `relative`, a la derecha del <input>; el input
// necesita padding derecho (pr-10 o similar) para que el texto no quede debajo.
export function VerContrasena({
  visible,
  onClick,
  className = "",
}: {
  visible: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      aria-pressed={visible}
      title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      className={`absolute inset-y-0 right-0 flex items-center justify-center px-3 text-slate-400 hover:text-slate-600 cursor-pointer ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        {visible ? (
          <>
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </>
        ) : (
          <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}
