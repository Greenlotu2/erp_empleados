import type { Viewport } from "next";

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
