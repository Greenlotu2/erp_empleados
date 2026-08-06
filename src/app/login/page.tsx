'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr'; // Usar cliente oficial de SSR para Cookies

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Instanciar cliente de navegador (escribe y lee cookies en lugar de localStorage)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Autenticación inicial con Supabase (asigna las cookies en el navegador)
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error('Credenciales inválidas. Revisa tu correo y contraseña.');
      }

      const user = authData.user;
      if (!user) {
        throw new Error('No se pudo obtener la información de sesión.');
      }

      // 2. Consultar el ROL en la tabla 'empleados'
      const { data: empleadoData, error: empError } = await supabase
        .from('empleados')
        .select('rol')
        .eq('user_id', user.id)
        .maybeSingle();

      if (empError) {
        console.error('Error al consultar el perfil:', empError);
      }

      const userRole = empleadoData?.rol?.toLowerCase().trim();

      // 3. RESTRICCIÓN DE EMPLEADOS: Si no es admin, revocar acceso
      if (userRole !== 'admin' && userRole !== 'administrador') {
        // Cerrar la sesión de Supabase de inmediato (borra cookies)
        await supabase.auth.signOut();
        throw new Error('Acceso denegado: Esta plataforma es exclusiva para Administradores.');
      }

      // 4. Forzar refresco de router para sincronizar las cookies con el Middleware y redirigir
      router.refresh();
      router.push('/'); // Ajusta a la ruta exacta de tu dashboard

    } catch (error: any) {
      console.error('Error durante inicio de sesión:', error);
      setErrorMessage(error.message || 'Error al iniciar sesión.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-[#e94f1b] to-[#21388e] flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
      
      {/* Contenido */}
      <div className="sm:mx-auto w-full sm:max-w-md text-center">
        {/* Icono / Logo minimalista */}
        <img src="logo_rocal_bl.png" alt="Logo" className="mx-auto" />
        
        <p className="mt-2 text-center text-sm text-white">
          ERP Empresarial - Rocal S.A. de C.V. <br />
        </p>
      </div>

      <div className="mt-8 sm:mx-auto w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-slate-100 rounded-2xl sm:px-10">
          
          {/* Mensaje de Error (si existe) */}
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
              ⚠️ {errorMessage}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Correo electrónico
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2.5 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black transition-all"
                  placeholder="tu@empresa.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2.5 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-slate-700 select-none">
                  Recordarme
                </label>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Validando credenciales...
                  </span>
                ) : (
                  'Ingresar al Panel'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}