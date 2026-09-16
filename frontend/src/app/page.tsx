import { cookies } from "next/headers";
import { Board } from "@/components/Board";
import { WaveProvider } from "@/components/WaveProvider";
import { fetchDisplayTheme } from "@/lib/theme";
import { WAVE_COOKIE, decodeWaveCookie } from "@/lib/waveCookie";

/** Resolve the initial layout on the server to avoid a wave flash; tiles fetch their own data. DESIGN §7, §10. */
export default async function HomePage() {
  // fetchDisplayTheme shares the root layout's request through cache().
  const preferredWave = decodeWaveCookie((await cookies()).get(WAVE_COOKIE)?.value);
  const theme = await fetchDisplayTheme(preferredWave);
  return (
    <WaveProvider initialLayout={theme?.layout ?? null} initialActiveKey={theme?.key ?? null}>
      <Board />
    </WaveProvider>
  );
}
