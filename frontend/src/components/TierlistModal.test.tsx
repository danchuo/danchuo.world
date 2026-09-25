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
    expect(screen.getByText("осталось расставить: 1")).toBeInTheDocument();

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
    expect(screen.getByText(`осталось расставить: ${SHIRTS.length}`)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("аноним")).toHaveValue("");
  });

  it("a name on the right shows that person's placement, read-only, and back returns to mine", async () => {
    render(<TierlistModal onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "аня" }));

    expect(screen.getByRole("heading", { name: "тирлист от аня" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "опубликовать" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: shirtLabel(SHIRTS[0].id) })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "← к моему" }));
    expect(screen.getByRole("button", { name: "опубликовать" })).toBeInTheDocument();
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
});
