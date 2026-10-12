"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarSesion, leerSesion } from "../../../../../lib/movilSesion";
import { PALETA_EMPLEADOS } from "../../../../../lib/coloresEmpleados";
import { Avatar, Cargando, ErrorCarga } from "../../../_componentes/comunes";
import { apiMovil, SesionExpirada } from "../../../_lib/api";
import { reducirFoto, usePerfil, type PerfilMovil } from "../../../_lib/perfil";

export default function EditarPerfilPage() {
  const { datos, setDatos, error, cargar } = usePerfil();

  const encabezado = <Encabezado />;
  if (error) return <>{encabezado}<ErrorCarga mensaje={error} reintentar={cargar} /></>;
  if (!datos) return <>{encabezado}<Cargando /></>;

  return (
    <>
      {encabezado}
      <Formulario
        perfil={datos.perfil}
        onFoto={(avatar_url) => setDatos({ ...datos, perfil: { ...datos.perfil, avatar_url } })}
      />
    </>
  );
}

function Encabezado() {
  const router = useRouter();
  return (
    <header className="bg-white border-b border-slate-200 px-4 pt-5 pb-3.5 flex items-center gap-3 sticky top-0 z-10">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/movil/perfil"))}
        aria-label="Cerrar"
        className="w-10 h-10 -ml-2 flex items-center justify-center cursor-pointer"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <h1 className="text-base font-semibold text-slate-900">Editar perfil</h1>
    </header>
  );
}

