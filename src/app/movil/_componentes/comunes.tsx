"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { iniciales } from "../_lib/equipo";

export function Avatar({
  nombre,
  color,
  foto,
  tam = 40,
}: {
  nombre: string;
  color?: string | null;
  foto?: string | null;
  tam?: number;
}) {
  const estilo = { width: tam, height: tam, fontSize: Math.round(tam * 0.36) };
  if (foto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={foto}
        alt={nombre}
        style={estilo}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <span
      style={{ ...estilo, background: color || "#64748b" }}
      className="rounded-full text-white font-semibold flex items-center justify-center shrink-0"
    >
      {iniciales(nombre)}
    </span>
  );
}

export function Cargando() {
  return (
    <div className="flex-1 flex items-center justify-center py-16">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
        Cargando…
      </div>
    </div>
  );
}

export function ErrorCarga({
  mensaje,
  reintentar,
}: {
  mensaje: string;
  reintentar: () => void;
}) {
  return (
    <div className="mx-4 mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
      <p>{mensaje}</p>
      <button
        type="button"
        onClick={reintentar}
        className="mt-3 h-10 px-4 rounded-lg bg-white border border-red-200 font-semibold cursor-pointer"
      >
        Reintentar
      </button>
    </div>
  );
}

// ---------- barra de navegación inferior ----------

const ICONOS: Record<string, React.ReactNode> = {
  tareas: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 10h6M9 14h6M9 18h4" />
      <rect x="9" y="2" width="6" height="3" rx="1" />
    </>
  ),
  avisos: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9Z" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </>
  ),
  equipo: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.3 2.9-5 6.5-5s6.5 1.7 6.5 5" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 6.9M21.5 20c0-2.6-1.6-4.2-4-4.7" />
    </>
  ),
  perfil: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
    </>
  ),
};

const PESTANAS = [
  { href: "/movil", clave: "tareas", texto: "Tareas" },
  { href: "/movil/avisos", clave: "avisos", texto: "Avisos" },
  { href: "/movil/equipo", clave: "equipo", texto: "Equipo" },
  { href: "/movil/perfil", clave: "perfil", texto: "Perfil" },
];

export function NavInferior() {
  const ruta = usePathname();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex px-2 pt-2.5 z-20"
      style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}
    >
      {PESTANAS.map((p) => {
        const activa =
          p.href === "/movil" ? ruta === "/movil" : ruta.startsWith(p.href);
        const color = activa ? "#2563eb" : "#94a3b8";
        return (
          <Link
            key={p.href}
            href={p.href}
            className="flex-1 flex flex-col items-center gap-1 min-h-11"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke={color}
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {ICONOS[p.clave]}
            </svg>
            <span
              className="text-[11px]"
              style={{ color, fontWeight: activa ? 600 : 500 }}
            >
              {p.texto}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
