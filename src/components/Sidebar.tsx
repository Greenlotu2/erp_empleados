'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // Cliente de Supabase SSR para gestionar las cookies de sesión
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleLogout = async () => {
    // 1. Destruye la sesión y limpia las cookies
    await supabase.auth.signOut();
    
    // 2. Refresca para notificar al Middleware y redirige al login
    router.refresh();
    router.push('/login');
  };

  // Helper para aplicar estilos activos/inactivos
  const getLinkClasses = (path: string) => {
    const isActive = pathname === path;
    return `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive 
        ? 'bg-blue-600 text-white shadow-sm' 
        : 'hover:bg-slate-800 text-slate-300'
    }`;
  };

  return (
    <aside className="w-60 bg-slate-900 text-slate-300 flex flex-col shrink-0 hidden md:flex h-full select-none">
      {/* Branding */}
      <div className="p-5 border-b border-slate-800 flex items-center gap-3">
        <span className="text-xl">💼</span>
        <span className="font-bold text-white text-base tracking-tight">ERP Admin</span>
      </div>

      {/* Navegación Principal */}
      <nav className="flex-1 p-3 space-y-1">
        <Link href="/admin/revisiones" className={getLinkClasses('/admin/revisiones')}>
          ✅ Revisiones y Tareas
        </Link>
        <Link href="/" className={getLinkClasses('/')}>
          📊 Panel Principal
        </Link>
        <Link href="/admin/historial" className={getLinkClasses('/admin/historial')}>
          📝 Historial Tareas
        </Link>
        <Link href="/admin/ruta-critica" className={getLinkClasses('/admin/ruta-critica')}>
          📍 Ruta Crítica
        </Link>
      </nav>

      {/* Footer del Sidebar con Botón de Logout */}
      <div className="p-3 border-t border-slate-800 space-y-3">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all cursor-pointer"
        >
          <span>🚪</span>
          <span>Cerrar Sesión</span>
        </button>

        <div className="text-[10px] text-slate-500 text-center pt-1 border-t border-slate-800/60">
          v1.0.0 - Modo Fijo
        </div>
      </div>
    </aside>
  );
}