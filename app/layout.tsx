import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";
import { STORE_NAME } from "@/lib/constants/branding";

export const metadata: Metadata = {
  title: `${STORE_NAME} — نقطة البيع`,
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
