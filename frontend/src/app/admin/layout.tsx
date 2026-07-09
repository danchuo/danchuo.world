import type { Metadata } from "next";
import { cookies } from "next/headers";
import { WaveProvider } from "@/components/WaveProvider";
import { fetchDisplayTheme } from "@/lib/theme";
import { WAVE_COOKIE, decodeWaveCookie } from "@/lib/waveCookie";
import "./admin.css";

// Админка — приватный экран владельца; держим вне поиска (sitemap её и так не включает).
export const metadata: Metadata = {
  title: "admin · danchuo.world",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The admin follows waves like the public board: the root layout already injects the
  // displayed wave's tokens + data-wave, here we resolve the same wave (visitor cookie →
  // owner's active) into WaveProvider so the switcher in the admin header can swap it live.
  const preferredWave = decodeWaveCookie((await cookies()).get(WAVE_COOKIE)?.value);
  const theme = await fetchDisplayTheme(preferredWave);
  return (
    <WaveProvider initialLayout={theme?.layout ?? null} initialActiveKey={theme?.key ?? null}>
      {children}
    </WaveProvider>
  );
}