function Formulario({
  perfil: p,
  onFoto,
}: {
  perfil: PerfilMovil;
  onFoto: (url: string | null) => void;
}) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nombre: p.nombre || "",
    celular: p.celular || "",
    fecha_nacimiento: p.fecha_nacimiento || "",
    correo_personal: p.correo_personal || "",
    emergencia_nombre: p.emergencia_nombre || "",
    emergencia_telefono: p.emergencia_telefono || "",
    color: p.color || PALETA_EMPLEADOS[0],
  });
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const set = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  const manejarError = (err: any) => {
    if (err instanceof SesionExpirada) router.replace("/movil/login");
    else setAviso(err.message);
  };

  const elegirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setAviso(null);
    setSubiendoFoto(true);
    try {
      const foto = await reducirFoto(f);
      const r = await apiMovil<{ avatar_url: string }>("/api/movil/perfil/foto", {
        method: "POST",
        body: JSON.stringify(foto),
      });
      onFoto(r.avatar_url);
    } catch (err: any) {
      manejarError(err);
    } finally {
      setSubiendoFoto(false);
    }
  };

  const quitarFoto = async () => {
    setAviso(null);
    setSubiendoFoto(true);
    try {
      await apiMovil("/api/movil/perfil/foto", { method: "DELETE" });
      onFoto(null);
    } catch (err: any) {
      manejarError(err);
    } finally {
      setSubiendoFoto(false);
    }
  };

  const guardar = async () => {
    setAviso(null);
    if (!form.nombre.trim()) return setAviso("El nombre no puede quedar vacío.");
    setGuardando(true);
    try {
      const r = await apiMovil<{ perfil: PerfilMovil }>("/api/movil/perfil", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      // El nombre también vive en la sesión local (saludo, etc.).
      const sesion = leerSesion();
      if (sesion) guardarSesion(sesion.token, { ...sesion.employee, nombre: r.perfil.nombre });
      router.push("/movil/perfil");
    } catch (err: any) {
      manejarError(err);
      setGuardando(false);
    }
  };

  const campo =
    "w-full h-11 rounded-[10px] border border-slate-300 px-3 text-[15px] text-slate-900 bg-white outline-none focus:ring-2 focus:ring-blue-500";
  const etiqueta = "block text-xs font-semibold text-slate-600 mb-1.5";
  const especialidad = p.especialidad && p.especialidad !== "General" ? p.especialidad : null;

  return (
    <div className="px-4 py-3 flex flex-col gap-2.5 pb-40">
      {/* Foto */}
      <section className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3.5">
        <div className={subiendoFoto ? "opacity-50" : ""}>
          <Avatar nombre={form.nombre || p.nombre} color={form.color} foto={p.avatar_url} tam={64} />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <button
            type="button"
            disabled={subiendoFoto}
            onClick={() => archivo.current?.click()}
            className="h-9 rounded-[9px] bg-blue-50 border border-blue-200 text-blue-700 text-[13px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {subiendoFoto ? "Subiendo…" : "Tomar o elegir foto"}
          </button>
          {p.avatar_url && !subiendoFoto && (
            <button type="button" onClick={quitarFoto} className="text-xs text-slate-500 cursor-pointer">
              Quitar foto · usar iniciales
            </button>
          )}
          <input ref={archivo} type="file" accept="image/*" onChange={elegirFoto} className="hidden" />
        </div>
      </section>

      {/* Datos personales */}
      <section className="bg-white border border-slate-200 rounded-xl px-4 pt-3 pb-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Datos personales</span>
          <span className="text-[11px] text-slate-400">Los editas tú</span>
        </div>
        <div className="flex flex-col gap-2.5">
          <div>
            <label htmlFor="nombre" className={etiqueta}>Nombre completo</label>
            <input id="nombre" value={form.nombre} onChange={set("nombre")} autoComplete="name" className={campo} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <label htmlFor="celular" className={etiqueta}>Celular</label>
              <input id="celular" type="tel" inputMode="tel" value={form.celular} onChange={set("celular")} placeholder="55 1234 5678" autoComplete="tel" className={campo} />
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor="nacimiento" className={etiqueta}>Nacimiento</label>
              <input id="nacimiento" type="date" value={form.fecha_nacimiento} onChange={set("fecha_nacimiento")} className={campo} />
            </div>
          </div>
          <div>
            <label htmlFor="correo" className={etiqueta}>
              Correo personal <span className="font-normal text-slate-400">· opcional</span>
            </label>
            <input id="correo" type="email" inputMode="email" value={form.correo_personal} onChange={set("correo_personal")} className={campo} />
          </div>
          <div>
            <span className={etiqueta}>Contacto de emergencia</span>
            <div className="flex gap-2">
              <input aria-label="Nombre del contacto de emergencia" value={form.emergencia_nombre} onChange={set("emergencia_nombre")} placeholder="Nombre" className={`${campo} flex-[1.3] min-w-0`} />
              <input aria-label="Teléfono del contacto de emergencia" type="tel" inputMode="tel" value={form.emergencia_telefono} onChange={set("emergencia_telefono")} placeholder="Teléfono" className={`${campo} flex-1 min-w-0`} />
            </div>
          </div>
          <div>
            <span className={etiqueta}>Color de tu perfil</span>
            <div className="flex flex-wrap gap-2">
              {PALETA_EMPLEADOS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className="w-8 h-8 rounded-full cursor-pointer"
                  style={{
                    background: c,
                    boxShadow: form.color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : undefined,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Datos de la empresa (solo lectura) */}
      <section className="bg-slate-100 border border-slate-200 rounded-xl px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Datos de la empresa</span>
          <span className="ml-auto text-[11px] text-slate-400">Los asigna el administrador</span>
        </div>
        <div className="divide-y divide-slate-200">
          <Fila k="Rol y nivel" v={[p.rol, p.nivel].filter(Boolean).join(" · ")} />
          <Fila k="Área" v={(p.area || []).join(", ")} />
          <Fila k="Especialidad" v={especialidad} />
          <Fila k="Usuario" v={p.username} />
        </div>
      </section>

      {aviso && (
        <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{aviso}</p>
      )}

      <div className="fixed inset-x-0 bottom-[76px] z-10 bg-white border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          disabled={guardando || subiendoFoto}
          onClick={guardar}
          className="w-full h-[52px] rounded-xl bg-blue-600 text-white text-[16px] font-semibold cursor-pointer disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-[13px] text-slate-500 w-[92px] shrink-0">{k}</span>
      <span className="text-[13px] font-medium text-slate-700 flex-1 min-w-0 truncate">{v || "—"}</span>
    </div>
  );
}
