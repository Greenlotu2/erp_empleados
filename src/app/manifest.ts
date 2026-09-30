import type { MetadataRoute } from "next";

// Manifest de la PWA móvil. Vive en la raíz porque Next solo permite un
// manifest por app, pero `scope`/`start_url` lo acotan a /movil — el
// dashboard admin (todo lo demás) no se ve afectado ni se vuelve instalable.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rocal — Panel del Empleado",
    short_name: "Rocal Móvil",
    description:
      "Consulta tus tareas y avisos, y revisa entregas desde el celular.",
    start_url: "/movil",
    scope: "/movil",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icono_rocal.png",
        sizes: "268x268",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icono_rocal.png",
        sizes: "268x268",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
