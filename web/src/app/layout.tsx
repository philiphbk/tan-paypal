import type { ReactNode } from "react";

export const metadata = {
  title: "TAN for PayPal",
  description: "AI-assured checkout on the PayPal sandbox",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f7f9", color: "#111" }}>
        {children}
      </body>
    </html>
  );
}
