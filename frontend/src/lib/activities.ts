/** The day's activities as cards of the sheet's frame row (DESIGN §4.3); keys come from the backend. */

import type { DayView } from "./api/types";

export interface ActivityCard {
  key: string;
  label: string;
}

const LABELS: Readonly<Record<string, string>> = {
  bouldering: "болдеринг",
  squash: "сквош",
  badminton: "бадминтон",
  gym: "зал",
  pullups: "турники",
  dips: "брусья",
  pushups: "отжимания",
};

export function dayActivities(day: DayView): ActivityCard[] {
  return (day.activities ?? []).map((key) => ({ key, label: LABELS[key] ?? key }));
}
