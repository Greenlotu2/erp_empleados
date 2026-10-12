"use client";

import { useRouter } from "next/navigation";
import { cerrarSesion, leerSesion } from "../../../../lib/movilSesion";
import { Avatar } from "../../_componentes/comunes";

// Versión mínima: identidad y cerrar sesión. La edición de datos personales y
// foto llega en otra tanda (ver mockup, "Mi perfil" / "Editar perfil").
export default function PerfilPage() {
  const router = useRouter();
  const empleado = leerSesion()?.employee;

  return (
    <>
      <header className="bg-white border-b border-slate-200 px-4 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-slate-900">Mi perfil</h1>
      </header>

      <div className="px-4 pt-3 flex flex-col gap-2.5">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center">
          <Avatar nombre={empleado?.nombre || "?"} color="#2563eb" tam={76} />
          <p className="text-[19px] font-semibold text-slate-900 mt-3">
            {empleado?.nombre}
          </p>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {[empleado?.nivel, empleado?.rol].filter(Boolean).join(" · ")}
          </p>
          <p className="text-[13px] text-slate-400 mt-0.5">{empleado?.email}</p>
        </div>

        <button
          type="button"
          onClick={() => {
            cerrarSesion();
            router.replace("/movil/login");
          }}
          className="h-[46px] rounded-xl bg-white border border-red-200 text-red-700 text-sm font-semibold cursor-pointer"
        >
          Cerrar sesión
        </button>
      </div>
    </>
  );
}
