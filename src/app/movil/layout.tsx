import type { Metadata, Viewport } from "next";

// iPhone no usa el manifest para el ícono ni el nombre de la pantalla de
// inicio: toma apple-touch-icon y appleWebApp.title.
export const metadata: Metadata = {
  title: "Rocal ERP",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Rocal ERP", statusBarStyle: "default" },
};

// El color de la barra de estado cuando está instalada como PWA.
export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function MovilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
