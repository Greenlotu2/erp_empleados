"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cerrarSesion } from "../../../../lib/movilSesion";
import { Avatar, Cargando, ErrorCarga } from "../../_componentes/comunes";
import { fechaLarga, usePerfil } from "../../_lib/perfil";
import {
  activarPush,
  desactivarPush,
  estadoPush,
  type EstadoPush,
} from "../../_lib/push";

export default function PerfilPage() {
  const router = useRouter();
  const { datos, error, cargar } = usePerfil();

  const encabezado = (
    <header className="bg-white border-b border-slate-200 px-4 pt-5 pb-3">
      <h1 className="text-xl font-semibold text-slate-900">Mi perfil</h1>
    </header>
  );

  if (error) return <>{encabezado}<ErrorCarga mensaje={error} reintentar={cargar} /></>;
  if (!datos) return <>{encabezado}<Cargando /></>;

  const p = datos.perfil;
  const especialidad = p.especialidad && p.especialidad !== "General" ? p.especialidad : null;
  const faltanDatos = !p.celular || !p.emergencia_telefono;

  return (
    <>
      {encabezado}

      <div className="px-4 pt-3 flex flex-col gap-2.5">
        {/* Identidad */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center">
          <Avatar nombre={p.nombre} color={p.color} foto={p.avatar_url} tam={76} />
          <p className="text-[19px] font-semibold text-slate-900 mt-3 text-center">{p.nombre}</p>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {[p.nivel, especialidad].filter(Boolean).join(" · ")}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5 mt-2.5">
            {(p.area || []).map((a) => (
              <span key={a} className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-md">
                {a}
              </span>
            ))}
            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">
              {datos.personasACargo} {datos.personasACargo === 1 ? "persona" : "personas"} a cargo
            </span>
          </div>
          <Link
            href="/movil/perfil/editar"
            className="w-full h-11 rounded-[11px] border border-slate-300 text-slate-700 text-sm font-semibold flex items-center justify-center gap-2 mt-3.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            Editar perfil
          </Link>
        </section>

        {faltanDatos && (
          <Link
            href="/movil/perfil/editar"
            className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] text-amber-800"
          >
            Agrega tu celular y un contacto de emergencia para que tu equipo pueda localizarte.
          </Link>
        )}

        {/* Datos */}
        <section className="bg-white border border-slate-200 rounded-xl px-4 py-0.5 divide-y divide-slate-100">
          <Fila etiqueta="Usuario" valor={p.username} />
          <Fila etiqueta="Celular" valor={p.celular} />
          <Fila etiqueta="Nacimiento" valor={fechaLarga(p.fecha_nacimiento)} />
          <Fila
            etiqueta="Emergencia"
            valor={
              p.emergencia_nombre || p.emergencia_telefono
                ? [p.emergencia_nombre, p.emergencia_telefono].filter(Boolean).join(" · ")
                : null
            }
          />
          <div className="flex items-center gap-3 py-3">
            <span className="text-sm text-slate-500 w-24 shrink-0">Color</span>
            <span className="w-5 h-5 rounded-full" style={{ background: p.color || "#64748b" }} />
            <span className="text-[13px] text-slate-400 font-mono">{p.color}</span>
          </div>
        </section>

        <Notificaciones />

        <button
          type="button"
          onClick={async () => {
            await desactivarPush();
            cerrarSesion();
            router.replace("/movil/login");
          }}
          className="h-[46px] rounded-xl bg-white border border-red-200 text-red-700 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
            <path d="M16 17l5-5-5-5M21 12H9" />
          </svg>
          Cerrar sesión
        </button>
      </div>
    </>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-sm text-slate-500 w-24 shrink-0">{etiqueta}</span>
      <span className={`text-sm flex-1 min-w-0 truncate ${valor ? "text-slate-800" : "text-slate-400"}`}>
        {valor || "Sin capturar"}
      </span>
    </div>
  );
}

function Notificaciones() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    estadoPush().then(setEstado);
  }, []);

  const cambiar = async () => {
    setAviso(null);
    setOcupado(true);
    try {
      if (estado === "activo") {
        await desactivarPush();
      } else {
        await activarPush();
        setAviso("Listo. Te mandamos una notificación de prueba.");
      }
      setEstado(await estadoPush());
    } catch (err: any) {
      setAviso(err.message || "No se pudieron activar las notificaciones.");
      setEstado(await estadoPush());
    } finally {
      setOcupado(false);
    }
  };

  const activo = estado === "activo";
  const puede = estado === "activo" || estado === "inactivo";

  return (
    <section className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="flex items-center gap-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M18 9a6 6 0 0 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9Z" />
          <path d="M10.5 20a2 2 0 0 0 3 0" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800">Notificaciones</p>
          <p className="text-xs text-slate-400">Entregas, vencimientos y reuniones</p>
        </div>
        {puede && (
          <button
            type="button"
            role="switch"
            aria-checked={activo}
            aria-label="Notificaciones"
            disabled={ocupado}
            onClick={cambiar}
            className={`w-[46px] h-[26px] rounded-full p-[3px] flex shrink-0 transition-colors cursor-pointer disabled:opacity-50 ${
              activo ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white shadow" />
          </button>
        )}
      </div>
      {estado === "ios-sin-instalar" && (
        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 mt-2.5 leading-relaxed">
          En iPhone primero agrega la app a tu pantalla de inicio: en Safari toca
          <strong> Compartir </strong>→<strong> Agregar a inicio</strong>, ábrela desde ahí y
          vuelve a esta pantalla.
        </p>
      )}
      {estado === "no-soportado" && (
        <p className="text-xs text-slate-500 mt-2">Este navegador no admite notificaciones.</p>
      )}
      {estado === "bloqueado" && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2.5">
          Las notificaciones están bloqueadas para este sitio. Actívalas en los ajustes del
          navegador o del teléfono y vuelve a intentar.
        </p>
      )}
      {aviso && <p className="text-xs text-slate-600 mt-2">{aviso}</p>}
    </section>
  );
}
