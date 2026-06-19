import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Passkey Sample",
  description: "TypeScript + React + WebAuthn (SimpleWebAuthn) のパスキー実装サンプル",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
