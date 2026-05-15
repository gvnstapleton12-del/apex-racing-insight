export type ReplayTriggerKey =
  | "beaten_fav"
  | "suspicious_defeat"
  | "hidden_late_effort"
  | "blocked_run"
  | "misleading_result"
  | "market_ignore";

export interface DetectedTrigger {
  key: ReplayTriggerKey;
  label: string;
  short: string;
  reason: string;
  color: string;
  dotColor: string;
}

export const TRIGGER_META: Record<ReplayTriggerKey, { label: string; short: string; color: string; dotColor: string }> = {
  beaten_fav: {
    label: "Beaten Favourite",
    short: "BF",
    color: "text-amber-400 border-amber-400/50 bg-amber-400/10",
    dotColor: "bg-amber-400",
  },
  suspicious_defeat: {
    label: "Suspicious Defeat",
    short: "SD",
    color: "text-orange-400 border-orange-400/50 bg-orange-400/10",
    dotColor: "bg-orange-400",
  },
  hidden_late_effort: {
    label: "Hidden Late Effort",
    short: "HLE",
    color: "text-cyan-400 border-cyan-400/50 bg-cyan-400/10",
    dotColor: "bg-cyan-400",
  },
  blocked_run: {
    label: "Blocked Run",
    short: "BLK",
    color: "text-purple-400 border-purple-400/50 bg-purple-400/10",
    dotColor: "bg-purple-400",
  },
  misleading_result: {
    label: "Misleading Result",
    short: "MR",
    color: "text-red-400 border-red-400/50 bg-red-400/10",
    dotColor: "bg-red-400",
  },
  market_ignore: {
    label: "Market Ignored",
    short: "MI",
    color: "text-green-400 border-green-400/50 bg-green-400/10",
    dotColor: "bg-green-400",
  },
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseFormChars(form?: string | null): string[] {
  if (!form) return [];
  return form
    .replace(/[-\/]/g, "")
    .split("")
    .filter(c => /[0-9FPUfpu]/.test(c))
    .map(c => c.toUpperCase());
}

function parseOddsDecimal(odds?: string | null): number | null {
  if (!odds) return null;
  const frac = odds.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10) + 1;
  const fractShort = odds.match(/^(\d+)-(\d+)$/);
  if (fractShort) return parseInt(fractShort[1], 10) / parseInt(fractShort[2], 10) + 1;
  const evs = odds.toLowerCase();
  if (evs === "evs" || evs === "1/1") return 2;
  const dec = parseFloat(odds);
  if (!isNaN(dec) && dec > 0) return dec;
  return null;
}

function positionValue(c: string): number | null {
  if (/[FPU]/.test(c)) return null;
  const n = parseInt(c, 10);
  return isNaN(n) ? null : n === 0 ? 10 : n;
}

function isIncident(c: string): boolean {
  return /[FPU]/.test(c);
}

// ── Main detection function ───────────────────────────────────────────────────

export interface RunnerInput {
  form?: string | null;
  odds?: string | null;
  age?: string | null;
}

export interface RaceContext {
  fieldSize?: number;
  raceName?: string;
}

