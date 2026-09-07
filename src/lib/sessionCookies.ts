// La sesión del dashboard web debe cerrarse al cerrar el navegador — no dejar
// una sesión abierta días después.
//
// `@supabase/ssr` fuerza `Max-Age: 400 días` en CADA escritura de cookie (tanto
// del lado servidor como del navegador). Aquí quitamos esa persistencia para que
// las cookies de sesión sean "de sesión" (mueren al cerrar el navegador).
//
// Regla: al ESTABLECER la sesión (value con contenido) -> sin Max-Age/Expires.
// En los BORRADOS (value vacío) -> se conserva Max-Age: 0 para que el navegador
// sí elimine la cookie.

type CookieOpts = Record<string, unknown>;

export function sinPersistencia(options: CookieOpts | undefined): CookieOpts {
  const o: CookieOpts = { ...(options ?? {}) };
  delete o.maxAge;
  delete o.expires;
  return o;
}

// Adaptador de cookies para `createBrowserClient` que escribe cookies de sesión.
export const browserSessionCookies = {
  getAll() {
    if (typeof document === "undefined") return [];
    return document.cookie
      .split("; ")
      .filter(Boolean)
      .map((c) => {
        const eq = c.indexOf("=");
        return {
          name: c.slice(0, eq),
          value: decodeURIComponent(c.slice(eq + 1)),
        };
      });
  },
  setAll(
    cookiesToSet: { name: string; value: string; options?: CookieOpts }[],
  ) {
    if (typeof document === "undefined") return;
    const secure =
      typeof location !== "undefined" && location.protocol === "https:";
    for (const { name, value, options } of cookiesToSet) {
      const o = options ?? {};
      let str = `${name}=${encodeURIComponent(value)}`;
      str += `; Path=${(o.path as string) ?? "/"}`;
      if (o.domain) str += `; Domain=${o.domain as string}`;
      str += `; SameSite=${(o.sameSite as string) ?? "Lax"}`;
      if (secure) str += "; Secure";
      // Sin value -> es un borrado: mandar Max-Age: 0 para que la cookie se elimine.
      // Con value -> cookie de sesión: NO se agrega Max-Age ni Expires.
      if (!value) str += "; Max-Age=0";
      document.cookie = str;
    }
  },
};
