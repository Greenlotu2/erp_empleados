import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

// El secreto NUNCA se hornea en el código. En producción es obligatorio tenerlo
// en variables de entorno; si falta, la firma/verificación de tokens falla en
// seco (fail-closed) en vez de usar un valor conocido y commiteado.
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== "production" ? "dev-only-change-me" : "");

if (!JWT_SECRET) {
  console.error(
    "❌ JWT_SECRET no está definido — la autenticación por token queda deshabilitada.",
  );
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  rol: string;
}

export function verifyAuthToken(
  req: NextRequest | Request,
): AuthenticatedUser | null {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.split(" ")[1];
    if (!JWT_SECRET) return null;

    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    return decoded;
  } catch (error) {
    return null;
  }
}

export function generateToken(user: AuthenticatedUser): string {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET no configurado en el servidor");
  }
  return jwt.sign(user, JWT_SECRET, { expiresIn: "8h" });
}