export function detectReplayTriggers(
  runner: RunnerInput,
  context?: RaceContext,
): DetectedTrigger[] {
  const chars = parseFormChars(runner.form);
  const oddsDecimal = parseOddsDecimal(runner.odds);
  const fieldSize = context?.fieldSize ?? 10;

  if (chars.length === 0 && oddsDecimal === null) return [];

  const triggers: DetectedTrigger[] = [];
  const found = new Set<ReplayTriggerKey>();

  const add = (key: ReplayTriggerKey, reason: string) => {
    if (found.has(key)) return;
    found.add(key);
    triggers.push({ key, reason, ...TRIGGER_META[key] });
  };

  // Most-recent run = last element
  const lastChar = chars[chars.length - 1];
  const lastPos = lastChar ? positionValue(lastChar) : null;
  const prevChar = chars[chars.length - 2];
  const prevPos = prevChar ? positionValue(prevChar) : null;

  // Count incidents in recent 4 runs
  const recent4 = chars.slice(-4);
  const incidentCount = recent4.filter(isIncident).length;
  const recentPositions = recent4.map(positionValue).filter((v): v is number => v !== null);

  // Wins and places in all runs
  const allPositions = chars.map(positionValue).filter((v): v is number => v !== null);
  const winCount = allPositions.filter(p => p === 1).length;
  const placeCount = allPositions.filter(p => p <= 3).length;

  // ── 1. Beaten Favourite ────────────────────────────────────────────────────
  // Short-priced today (< 3.5 decimal) but last run was a loss
  if (oddsDecimal !== null && oddsDecimal < 3.5 && lastPos !== null && lastPos > 1) {
    add(
      "beaten_fav",
      `Priced at ${runner.odds} today — was beaten last time (${lastPos}${lastPos === 10 ? "+" : ""}th) · worth reviewing why market is confident`,
    );
  }
  // Also flag if they were notably short (< 2.5) and last two runs were losses
  if (oddsDecimal !== null && oddsDecimal < 2.5 && lastPos !== null && lastPos > 2 && prevPos !== null && prevPos > 2) {
    add(
      "beaten_fav",
      `Well-backed at ${runner.odds} despite two consecutive defeats · market has strong inside view`,
    );
  }

  // ── 2. Suspicious Defeat ──────────────────────────────────────────────────
  // Good recent form (2+ wins or places) but last run was a shock bad result (6+)
  if (placeCount >= 2 && lastPos !== null && lastPos >= 6) {
    add(
      "suspicious_defeat",
      `${placeCount} places/wins in form but last ran ${lastPos}${lastPos === 10 ? "+" : ""}th · defeat looks out of character`,
    );
  }
  // Was improving, then suddenly regressed
  if (chars.length >= 3) {
    const secondLast = chars[chars.length - 3];
    const secondLastPos = secondLast ? positionValue(secondLast) : null;
    if (prevPos !== null && lastPos !== null && secondLastPos !== null &&
        prevPos <= 3 && secondLastPos <= 3 && lastPos >= 6) {
      add(
        "suspicious_defeat",
        `Was finishing 1st–3rd in two consecutive runs before a ${lastPos}th — reversal needs explanation`,
      );
    }
  }

  // ── 3. Hidden Late Effort ─────────────────────────────────────────────────
  // Consistent 3rd-4th places suggesting closing late without winning
  const closingPlaces = allPositions.filter(p => p === 3 || p === 4).length;
  const totalRuns = allPositions.length;
  if (totalRuns >= 3 && closingPlaces >= 2 && winCount === 0) {
    add(
      "hidden_late_effort",
      `${closingPlaces} 3rd/4th places in ${totalRuns} runs with no win · consistently running on late without getting there`,
    );
  }
  // Improving form with no win but closing in
  const last3Positions = chars.slice(-3).map(positionValue).filter((v): v is number => v !== null);
  if (last3Positions.length === 3) {
    const improving = last3Positions[2] < last3Positions[1] && last3Positions[1] < last3Positions[0];
    if (improving && last3Positions[2] <= 3) {
      add(
        "hidden_late_effort",
        `Form showing progressive improvement: ${last3Positions.join(" → ")} · may be peaking now`,
      );
    }
  }

  // ── 4. Blocked Run Potential ──────────────────────────────────────────────
  // Form incident in a big field context
  if (incidentCount >= 1 && fieldSize >= 12) {
    add(
      "blocked_run",
      `${incidentCount} incident run(s) in recent form in a ${fieldSize}-runner field — traffic trouble likely masked true ability`,
    );
  }
  // Incident in form generally (always worth replay review)
  if (incidentCount >= 1 && fieldSize < 12) {
    add(
      "blocked_run",
      `Incident run(s) in recent form (F/P/U) — physical interference in running, not necessarily a true form line`,
    );
  }
  // Big field + unexplained 10th+ finish for a decent horse
  if (fieldSize >= 14 && placeCount >= 2 && lastPos === 10) {
    add(
      "blocked_run",
      `Finished 10th+ last time in a big field (${fieldSize} runners) despite a track record of placing — likely got into trouble`,
    );
  }

  // ── 5. Misleading Result ─────────────────────────────────────────────────
  // Any fall, unseated, or pulled up in recent runs
  const recentIncidents = chars.slice(-3).filter(isIncident);
  if (recentIncidents.length >= 1) {
    const types = recentIncidents.map(c => c === "F" ? "Fall" : c === "U" ? "Unseated" : "Pulled Up").join(", ");
    add(
      "misleading_result",
      `${types} in recent runs — physical event rather than performance failure · form figures are misleading`,
    );
  }
  // Good horse with a wild outlier (10th+ surrounded by top finishes)
  if (totalRuns >= 4) {
    const firstHalf = allPositions.slice(0, -2);
    const lastTwo = allPositions.slice(-2);
    const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    if (firstHalfAvg <= 3 && lastTwo.some(p => p >= 8)) {
      add(
        "misleading_result",
        `Averaging ${firstHalfAvg.toFixed(1)} finishing position but recent run was ${lastTwo.find(p => p >= 8)}th — figures are unrepresentative`,
      );
    }
  }

  // ── 6. Strong Market Support but Poor Recent Finish ───────────────────────
  // Backed into short price despite two consecutive poor finishes
  if (oddsDecimal !== null && oddsDecimal < 5 && lastPos !== null && prevPos !== null &&
      lastPos >= 5 && prevPos >= 5 && !found.has("beaten_fav")) {
    add(
      "market_ignore",
      `Priced at ${runner.odds} despite finishing ${prevPos}th and ${lastPos}th in last two runs · market is ignoring recent form for a reason`,
    );
  }
  // Obvious market drift (long price) but the form shows hidden quality
  if (oddsDecimal !== null && oddsDecimal >= 8 && winCount >= 2 && lastPos !== null && lastPos <= 3) {
    add(
      "market_ignore",
      `${winCount} wins in form and placed last time, yet available at ${runner.odds} · market may be overlooking this horse`,
    );
  }

  return triggers;
}

