import type { ReactNode } from "react";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata = {
  title: "TAN for PayPal — AI-assured checkout",
  description:
    "Hold funds on PayPal, let an AI verifier check proof of delivery against the agreement, and release payment only when the conditions are met. Humans can always overrule.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
