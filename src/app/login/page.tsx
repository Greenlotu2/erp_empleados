'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr'; // Cliente SSR oficial para manejar Cookies

export default function LoginPage() {
  const router = useRouter();
  const [userInput, setUserInput] = useState(''); // Acepta tanto usuario como correo
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Instanciar cliente de navegador (escribe y lee cookies de sesión SSR)
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
      const cleanInput = userInput.trim().toLowerCase();

      // 1. Obtener el email real a partir del username o email ingresado
      let targetEmail = cleanInput;

      const { data: empleadoMatch } = await supabase
        .from('empleados')
        .select('username, user_id')
        .or(`username.ilike.${cleanInput},id.neq.00000000-0000-0000-0000-000000000000`)
        .ilike('username', cleanInput)
        .maybeSingle();

      if (empleadoMatch?.username && empleadoMatch.username.includes('@')) {
        targetEmail = empleadoMatch.username;
      }

      // 2. Autenticación con Supabase Auth (asigna las cookies SSR en el navegador)
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password,
      });

      if (authError) {
        throw new Error('Credenciales inválidas. Revisa tu usuario/correo y contraseña.');
      }

      const user = authData.user;
      if (!user) {
        throw new Error('No se pudo obtener la información de sesión.');
      }

      // 3. Consultar el ROL en la tabla 'empleados'
      const { data: empleadoData, error: empError } = await supabase
        .from('empleados')
        .select('rol')
        .or(`user_id.eq.${user.id},username.ilike.${cleanInput}`)
        .maybeSingle();

      if (empError) {
        console.error('Error al consultar el perfil:', empError);
      }

      const userRole = empleadoData?.rol?.toLowerCase().trim();

      // 4. RESTRICCIÓN DE EMPLEADOS: Si no es admin, revocar acceso
      if (userRole !== 'admin' && userRole !== 'administrador') {
        // Cerrar la sesión de Supabase de inmediato (borra las cookies)
        await supabase.auth.signOut();
        throw new Error('Acceso denegado: Esta plataforma web es exclusiva para Administradores.');
      }

      // 5. Forzar refresco de router para sincronizar las cookies con Middleware y redirigir
      router.refresh();
      router.push('/');

    } catch (error: any) {
      console.error('Error durante inicio de sesión:', error);
      setErrorMessage(error.message || 'Error al iniciar sesión.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-[#e94f1b] to-[#21388e] flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4 font-sans">
      
      {/* Encabezado e Isotipo */}
      <div className="sm:mx-auto w-full sm:max-w-md text-center">
        <img src="/logo_rocal_bl.png" alt="Logo Rocal" className="mx-auto h-50 w-100 object-contain" />
        
        <p className="mt-3 text-center text-sm font-medium text-white tracking-wide">
          ERP Empresarial - Rocal S.A. de C.V.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl border border-slate-100 rounded-2xl sm:px-10">
          
          {/* Alerta de Error */}
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="userInput" className="block text-sm font-medium text-slate-700">
                Usuario o Correo electrónico
              </label>
              <div className="mt-1">
                <input
                  id="userInput"
                  name="userInput"
                  type="text"
                  autoComplete="username"
                  required
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  className="appearance-none block w-full px-3 py-2.5 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black text-sm transition-all"
                  placeholder="usuario o tu@empresa.com"
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
                  className="appearance-none block w-full px-3 py-2.5 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black text-sm transition-all"
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
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2 block text-slate-700 text-xs select-none cursor-pointer">
                  Recordarme
                </label>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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