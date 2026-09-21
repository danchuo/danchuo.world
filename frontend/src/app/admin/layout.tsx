import type { Metadata } from "next";
import { cookies } from "next/headers";
import { WaveProvider } from "@/components/WaveProvider";
import { WAVE_COOKIE, decodeWaveCookie } from "@/lib/waveCookie";
import { resolveDisplayWave } from "@/lib/waves";
import "./admin.css";

// Keep the owner's admin screen out of search results.
export const metadata: Metadata = {
  title: "admin · danchuo.world",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Resolve the same cookie/default wave as the root layout so the admin switcher stays in sync.
  const wave = resolveDisplayWave(decodeWaveCookie((await cookies()).get(WAVE_COOKIE)?.value));
  return (
    <WaveProvider initialWave={wave}>
      {children}
    </WaveProvider>
  );
}
