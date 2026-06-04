import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";

export const metadata: Metadata = {
  title: "Blgasm POS — نقطة البيع",
  description: "نظام نقطة بيع متكامل لمحلات البقالة والسوبرماركت",
  keywords: "POS, نقطة بيع, بقالة, سوبرماركت, محاسبة",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
