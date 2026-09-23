import { cookies } from "next/headers";
import { preload } from "react-dom";
import { Board } from "@/components/Board";
import { WaveProvider } from "@/components/WaveProvider";
import { apiUrl } from "@/lib/api/client";
import { spinePaths } from "@/lib/boardSpine";
import { mskToday } from "@/lib/date";
import { resolveLayout } from "@/lib/layout";
import { WAVE_COOKIE, decodeWaveCookie } from "@/lib/waveCookie";
import { resolveDisplayWave } from "@/lib/waves";

/** Resolve the initial layout on the server to avoid a wave flash; tiles fetch their own data. DESIGN §7, §10. */
export default async function HomePage() {
  const wave = resolveDisplayWave(decodeWaveCookie((await cookies()).get(WAVE_COOKIE)?.value));
  // The spine's JSON starts downloading with the HTML, not after hydration. `anonymous` is what a
  // plain fetch sends; any other credentials mode and the browser fetches twice. PRD §8
  for (const path of spinePaths(resolveLayout(wave.layout), mskToday())) {
    preload(apiUrl(path), { as: "fetch", crossOrigin: "anonymous" });
  }
  return (
    <WaveProvider initialWave={wave}>
      <Board />
    </WaveProvider>
  );
}
