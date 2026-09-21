import { cookies } from "next/headers";
import { Board } from "@/components/Board";
import { WaveProvider } from "@/components/WaveProvider";
import { WAVE_COOKIE, decodeWaveCookie } from "@/lib/waveCookie";
import { resolveDisplayWave } from "@/lib/waves";

/** Resolve the initial layout on the server to avoid a wave flash; tiles fetch their own data. DESIGN §7, §10. */
export default async function HomePage() {
  const wave = resolveDisplayWave(decodeWaveCookie((await cookies()).get(WAVE_COOKIE)?.value));
  return (
    <WaveProvider initialWave={wave}>
      <Board />
    </WaveProvider>
  );
}
