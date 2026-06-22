import type { Metadata } from "next";

// Админка — приватный экран владельца; держим вне поиска (sitemap её и так не включает).
export const metadata: Metadata = {
  title: "admin · danchuo.world",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
