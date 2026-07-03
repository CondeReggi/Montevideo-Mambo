import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { DialogProvider } from "@/components/ui/Dialog";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

// Display tipo póster (coincide con los flyers de la marca) + cuerpo legible.
const display = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Montevideo MAMBO — Gestión de la academia",
  description:
    "Bailá, conectá, disfrutá. Gestión de clases, asistencias por QR, cuponeras y pagos.",
  manifest: "/manifest.json",
  applicationName: "Montevideo MAMBO",
  appleWebApp: { capable: true, title: "MAMBO", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="dark">
      <body className={`${display.variable} ${sans.variable} antialiased`}>
        <ToastProvider>
          <DialogProvider>{children}</DialogProvider>
        </ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
