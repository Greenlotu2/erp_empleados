"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { ModalOverlay } from "./ModalOverlay";

// Modal para que Gerencia/Coordinación restablezca la contraseña de un
// integrante (p. ej. si la olvidó). La nueva sirve para la web, la extensión
// y la app. Se puede escribir o generar una temporal para dictársela.

const MIN = 8;
// Sin 0/O ni 1/l/I para que se pueda dictar o copiar sin confusiones.
const CARACTERES = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generar(largo = 10) {
  const azar = crypto.getRandomValues(new Uint32Array(largo));
  return Array.from(azar, (n) => CARACTERES[n % CARACTERES.length]).join("");
}

export function RestablecerContrasena({
  empleado,
  onClose,
}: {
  empleado: { id: string; name: string };
  onClose: () => void;
}) {
  const [nueva, setNueva] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (nueva.length < MIN) return setError(`Debe tener al menos ${MIN} caracteres.`);
    setEnviando(true);
    try {
      const res = await fetch("/admin/restablecer-contrasena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleadoId: empleado.id, nueva }),
      });
      // Con la sesión vencida, el proxy redirige a /login y fetch recibe esa
      // página con 200: no es un éxito.
      if (res.redirected || !res.headers.get("content-type")?.includes("json")) {
        throw new Error("Tu sesión expiró. Vuelve a iniciar sesión e inténtalo de nuevo.");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "No se pudo restablecer la contraseña.");
      }
      setLista(nueva);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async () => {
    if (!lista) return;
    try {
      await navigator.clipboard.writeText(lista);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} dirty={!lista && nueva.length > 0}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 p-3 space-y-2">
        <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Icon name="key" size={14} className="text-slate-500" />
            Restablecer contraseña
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <Icon name="x" size={16} />
          </button>
        </div>

        {lista ? (
          <div className="space-y-2 text-xs">
            <p className="text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5">
              Listo. <strong>{empleado.name}</strong> ya puede entrar con esta contraseña a la web, la
              extensión y la app.
            </p>
            <div className="flex items-center gap-1">
              <code className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-sm text-slate-900 select-all">
                {lista}
              </code>
              <button
                type="button"
                onClick={copiar}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1.5 rounded-lg font-semibold cursor-pointer"
              >
                {copiada ? "Copiada" : "Copiar"}
              </button>
            </div>
            <p className="text-slate-500">
              Compártela por un medio privado y pídele que la cambie desde su perfil. No se
              volverá a mostrar.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-xl font-bold cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={guardar} className="space-y-2 text-xs">
            <p className="text-slate-600">
              Nueva contraseña para <strong className="text-slate-900">{empleado.name}</strong>. Su
              contraseña anterior dejará de funcionar en la web, la extensión y la app.
            </p>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Nueva contraseña
              </label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={`Mínimo ${MIN} caracteres`}
                  className="flex-1 border border-slate-300 rounded-xl p-1.5 text-slate-900 font-mono bg-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => setNueva(generar())}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 rounded-xl font-semibold cursor-pointer flex items-center gap-1"
                >
                  <Icon name="refresh" size={12} /> Generar
                </button>
              </div>
            </div>
            {error && (
              <p className="text-red-700 bg-red-50 border border-red-100 rounded-lg px-1.5 py-1">{error}</p>
            )}
            <div className="flex gap-1 pt-1.5 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-100 text-slate-700 py-1.5 rounded-xl font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-1.5 rounded-xl font-bold cursor-pointer disabled:opacity-50"
              >
                {enviando ? "Guardando…" : "Restablecer"}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalOverlay>
  );
}
