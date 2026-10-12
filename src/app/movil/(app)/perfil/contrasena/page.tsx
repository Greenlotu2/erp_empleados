"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiMovil, SesionExpirada } from "../../../_lib/api";

const MIN = 8;

export default function CambiarContrasenaPage() {
  const router = useRouter();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [ver, setVer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (nueva.length < MIN) return setError(`La nueva contraseña debe tener al menos ${MIN} caracteres.`);
    if (nueva !== confirmar) return setError("La confirmación no coincide con la nueva contraseña.");
    if (nueva === actual) return setError("La nueva contraseña debe ser distinta de la actual.");
    setEnviando(true);
    try {
      await apiMovil("/api/movil/perfil/contrasena", {
        method: "POST",
        body: JSON.stringify({ actual, nueva }),
      });
      setListo(true);
    } catch (err: any) {
      if (err instanceof SesionExpirada) router.replace("/movil/login");
      else setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const encabezado = (
    <header className="bg-white border-b border-slate-200 px-4 pt-5 pb-3.5 flex items-center gap-3 sticky top-0 z-10">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/movil/perfil"))}
        aria-label="Volver"
        className="w-10 h-10 -ml-2 flex items-center justify-center cursor-pointer"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
      </button>
      <h1 className="text-base font-semibold text-slate-900">Cambiar contraseña</h1>
    </header>
  );

  if (listo) {
    return (
      <>
        {encabezado}
        <div className="px-6 pt-14 flex flex-col items-center text-center">
          <span className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h2 className="text-lg font-semibold text-slate-900 mt-4">Contraseña actualizada</h2>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
            Úsala la próxima vez que entres a la app, a la web o a la extensión.
          </p>
          <Link href="/movil/perfil" className="w-full h-[50px] mt-8 rounded-xl bg-blue-600 text-white text-[15px] font-semibold flex items-center justify-center">
            Volver a mi perfil
          </Link>
        </div>
      </>
    );
  }

  const campo =
    "w-full h-12 rounded-xl border border-slate-300 px-3 text-[15px] text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500";
  const etiqueta = "block text-xs font-semibold text-slate-600 mb-1.5";
  const tipo = ver ? "text" : "password";

  return (
    <>
      {encabezado}
      <form onSubmit={guardar} className="px-4 py-4 flex flex-col gap-3.5">
        <p className="text-[13px] text-slate-500 leading-relaxed">
          La misma contraseña sirve para la app, la web y la extensión; se cambia en los tres.
        </p>

        <div>
          <label htmlFor="actual" className={etiqueta}>Contraseña actual</label>
          <input id="actual" type={tipo} value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" required className={campo} />
        </div>
        <div>
          <label htmlFor="nueva" className={etiqueta}>Nueva contraseña</label>
          <input id="nueva" type={tipo} value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" required className={campo} />
          <p className={`text-xs mt-1.5 ${nueva && nueva.length < MIN ? "text-amber-700" : "text-slate-400"}`}>
            Mínimo {MIN} caracteres.
          </p>
        </div>
        <div>
          <label htmlFor="confirmar" className={etiqueta}>Confirmar nueva contraseña</label>
          <input id="confirmar" type={tipo} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" required className={campo} />
        </div>

        <label className="flex items-center gap-2 text-[13px] text-slate-600">
          <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} className="w-4 h-4" />
          Mostrar contraseñas
        </label>

        {error && (
          <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="h-[52px] rounded-xl bg-blue-600 text-white text-[16px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {enviando ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </form>
    </>
  );
}
