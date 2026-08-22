import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ROCKOLA · Adivina la canción",
  description:
    "Juego para adivinar canciones con dos pistas, autor, tema y sistema de puntos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
