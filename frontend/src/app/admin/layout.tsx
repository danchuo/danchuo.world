import type { Metadata } from "next";
import "./admin.css";

// Админка — приватный экран владельца; держим вне поиска (sitemap её и так не включает).
export const metadata: Metadata = {
  title: "admin · danchuo.world",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // .admin-root shadows the wave tokens with a fixed black-and-white palette (admin.css):
  // the admin screens do not follow waves by design.
  return <div className="admin-root">{children}</div>;
}
