import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ThemeView } from "@/lib/api/types";
import { WaveProvider } from "./WaveProvider";
import { WaveSwitcher } from "./WaveSwitcher";

vi.mock("@/lib/api/client", () => ({ getThemes: vi.fn() }));
import { getThemes } from "@/lib/api/client";
const getThemesMock = vi.mocked(getThemes);

afterEach(() => {
  vi.clearAllMocks();
  document.cookie = "danchuo_wave=; max-age=0"; // cookie persists across tests in jsdom
});

function theme(over: Partial<ThemeView> = {}): ThemeView {
  return {
    key: "wave-01",
    name: "Волна 01",
    tokens: { "bg-page": "#faf1eb", accent: "#e2604c" },
    layout: null,
    active: true,
    releasedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

/** Переключатель живёт внутри контекста волны — оборачиваем в провайдер с активной волной. */
function withWave(node: ReactNode) {
  return <WaveProvider initialActiveKey="wave-01">{node}</WaveProvider>;
}

describe("WaveSwitcher", () => {
  it("рендерит только свотчи выпущенных волн, без слотов-заглушек", async () => {
    getThemesMock.mockResolvedValue([theme()]);
    render(withWave(<WaveSwitcher />));
    expect(await screen.findByLabelText("Волна: Волна 01")).toBeInTheDocument();
    // ровно один элемент на волну — заглушек под будущие волны нет
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("клик по свотчу свопит токены в :root", async () => {
    const setProp = vi.spyOn(document.documentElement.style, "setProperty");
    getThemesMock.mockResolvedValue([
      theme(),
      theme({ key: "wave-02", name: "Волна 02", active: false, tokens: { "bg-page": "#101010", accent: "#33ff99" } }),
    ]);
    render(withWave(<WaveSwitcher />));

    const second = await screen.findByLabelText("Волна: Волна 02");
    fireEvent.click(second);

    await waitFor(() => expect(setProp).toHaveBeenCalledWith("--bg-page", "#101010"));
    expect(setProp).toHaveBeenCalledWith("--accent", "#33ff99");
  });

  it("клик по свотчу запоминает волну в cookie (переживает перезагрузку)", async () => {
    getThemesMock.mockResolvedValue([
      theme(),
      theme({ key: "wave-02", name: "Волна 02", active: false }),
    ]);
    render(withWave(<WaveSwitcher />));

    fireEvent.click(await screen.findByLabelText("Волна: Волна 02"));

    await waitFor(() => expect(document.cookie).toContain("danchuo_wave=wave-02"));
  });

  // SSR деградировал (бэк недоступен/рейтлимит) ⇒ провайдер стартует без activeKey. Свитчер
  // самовосстанавливается по списку волн: cookie посетителя → его волна, иначе — активная.
  it("лечит деградированный SSR: применяет волну из cookie без её перезаписи", async () => {
    document.cookie = "danchuo_wave=wave-02; path=/";
    const setProp = vi.spyOn(document.documentElement.style, "setProperty");
    getThemesMock.mockResolvedValue([
      theme(),
      theme({ key: "wave-02", name: "Волна 02", active: false, tokens: { "bg-page": "#101010" } }),
    ]);
    render(<WaveProvider>{<WaveSwitcher />}</WaveProvider>);

    const second = await screen.findByLabelText("Волна: Волна 02");
    await waitFor(() => expect(second).toHaveAttribute("aria-pressed", "true"));
    expect(setProp).toHaveBeenCalledWith("--bg-page", "#101010");
  });

  // ── Чип = мини-плитка СВОЕЙ волны (DESIGN §2.6) ────────────────────────────────────
  // Чип рисуется палитрой и краем той волны, которую предлагает, — а не активной. Поэтому
  // цвета едут инлайновыми --chip-* переменными из токенов конкретной волны (data-driven:
  // новая волна получает превью без правок кода), а ключ волны висит атрибутом, чтобы скин
  // волны мог переопределить форму своего чипа, даже когда на борде активна другая волна.
  it("рисует чип палитрой своей волны, а не активной", async () => {
    getThemesMock.mockResolvedValue([
      theme(),
      theme({
        key: "wave-02",
        name: "Волна 02",
        active: false,
        tokens: { "bg-page": "#e3f1fe", accent: "#ff5e24", "border-tile": "#9dc3e6" },
      }),
    ]);
    render(withWave(<WaveSwitcher />));

    const second = await screen.findByLabelText("Волна: Волна 02");
    expect(second.style.getPropertyValue("--chip-bg")).toBe("#e3f1fe");
    expect(second.style.getPropertyValue("--chip-accent")).toBe("#ff5e24");
    expect(second.style.getPropertyValue("--chip-line")).toBe("#9dc3e6");
    // ключ волны — зацепка для скина: волна 02 рисует свой чип круглым, лёжа на борде 01
    expect(second).toHaveAttribute("data-chip-wave", "wave-02");
  });

  // Силуэт края чипа — НЕ токен `pixel-corners` плитки: тот задан в абсолютных px под
  // большую карточку и на чипе вырождается в крестик (см. врез у .wave-chip в common.css).
  // Ступеньку в масштабе ногтя рисует CSS; волна вправе прислать свою отдельным токеном.
  it("не тащит на чип полигон плитки, но уважает собственный токен чипа", async () => {
    getThemesMock.mockResolvedValue([
      theme({ tokens: { "pixel-corners": "polygon(0 10px)" } }),
      theme({ key: "wave-02", name: "Волна 02", active: false, tokens: { "chip-corners": "polygon(0 0)" } }),
    ]);
    render(withWave(<WaveSwitcher />));

    const first = await screen.findByLabelText("Волна: Волна 01");
    expect(first.style.getPropertyValue("--chip-corners")).toBe("");
    expect(screen.getByLabelText("Волна: Волна 02").style.getPropertyValue("--chip-corners")).toBe(
      "polygon(0 0)",
    );
  });

  // Волна без части токенов (или волна-новичок с урезанным набором) не должна рвать чип —
  // недостающее подхватывается токенами борда.
  it("не падает на волне с неполным набором токенов", async () => {
    getThemesMock.mockResolvedValue([theme({ tokens: {} })]);
    render(withWave(<WaveSwitcher />));

    const chip = await screen.findByLabelText("Волна: Волна 01");
    expect(chip.style.getPropertyValue("--chip-bg")).toBe("var(--bg-surface-muted)");
  });

  // Активная волна читается не только рамкой: чип приподнят «коробочкой» (язык волны 01).
  it("помечает активный чип для скина и скринридера", async () => {
    getThemesMock.mockResolvedValue([
      theme(),
      theme({ key: "wave-02", name: "Волна 02", active: false }),
    ]);
    render(withWave(<WaveSwitcher />));

    const first = await screen.findByLabelText("Волна: Волна 01");
    const second = screen.getByLabelText("Волна: Волна 02");
    expect(first).toHaveAttribute("data-active", "true");
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("data-active", "false");
  });

  // Направление ряда — капабилити раскладки (как у projects/photoDrops/marquee): волна
  // задаёт его в layout, компонент не решает сам. Дефолт — горизонталь.
  it("кладёт чипы в ряд по умолчанию и в столбец по ориентации волны", async () => {
    getThemesMock.mockResolvedValue([theme()]);
    const { rerender } = render(withWave(<WaveSwitcher />));
    const row = (await screen.findByLabelText("Волна: Волна 01")).parentElement!;
    expect(row.className).toContain("flex-row");
    expect(row.className).not.toContain("flex-col");

    rerender(withWave(<WaveSwitcher orientation="vertical" />));
    await waitFor(() =>
      expect(screen.getByLabelText("Волна: Волна 01").parentElement!.className).toContain(
        "flex-col",
      ),
    );
  });

  // Зум ужимает CSS-вьюпорт, а демпфер §8.1 уменьшает чип вдвое медленнее контейнера —
  // на 110% два чипа перестают влезать в ряд. Перенос не решение (владелец: «почему волны
  // встают вертикально?»): горизонтальный ряд обязан оставаться рядом, чипы жмутся.
  it("не переносит чипы на вторую строку в горизонтальном ряду", async () => {
    getThemesMock.mockResolvedValue([
      theme(),
      theme({ key: "wave-02", name: "Волна 02", active: false }),
    ]);
    render(withWave(<WaveSwitcher />));

    const row = (await screen.findByLabelText("Волна: Волна 01")).parentElement!;
    expect(row.className).toContain("flex-nowrap");
  });

  it("лечит деградированный SSR без cookie: активная волна, cookie не появляется", async () => {
    getThemesMock.mockResolvedValue([
      theme(),
      theme({ key: "wave-02", name: "Волна 02", active: false }),
    ]);
    render(<WaveProvider>{<WaveSwitcher />}</WaveProvider>);

    const first = await screen.findByLabelText("Волна: Волна 01");
    await waitFor(() => expect(first).toHaveAttribute("aria-pressed", "true"));
    expect(document.cookie).not.toContain("danchuo_wave");
  });
});
