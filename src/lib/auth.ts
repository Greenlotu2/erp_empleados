import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'rocal_lum_inova_inge_891225'; // Valor por defecto para desarrollo

if (!JWT_SECRET) {
  console.warn('⚠️ ATENCIÓN: JWT_SECRET no está definido en las variables de entorno (.env.local)');
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  rol: string;
}

export function verifyAuthToken(req: NextRequest | Request): AuthenticatedUser | null {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split(' ')[1];
    if (!JWT_SECRET) return null;

    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    return decoded;
  } catch (error) {
    return null;
  }
}

export function generateToken(user: AuthenticatedUser): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET no configurado en el servidor');
  }
  return jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });
}