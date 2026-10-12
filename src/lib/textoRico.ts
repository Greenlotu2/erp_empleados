// Convierte el Markdown ligero de las minutas (y comentarios del hilo) a HTML
// seguro: escapa primero y luego inyecta solo nuestras etiquetas. Lo usan el
// historial de /admin/revisiones y el seguimiento de la app móvil.
export function renderRich(raw: string) {
  let s = (raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_\n]+)__/g, "<u>$1</u>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  s = s.replace(
    /`([^`\n]+)`/g,
    '<code class="bg-slate-100 rounded px-1 text-[10px]">$1</code>',
  );
  s = s.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-600 underline">$1</a>',
  );
  s = s.replace(/^\s*[-*]\s+/gm, "• ");
  return { __html: s };
}
