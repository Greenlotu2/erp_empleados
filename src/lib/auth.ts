// lib/auth.ts
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secreto-cambiar-en-env';

export interface AuthenticatedUser {
  id: string;
  email: string;
  rol: string;
}

// 🔑 Función que extrae y verifica el Token JWT de los headers
export function verifyAuthToken(req: NextRequest): AuthenticatedUser | null {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    
    return decoded;
  } catch (error) {
    return null;
  }
}

// 🔐 Función para firmar y generar el Token al hacer login
export function generateToken(user: AuthenticatedUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });
}