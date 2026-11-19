import type { Metadata } from "next";
import "./globals.css";
import { Footer, Header } from "@/components/Chrome";
import { PolicyProvider } from "@/components/PolicyProvider";

export const metadata: Metadata = {
  title: "Governance Lens - proxy ballots vs. your voting policy",
  description:
    "Analyze real DEF 14A proxy ballots from SEC EDGAR against an editable voting policy, with a cited reason for every FOR / AGAINST / FLAG.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <PolicyProvider>
          <Header />
          <main className="shell pt-12">{children}</main>
          <Footer />
        </PolicyProvider>
      </body>
    </html>
  );
}
