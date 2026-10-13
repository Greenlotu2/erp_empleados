// Limpia un usuario o contraseña tal como llega de un formulario. Al copiar y
// pegar (sobre todo desde WhatsApp o el correo) se cuelan caracteres que no se
// ven: espacios en las orillas, saltos de línea, espacios duros y marcas de
// dirección de texto (U+200E/U+200F, U+2066–U+2069…). La contraseña se ve
// igual, pero ya no coincide. Se aplica al iniciar sesión Y al guardar una
// contraseña, para que las dos siempre se comparen igual.
const INVISIBLES = /[­​-‏‪-‮⁠-⁯﻿]/g;

export function limpiarCredencial(valor: unknown): string {
  return String(valor ?? "")
    .replace(INVISIBLES, "")
    .replace(/ /g, " ")
    .trim();
}
