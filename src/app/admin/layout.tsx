"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabase";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        // 1. Obtener la sesión activa
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session || !session.user) {
          router.push("/login");
          return;
        }

        const userEmail = session.user.email?.trim().toLowerCase() || "";

        // 2. Consultar el rol en 'empleados' filtrando 'username' (que guarda el email) o 'id'
        const { data: empleado, error } = await supabase
          .from("empleados")
          .select("rol")
          .or(`username.ilike.${userEmail},id.eq.${session.user.id}`)
          .maybeSingle();

        if (error) {
          console.error("Error al consultar rol en la tabla empleados:", error);
        }

        const userRole = empleado?.rol?.toLowerCase().trim();

        // 3. Validar si es Administrador
        if (userRole === "admin" || userRole === "administrador") {
          setIsAuthorized(true);
        } else {
          console.warn("Acceso denegado: Rol no administrador ->", userRole);
          // Redirigir sin hacer signOut para no romper el estado del cliente
          router.push("/login");
        }
      } catch (err) {
        console.error("Error durante la verificación de permisos:", err);
        router.push("/login");
      }
    };

    checkAdminAccess();
  }, [router]);

  if (!isAuthorized) {
    return (
      <div className="h-screen w-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-600">
            Verificando permisos de Administrador...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
