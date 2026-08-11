import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../lib/api-auth';
import bcrypt from 'bcryptjs';
import { generateToken } from '../../lib/auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const emailInput = body.email || body.username;
    const passwordInput = body.password;

    if (!emailInput || !passwordInput) {
      return NextResponse.json(
        { error: 'Correo/Usuario y contraseña requeridos' },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanEmail = emailInput.trim().toLowerCase();

    // 1. Buscar al empleado por username o correo
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

    // 2. Verificar contraseña y detectar si requiere migración a Bcrypt
    let isPasswordValid = false;
    let needsPasswordMigration = false;

    if (empleado.password_hash) {
      isPasswordValid = await bcrypt.compare(passwordInput, empleado.password_hash);
    } else if (empleado.password) {
      isPasswordValid = empleado.password === passwordInput;
      if (isPasswordValid) {
        needsPasswordMigration = true; // Flag para migrar en este request
      }
    }

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 🔄 3. MIGRACIÓN AL VUELO: Si entró por texto plano, guarda su hash con bcrypt y limpia el texto plano
    if (needsPasswordMigration) {
      const newHash = await bcrypt.hash(passwordInput, 10);
      await supabaseAdmin
        .from('empleados')
        .update({
          password_hash: newHash,
          password: null, // Elimina la contraseña en texto plano
        })
        .eq('id', empleado.id);
    }

    // 🔑 4. Generar Token JWT firmado con expiración de 8 horas
    const token = generateToken({
      id: empleado.id,
      email: empleado.username || empleado.email,
      rol: empleado.rol || 'Practicante',
    });

    // 5. Respuesta unificada
    return NextResponse.json(
      {
        success: true,
        token: token,
        employee: {
          id: empleado.id,
          nombre: empleado.nombre,
          email: empleado.username || empleado.email,
          rol: empleado.rol,
          horas_acumuladas: empleado.horas_acumuladas || 0,
          horas_totales_objetivo: empleado.horas_totales_objetivo,
        },
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