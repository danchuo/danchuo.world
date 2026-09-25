/** The shirt tier list's pure part: the catalogue, the tiers and moving a shirt between them. §5.20 */

export const TIERS = ["S", "A", "B", "C", "D"] as const;
export type TierKey = (typeof TIERS)[number];

/** What a tier says on screen; the key stays the letter the server stores. */
export const TIER_LABEL: Record<TierKey, string> = {
  S: "навечно",
  A: "очень сок",
  B: "на каждый день",
  C: "пойдет",
  D: "такую даже не помню",
};

/** Where a shirt may sit: a tier, or the pool of the not-yet-placed under the tiers. */
export type Slot = TierKey | "pool";

/** Shirt ids, best first, per tier. The server stores exactly this shape. */
export type Board = Record<TierKey, string[]>;

export interface Shirt {
  /** A two-digit number: the id travels to the server, which refuses anything but `[a-z0-9-]`. */
  id: string;
  image: string;
  /** The source at its own resolution (up to 1200px), for the magnifier only. */
  large: string;
}

/** Equal to `TierlistPolicy.NICK_MAX` on the server. */
export const NICK_MAX = 40;

/** The catalogue, hard-coded: shirts go by number only, in the pool's order. Art is trimmed and centred square. */
export const SHIRTS: readonly Shirt[] = Array.from({ length: 19 }, (_, i) => {
  const id = String(i + 1).padStart(2, "0");
  return { id, image: `/assets/tierlist/${id}.webp`, large: `/assets/tierlist/large/${id}.webp` };
});

/** What a screen reader hears for a shirt; the number is its only public name. */
export const shirtLabel = (id: string) => `футболка ${Number(id)}`;

/** How nicks are compared for uniqueness, as `TierlistService` does: edge spaces and case do not count. */
export const nickKey = (nick: string) => nick.trim().toLowerCase();

export const EMPTY_BOARD: Board = { S: [], A: [], B: [], C: [], D: [] };

/**
 * Put a shirt into [target] before [index] (end when absent), taking it out of wherever it was.
 * The index counts in the tier AFTER removal, so dropping onto a neighbour inside one row works.
 */
export function place(board: Board, id: string, target: Slot, index?: number): Board {
  const next = {} as Board;
  for (const tier of TIERS) next[tier] = board[tier].filter((x) => x !== id);
  if (target === "pool") return next;
  const row = next[target];
  const at = index === undefined ? row.length : Math.max(0, Math.min(index, row.length));
  row.splice(at, 0, id);
  return next;
}

/**
 * The [place] index for a drop onto shirt [overId] (`null` ⇒ the row's end), before it or [after].
 * Counted in the row WITHOUT the dragged shirt: a later neighbour moves one left once it is lifted.
 */
export function dropIndex(
  board: Board,
  id: string,
  tier: TierKey,
  overId: string | null,
  after: boolean,
): number | undefined {
  if (overId === null) return undefined;
  const row = board[tier].filter((x) => x !== id);
  const at = row.indexOf(overId);
  if (at < 0) return undefined;
  return after ? at + 1 : at;
}

export function unplaced(board: Board, shirts: readonly Shirt[]): Shirt[] {
  const placed = new Set(TIERS.flatMap((t) => board[t]));
  return shirts.filter((s) => !placed.has(s.id));
}

/** Publishing opens only once the pool is empty. */
export function isComplete(board: Board, shirts: readonly Shirt[]): boolean {
  return unplaced(board, shirts).length === 0;
}

/** Someone's published list as a board: unknown tiers and shirts, and repeats, are dropped. */
export function fromPublished(tiers: Record<string, string[]>, shirts: readonly Shirt[]): Board {
  const known = new Set(shirts.map((s) => s.id));
  const seen = new Set<string>();
  const board = {} as Board;
  for (const tier of TIERS) {
    board[tier] = (tiers[tier] ?? []).filter((id) => {
      if (!known.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  return board;
}

export interface ShirtStanding {
  id: string;
  /** How many lists placed this shirt. */
  votes: number;
  /** Mean position in the list read S down to D, 1 = best; `null` when nobody placed it. */
  avgPlace: number | null;
  /** Mean tier as a number, S = 1 … D = 5; `null` when nobody placed it. */
  avgTier: number | null;
  /** [avgTier] rounded to the nearest tier. */
  tierLetter: TierKey | null;
}

/** The shirts' overall standings across published lists, best average place first. PRD §5.20 */
export function shirtStandings(
  lists: readonly { tiers: Record<string, string[]> }[],
  shirts: readonly Shirt[],
): ShirtStanding[] {
  const places = new Map<string, number[]>();
  const tiers = new Map<string, number[]>();
  for (const list of lists) {
    const board = fromPublished(list.tiers, shirts);
    let place = 0;
    TIERS.forEach((tier, t) => {
      for (const id of board[tier]) {
        place += 1;
        places.set(id, [...(places.get(id) ?? []), place]);
        tiers.set(id, [...(tiers.get(id) ?? []), t + 1]);
      }
    });
  }
  const mean = (xs: number[] | undefined) => (xs?.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return shirts
    .map((shirt) => {
      const avgTier = mean(tiers.get(shirt.id));
      return {
        id: shirt.id,
        votes: places.get(shirt.id)?.length ?? 0,
        avgPlace: mean(places.get(shirt.id)),
        avgTier,
        tierLetter: avgTier === null ? null : TIERS[Math.round(avgTier) - 1],
      };
    })
    .sort((a, b) => (a.avgPlace ?? Infinity) - (b.avgPlace ?? Infinity) || (a.avgTier ?? 0) - (b.avgTier ?? 0));
}

export function tierlistErrorText(code: string, field?: string): string {
  switch (code) {
    case "too_long":
      return field === "nick" ? `ник длиннее ${NICK_MAX} символов` : "слишком длинно";
    case "rate_limited":
      return "слишком часто — попробуй через несколько минут";
    case "empty":
      return "расставь футболки по тирам";
    default:
      return "не опубликовалось. попробуй ещё раз";
  }
}
