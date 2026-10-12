"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cerrarSesion,
  leerSesion,
  sesionPermitida,
} from "../../../lib/movilSesion";
import { NavInferior } from "../_componentes/comunes";
import { registrarServiceWorker } from "../_lib/push";

// Pantallas con sesión iniciada (todo /movil salvo /movil/login). Si no hay
// sesión válida —o es de un nivel sin acceso— manda al login antes de pintar.
export default function AppMovilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const sesion = leerSesion();
    if (!sesion || !sesionPermitida(sesion.employee)) {
      cerrarSesion();
      router.replace("/movil/login");
      return;
    }
    registrarServiceWorker();
    // El "deslizar para actualizar" lo hace la app (DeslizarParaActualizar);
    // se apaga el del navegador para que no recargue la página completa.
    document.documentElement.style.overscrollBehaviorY = "contain";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListo(true);
  }, [router]);

  if (!listo) return null;

  return (
    <div className="min-h-screen flex flex-col pb-24">
      {children}
      <NavInferior />
    </div>
  );
}
