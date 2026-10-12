import { Schibsted_Grotesk, Martian_Mono } from "next/font/google";
import "./globals.css";

// css variables so the edited pages don't pick these fonts up
const ui = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export default function RootLayout({ children }) {
  return (
    // browser extensions add attributes to html/body before react loads
    <html lang="en" className={`${ui.variable} ${mono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