// ── Detect from note content (for HorseProfile) ───────────────────────────────

export function detectTriggersFromNoteContent(noteContents: string[]): DetectedTrigger[] {
  const combined = noteContents.join(" ").toLowerCase();
  const triggers: DetectedTrigger[] = [];
  const found = new Set<ReplayTriggerKey>();

  const add = (key: ReplayTriggerKey, reason: string) => {
    if (found.has(key)) return;
    found.add(key);
    triggers.push({ key, reason, ...TRIGGER_META[key] });
  };

  if (/beaten.{0,20}fav|favourite.{0,20}beat|beat.{0,20}favourite/.test(combined)) {
    add("beaten_fav", "Replay notes reference beaten favourite scenario");
  }
  if (/unlucky|hampered|bumped|checked|interfered|interference|impeded/.test(combined)) {
    add("blocked_run", "Replay notes mention interference in running");
  }
  if (/late.{0,20}effort|running on|finished well|ran on|closed late|closing/.test(combined)) {
    add("hidden_late_effort", "Replay notes indicate a strong late run");
  }
  if (/suspicious|strange|out of character|unusually poor|something wrong|not.{0,10}right/.test(combined)) {
    add("suspicious_defeat", "Replay notes flag an out-of-character defeat");
  }
  if (/mislead|misleading|pulled up|fell|unseated|not a true|unrepresentative/.test(combined)) {
    add("misleading_result", "Replay notes indicate result was misleading");
  }
  if (/market.{0,20}wrong|overpriced|wrong price|market miss|value|ignored by market/.test(combined)) {
    add("market_ignore", "Replay notes flag a market pricing anomaly");
  }

  return triggers;
}
