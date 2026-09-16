import type { Metadata } from "next";
import { cookies } from "next/headers";
import { WaveProvider } from "@/components/WaveProvider";
import { fetchDisplayTheme } from "@/lib/theme";
import { WAVE_COOKIE, decodeWaveCookie } from "@/lib/waveCookie";
import "./admin.css";

// Keep the owner's admin screen out of search results.
export const metadata: Metadata = {
  title: "admin · danchuo.world",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Resolve the same cookie/default wave as the root layout so the admin switcher stays in sync.
  const preferredWave = decodeWaveCookie((await cookies()).get(WAVE_COOKIE)?.value);
  const theme = await fetchDisplayTheme(preferredWave);
  return (
    <WaveProvider initialLayout={theme?.layout ?? null} initialActiveKey={theme?.key ?? null}>
      {children}
    </WaveProvider>
  );
}
