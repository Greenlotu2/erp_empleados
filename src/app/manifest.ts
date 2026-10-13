import type { MetadataRoute } from "next";

// Manifest de la PWA móvil. Vive en la raíz porque Next solo permite un
// manifest por app, pero `scope`/`start_url` lo acotan a /movil — el
// dashboard admin (todo lo demás) no se ve afectado ni se vuelve instalable.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rocal ERP",
    short_name: "Rocal ERP",
    description: "Supervisa a tu equipo y revisa entregas desde el celular.",
    start_url: "/movil",
    scope: "/movil",
    display: "standalone",
    orientation: "portrait",
    // Fondo de la pantalla de arranque: negro, igual que el ícono.
    background_color: "#000000",
    theme_color: "#2563eb",
    // Fondo negro sólido (el PNG original era transparente y Android lo
    // rellenaba de blanco). La versión maskable deja margen para que el
    // recorte circular/redondeado del launcher no corte el logo.
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icono-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
