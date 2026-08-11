import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/api-auth';
import bcrypt from 'bcryptjs';
import { generateToken } from '../../../../lib/auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // 💡 Acepta tanto 'email' (extensión) como 'username' (formulario web)
    const emailInput = body.email || body.username;
    const passwordInput = body.password;

    if (!emailInput || !passwordInput) {
      return NextResponse.json(
        { error: 'Correo/Usuario y contraseña requeridos' },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanEmail = emailInput.trim().toLowerCase();

    // Buscar el empleado por username o correo
    const { data: empleado, error } = await supabaseAdmin
      .from('empleados')
      .select('*')
      .or(`username.ilike.${cleanEmail},email.ilike.${cleanEmail}`)
      .maybeSingle();

    if (error || !empleado) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 🔒 Verificar contraseña con bcrypt (con fallback temporal a texto plano por compatibilidad)
    let isPasswordValid = false;
    if (empleado.password_hash) {
      isPasswordValid = await bcrypt.compare(passwordInput, empleado.password_hash);
    } else if (empleado.password) {
      isPasswordValid = empleado.password === passwordInput;
    }

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 🔑 GENERAR JWT REAL CON EXPIRACIÓN (8h)
    const token = generateToken({
      id: empleado.id,
      email: empleado.username || empleado.email,
      rol: empleado.rol || 'Practicante',
    });

    // 💡 Estructura unificada de respuesta para Web y Extensión
    return NextResponse.json(
      {
        success: true,
        token: token, // Para panel.js -> data.token
        employee: {
          id: empleado.id,
          nombre: empleado.nombre,
          email: empleado.username || empleado.email,
          rol: empleado.rol,
          horas_acumuladas: empleado.horas_acumuladas || 0,
          horas_totales_objetivo: empleado.horas_totales_objetivo
        }
      },
      { status: 200, headers: corsHeaders }
    );

  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno del servidor', details: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}