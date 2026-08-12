import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/api-auth'
import bcrypt from 'bcryptjs';
import { generateToken } from '../../../../lib/auth'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // La extensión envía { email, password }, este fallback acepta ambos
    const emailInput = body.email || body.username;
    const passwordInput = body.password;

    if (!emailInput || !passwordInput) {
      return NextResponse.json(
        { error: 'Correo/Usuario y contraseña requeridos' },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanEmail = emailInput.trim().toLowerCase();

    // 1. Buscar primero en la columna 'username' (donde se guarda el correo/usuario)
    let { data: empleado } = await supabaseAdmin
      .from('empleados')
      .select('*')
      .ilike('username', cleanEmail)
      .maybeSingle();

    // 2. Si no se encontró en 'username', intentar por la columna 'email' de forma segura
    if (!empleado) {
      try {
        const { data: empByEmail } = await supabaseAdmin
          .from('empleados')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (empByEmail) {
          empleado = empByEmail;
        }
      } catch (e) {
        // Ignorar si la columna 'email' no existe en la base de datos
      }
    }

    if (!empleado) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 3. Verificar contraseña y detectar si requiere migración a Bcrypt
    let isPasswordValid = false;
    let needsPasswordMigration = false;

    if (empleado.password_hash) {
      isPasswordValid = await bcrypt.compare(passwordInput, empleado.password_hash);
    } else if (empleado.password) {
      isPasswordValid = empleado.password === passwordInput;
      if (isPasswordValid) {
        needsPasswordMigration = true;
      }
    }

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 🔄 4. MIGRACIÓN AL VUELO: Si autenticó por texto plano, hashea y elimina el texto plano
    if (needsPasswordMigration) {
      const newHash = await bcrypt.hash(passwordInput, 10);
      await supabaseAdmin
        .from('empleados')
        .update({
          password_hash: newHash,
          password: null,
        })
        .eq('id', empleado.id);
    }

    // 🔑 5. Generar Token JWT firmado
    const token = generateToken({
      id: empleado.id,
      email: empleado.username || empleado.email || cleanEmail,
      rol: empleado.rol || 'Practicante',
    });

    return NextResponse.json(
      {
        success: true,
        token,
        employee: {
          id: empleado.id,
          nombre: empleado.nombre,
          email: empleado.username || empleado.email || cleanEmail,
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