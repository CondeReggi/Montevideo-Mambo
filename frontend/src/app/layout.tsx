import type { Metadata } from "next";
import { headers } from "next/headers";
import { Anton, Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { DialogProvider } from "@/components/ui/Dialog";
import { RefreshProvider, PullToRefresh } from "@/components/Refresh";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ConnectingIndicator from "@/components/ConnectingIndicator";

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
  title: "Montevideo Mambo",
  description:
    "Bailá, conectá, disfrutá. Gestión de clases, asistencias por QR, cuponeras y pagos.",
  manifest: "/manifest.json",
  applicationName: "Montevideo Mambo",
  appleWebApp: { capable: true, title: "Montevideo Mambo", statusBarStyle: "black-translucent" },
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
  // Evita el zoom accidental (pinch / doble-tap) que quedaba pegado en la PWA:
  // la app se comporta como una nativa.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Nonce de CSP inyectado por middleware.ts (SEC-21): habilita este único script inline.
  const nonce = headers().get("x-nonce") ?? undefined;
  return (
    <html lang="es" className="dark">
      <head>
        {/* Captura el evento de instalación PWA APENAS carga la página (antes que React),
            así el botón "Instalar app" puede lanzar el diálogo nativo con un toque en
            Android/Chrome sin ir a "Compartir". */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){
              window.__mamboBIP = null;
              window.addEventListener('beforeinstallprompt', function(e){
                e.preventDefault();
                window.__mamboBIP = e;
                window.dispatchEvent(new Event('mambo-bip'));
              });
              window.addEventListener('appinstalled', function(){
                window.__mamboBIP = null;
                window.__mamboInstalled = true;
                window.dispatchEvent(new Event('mambo-installed'));
              });
            })();`,
          }}
        />
      </head>
      <body className={`${display.variable} ${sans.variable} antialiased`}>
        <RefreshProvider>
          <ToastProvider>
            <DialogProvider>{children}</DialogProvider>
          </ToastProvider>
          <PullToRefresh />
        </RefreshProvider>
        <ConnectingIndicator />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
