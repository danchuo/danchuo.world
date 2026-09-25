import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PostRefusedError } from "@/lib/api/client";
import { shirtLabel, SHIRTS } from "@/lib/tierlist";
import { TierlistModal } from "./TierlistModal";

const postTierlist = vi.hoisted(() => vi.fn());
const getTierlists = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  postTierlist,
  getTierlists,
}));

const PUBLISHED = {
  id: 7,
  submittedAt: "2026-09-25T10:00:00Z",
  nick: "аня",
  tiers: { S: [SHIRTS[0].id], A: [], B: [], C: [], D: [SHIRTS[1].id] },
};

/** Tap a shirt, then tap a tier's row — the path touch and keyboard take. */
function placeByTap(name: string, tier: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  fireEvent.click(screen.getByRole("button", { name: `положить в тир ${tier}` }));
}

describe("TierlistModal — shirt tier list (§5.20)", () => {
  beforeEach(() => {
    postTierlist.mockReset().mockResolvedValue({ id: 99 });
    getTierlists.mockReset().mockResolvedValue([PUBLISHED]);
  });

  it("publish stays disabled until every shirt is placed, then sends the board, resets it and opens the new list", async () => {
    render(<TierlistModal onClose={() => {}} />);
    const publish = screen.getByRole("button", { name: "опубликовать" });

    for (const shirt of SHIRTS.slice(0, -1)) placeByTap(shirtLabel(shirt.id), "очень сок");
    expect(publish).toBeDisabled();
    expect(screen.queryByText(/осталось расставить/)).not.toBeInTheDocument();

    placeByTap(shirtLabel(SHIRTS[SHIRTS.length - 1].id), "навечно");
    expect(publish).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText("аноним"), { target: { value: " мия " } });
    fireEvent.click(publish);

    await waitFor(() => expect(postTierlist).toHaveBeenCalledTimes(1));
    const sent = postTierlist.mock.calls[0][0];
    expect(sent.nick).toBe("мия");
    expect(sent.tiers.S).toEqual([SHIRTS[SHIRTS.length - 1].id]);
    expect(sent.tiers.A).toHaveLength(SHIRTS.length - 1);
    expect(await screen.findByRole("heading", { name: "тирлист от мия" })).toBeInTheDocument();
    expect(screen.getByText("опубликовано")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: shirtLabel(SHIRTS[0].id) })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "← к моему" }));
    expect(screen.getAllByRole("button", { name: shirtLabel(SHIRTS[0].id) })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "опубликовать" })).toBeDisabled();
    expect(screen.getByPlaceholderText("аноним")).toHaveValue("");
  });

  it("a name on the right shows that person's placement, read-only, and back returns to mine", async () => {
    render(<TierlistModal onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "аня" }));

    expect(screen.getByRole("heading", { name: "тирлист от аня" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "опубликовать" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: shirtLabel(SHIRTS[0].id) })).toHaveLength(1);

    const back = screen.getByRole("button", { name: "← к моему" });
    expect(back.closest(".tier-modal__foot")).not.toBeNull();
    fireEvent.click(back);
    expect(screen.getByRole("button", { name: "опубликовать" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /тирлист/ })).toBeNull();
  });

  it("a nick already on the shelf is flagged as typed, without touching the placement", async () => {
    render(<TierlistModal onClose={() => {}} />);
    await screen.findByRole("button", { name: "аня" });
    for (const shirt of SHIRTS) placeByTap(shirtLabel(shirt.id), "на каждый день");
    const publish = screen.getByRole("button", { name: "опубликовать" });

    fireEvent.change(screen.getByPlaceholderText("аноним"), { target: { value: " АНЯ " } });
    expect(screen.getByText("ник «АНЯ» уже занят — возьми другой")).toBeInTheDocument();
    expect(publish).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("аноним"), { target: { value: "аня 2" } });
    expect(screen.queryByText(/уже занят/)).not.toBeInTheDocument();
    expect(publish).toBeEnabled();
    expect(screen.getByText("все расставлены")).toBeInTheDocument();
  });

  it("a nick the server refuses as taken keeps the board and lets the visitor retry", async () => {
    postTierlist.mockRejectedValueOnce(new PostRefusedError("nick_taken", "nick"));
    render(<TierlistModal onClose={() => {}} />);
    for (const shirt of SHIRTS) placeByTap(shirtLabel(shirt.id), "пойдет");
    fireEvent.change(screen.getByPlaceholderText("аноним"), { target: { value: "мия" } });
    fireEvent.click(screen.getByRole("button", { name: "опубликовать" }));

    expect(await screen.findByText("ник «мия» уже занят — возьми другой")).toBeInTheDocument();
    expect(screen.getByText("все расставлены")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "опубликовать" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("аноним"), { target: { value: "мия 2" } });
    expect(screen.getByRole("button", { name: "опубликовать" })).toBeEnabled();
  });

  it("an empty shelf invites to be first", async () => {
    getTierlists.mockResolvedValue([]);
    render(<TierlistModal onClose={() => {}} />);
    expect(await screen.findByText("пока никто — будь первым")).toBeInTheDocument();
  });

  it("each list on the right carries a miniature of its ladder under the nick", async () => {
    render(<TierlistModal onClose={() => {}} />);
    const person = await screen.findByRole("button", { name: "аня" });
    const rows = person.querySelectorAll(".tier-mini__row");
    expect(rows).toHaveLength(5);
    expect(rows[0].querySelectorAll("img")).toHaveLength(1);
    expect(rows[4].querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "чужие листы" })).toBeInTheDocument();
  });

  it("the list hides its scrollbar and fades its bottom only while more lies below", async () => {
    render(<TierlistModal onClose={() => {}} />);
    await screen.findByRole("button", { name: "аня" });
    const list = screen.getByRole("list");
    expect(list).toHaveClass("scroll-invisible");
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 600 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 300 });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute("data-more");
    list.scrollTop = 300;
    fireEvent.scroll(list);
    expect(list).not.toHaveAttribute("data-more");
  });

  it("a shirt put into the magnifier shows large, and closing it returns the shirt to the pool", () => {
    render(<TierlistModal onClose={() => {}} />);
    const id = SHIRTS[2].id;
    placeByTap(shirtLabel(id), "навечно");
    fireEvent.click(screen.getByRole("button", { name: shirtLabel(id) }));
    fireEvent.click(screen.getByRole("button", { name: "рассмотреть крупно" }));

    expect(screen.getByRole("img", { name: `${shirtLabel(id)} крупно` })).toHaveAttribute("src", SHIRTS[2].large);
    expect(screen.queryByRole("button", { name: shirtLabel(id) })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "вернуться" }));
    expect(screen.queryByRole("img", { name: `${shirtLabel(id)} крупно` })).not.toBeInTheDocument();
    const back = screen.getByRole("button", { name: shirtLabel(id) });
    expect(back.closest("[data-slot]")).toHaveAttribute("data-slot", "pool");
  });

  it("Escape closes the magnifier before the window", () => {
    const onClose = vi.fn();
    render(<TierlistModal onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: shirtLabel(SHIRTS[0].id) }));
    fireEvent.click(screen.getByRole("button", { name: "рассмотреть крупно" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("img", { name: `${shirtLabel(SHIRTS[0].id)} крупно` })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("someone else's shirt opens large on a tap, and closing leaves their list untouched", async () => {
    render(<TierlistModal onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "аня" }));
    fireEvent.click(screen.getByRole("button", { name: shirtLabel(SHIRTS[0].id) }));
    expect(screen.getByRole("img", { name: `${shirtLabel(SHIRTS[0].id)} крупно` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "закрыть" }));
    const shirt = screen.getByRole("button", { name: shirtLabel(SHIRTS[0].id) });
    expect(shirt.closest("[data-slot]")).toHaveAttribute("data-slot", "S");
  });
});
