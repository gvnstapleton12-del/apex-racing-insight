// ──────────────────────────────────────────────────────────────────────────────
// APEX Racing Engine — Field-First Architecture
// ──────────────────────────────────────────────────────────────────────────────
//
// Scoring philosophy:
//   Core factors (Ability 38%, Pace Fit 20%, Tactical Resilience 18%,
//   Ground/Trip 16%) account for 92% of the weighted total.
//   Contextual modifiers (Replay Intelligence 5%, Hidden Value 5%) are
//   slight adjustments — they cannot manufacture a selection alone.
//   Volatility Risk applies a negative penalty of up to ~12 pts.
//
// Field-first workflow (runApexEngineForField):
//   1. Score every active runner individually.
//   2. Rank runners strongest → weakest by raw total.
//   3. Compute field mean; derive a field-relative final score.
//   4. Classify using the relative score + rank awareness:
//      only the rank-1 horse in the race may achieve best_of_day.
//   5. Return ranked array — governance applied at day-level on the dashboard.
//
// Classification ladder:
//   best_of_day            — rank-1, score ≥ 70, low volatility environment
//   top_rated_high_variance — score ≥ 62, allowed by race governance
//   each_way_value          — score ≥ 54, elevated hidden component, odds ≥ 3.0
//   no_bet                  — everything else
// ──────────────────────────────────────────────────────────────────────────────

export interface HorseMemory {
  replay?: string;
  behaviour?: string;
  tactical?: string;
  pressure?: string;
  hiddenValue?: string;
}

export interface RunnerInput {
  horseName: string;
  draw?: number | null;
  age?: string | null;
  form?: string | null;
  odds?: string | null;
  jockey?: string | null;
  trainer?: string | null;
  weight?: string | null;
  memory?: HorseMemory;
}

export interface RacecardInput {
  raceName: string;
  distance?: string | null;
  going?: string | null;
  raceClass?: string | null;
  prize?: string | null;
  trackProfile?: string | null;
  marketContext?: string | null;
  trainerComments?: string | null;
  nonRunners?: string | null;
  fieldSize: number;
}

export interface ScoreBreakdown {
  score: number;
  note: string;
}

export type VolatilityTier = "low" | "medium" | "high" | "extreme";

export interface RaceVolatilityResult {
  score: number;
  tier: VolatilityTier;
  label: string;
  factors: string[];
  blockedClasses: string[];
  governanceNote: string;
}

export interface ApexEngineResult {
  ability: ScoreBreakdown;
  paceFit: ScoreBreakdown;
  tacticalResilience: ScoreBreakdown;
  groundTrip: ScoreBreakdown;
  replayIntelligence: ScoreBreakdown;
  hiddenValue: ScoreBreakdown;
  volatilityRisk: ScoreBreakdown;
  totalScore: number;            // raw weighted total (individual, un-normalised)
  confidenceClass: string;
  classificationNote: string;
  raceVolatility: RaceVolatilityResult;
}

// Field-level result — enriched with comparison data
export interface FieldRunnerResult {
  runner: RunnerInput;
  result: ApexEngineResult;     // full breakdown; totalScore = relativeScore
  fieldRank: number;            // 1 = strongest in field
  relativeScore: number;        // field-normalised final score (replaces totalScore in classification)
  fieldEdge: number;            // pts gap to next-ranked runner (0 for last)
  fieldSize: number;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function clampF(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Form parsing ──────────────────────────────────────────────────────────────

interface FormStats {
  wins: number;
  places: number;
  unplaced: number;
  incidents: number;
  total: number;
  recentForm: string[];
  trend: "improving" | "declining" | "consistent";
  hasSeasonBreak: boolean;
}

function parseForm(form?: string | null): FormStats {
  if (!form || form.trim() === "") {
    return { wins: 0, places: 0, unplaced: 0, incidents: 0, total: 0, recentForm: [], trend: "consistent", hasSeasonBreak: false };
  }
  const hasSeasonBreak = form.includes("-") || form.includes("/");
  const cleaned = form.replace(/[-/\s]/g, "").toUpperCase();
  const runs = cleaned.slice(-8).split("");

  let wins = 0, places = 0, unplaced = 0, incidents = 0;
  for (const r of runs) {
    if (r === "1") wins++;
    else if (r === "2" || r === "3") places++;
    else if (/[4-9]/.test(r) || r === "0") unplaced++;
    else if ("PFURW".includes(r)) incidents++;
  }

  function runScore(r: string): number {
    if (r === "1") return 100;
    if (r === "2") return 78;
    if (r === "3") return 58;
    if (r === "4") return 38;
    if (/[5-9]/.test(r) || r === "0") return 15;
    return 0;
  }

  const recent = runs.slice(-3).map(runScore);
  const older  = runs.slice(0, Math.min(3, runs.length - 3)).map(runScore);
  const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 50;
  const olderAvg  = older.length  ? older.reduce((a, b) => a + b, 0)  / older.length  : 50;

  const trend: FormStats["trend"] =
    recentAvg > olderAvg + 12 ? "improving" :
    recentAvg < olderAvg - 12 ? "declining" :
    "consistent";

  return { wins, places, unplaced, incidents, total: runs.length, recentForm: runs, trend, hasSeasonBreak };
}

// ── Odds parsing ──────────────────────────────────────────────────────────────

function parseOdds(odds?: string | null): { type: "or"; value: number } | { type: "sp"; value: number } | null {
  if (!odds || odds.trim() === "") return null;
  const s = odds.trim();
  if (s.toLowerCase() === "evs" || s.toLowerCase() === "evens") return { type: "sp", value: 1.0 };
  if (s.includes("/")) {
    const [num, den] = s.split("/").map(Number);
    if (!isNaN(num) && !isNaN(den) && den > 0) return { type: "sp", value: num / den };
  }
  const n = parseFloat(s);
  if (!isNaN(n)) {
    if (n >= 40 && n <= 135) return { type: "or", value: n };
    if (n >= 1.0 && n < 40)  return { type: "sp", value: n - 1 };
  }
  return null;
}

export function parseOddsDecimal(odds: string | null | undefined): number | null {
  if (!odds) return null;
  const s = odds.trim().toLowerCase();
  if (s === "evs" || s === "evens") return 2.0;
  const sl = s.indexOf("/");
  if (sl !== -1) {
    const n = parseFloat(s.slice(0, sl)), d = parseFloat(s.slice(sl + 1));
    if (!isNaN(n) && !isNaN(d) && d > 0) return n / d + 1;
  }
  const dec = parseFloat(s);
  return isNaN(dec) ? null : dec;
}

// ── Race/distance helpers ─────────────────────────────────────────────────────

function distanceFurlongs(distStr?: string | null): number | null {
  if (!distStr) return null;
  const lower = distStr.toLowerCase();
  const milesFurlong = lower.match(/(\d+)m\s*(\d+)f/);
  const mileMatch    = lower.match(/(\d+(?:\.\d+)?)\s*m(?:ile)?/);
  const furlongMatch = lower.match(/(\d+(?:\.\d+)?)\s*f/);
  if (milesFurlong) return parseFloat(milesFurlong[1]) * 8 + parseFloat(milesFurlong[2]);
  if (mileMatch)    return parseFloat(mileMatch[1]) * 8;
  if (furlongMatch) return parseFloat(furlongMatch[1]);
  return null;
}

function raceClassNum(classStr?: string | null): number | null {
  if (!classStr) return null;
  if (/group\s*1|grade\s*1|g1/i.test(classStr)) return 1;
  if (/group\s*2|grade\s*2|g2/i.test(classStr)) return 2;
  if (/group\s*3|grade\s*3|g3/i.test(classStr)) return 3;
  if (/listed/i.test(classStr)) return 2;
  const m = classStr.match(/\d+/);
  if (m) return parseInt(m[0]);
  return null;
}

// ── Core scoring components ───────────────────────────────────────────────────
// These four factors carry 92% of the weighted total score.
// Changes here have maximum impact on classification outcomes.

function scoreAbility(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const form = parseForm(runner.form);
  const odds = parseOdds(runner.odds);
  const age  = parseInt(runner.age ?? "0", 10);
  const cls  = raceClassNum(racecard.raceClass);
  const notes: string[] = [];
  let score = 48;

  // Official Rating is the most reliable signal — it IS the market's form assessment
  if (odds?.type === "or") {
    // OR 40 → 15, OR 135 → 83; tight linear range
    score = 15 + ((odds.value - 40) / 95) * 68;
    notes.push(`OR ${odds.value}`);
  }

  // Form record — weighted toward recency
  if (form.total > 0) {
    const winRate   = form.wins / form.total;
    const placeRate = (form.wins + form.places) / form.total;
    score += winRate * 20 + placeRate * 8;
    if (form.wins > 0) notes.push(`${form.wins}W/${form.total} runs`);
    if (form.trend === "improving") { score += 8;  notes.push("improving form"); }
    if (form.trend === "declining") { score -= 8;  notes.push("form declining"); }
  } else {
    score = 42;
    notes.push("unraced / no form data");
  }

  // Age
  if (!isNaN(age) && age > 0) {
    if (age === 2)          { score -= 10; notes.push("2yo inexperienced"); }
    else if (age === 3)     { score -= 4;  notes.push("3yo allowance"); }
    else if (age >= 4 && age <= 7) { score += 2; }
    else if (age >= 8)      { score -= 6;  notes.push("veteran (8yo+)"); }
  }

  // Class
  if (cls !== null) {
    if (cls === 1)    { score += 7;  notes.push("top-class race"); }
    else if (cls === 2) { score += 3; }
    else if (cls >= 5)  { score -= 5; notes.push("lower-class runner"); }
  }

  // Incidents penalise reliability
  if (form.incidents > 0) { score -= form.incidents * 5; notes.push(`${form.incidents} P/F/U in form`); }

  // Memory: under-pressure response is ability evidence
  const mem = runner.memory;
  if (mem?.pressure) {
    const p = mem.pressure.toLowerCase();
    if (p.includes("strong") || p.includes("battl") || p.includes("tough") || p.includes("respond")) {
      score += 10; notes.push("memory: strong under pressure");
    } else if (p.includes("weak") || p.includes("fold") || p.includes("quit")) {
      score -= 8; notes.push("memory: fades under pressure");
    }
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Standard assessment" };
}

function scorePaceFit(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 54;
  const { fieldSize } = racecard;
  const furlongs = distanceFurlongs(racecard.distance);
  const form = parseForm(runner.form);

  // Field size — larger fields = more pace chaos
  if (fieldSize <= 5)        { score += 10; notes.push("small field — clear pace scenario"); }
  else if (fieldSize <= 8)   { score += 5; }
  else if (fieldSize >= 16)  { score -= 10; notes.push(`${fieldSize}-runner field — pace chaos risk`); }
  else if (fieldSize >= 12)  { score -= 5; }

  // Distance type
  const isSprint = furlongs !== null && furlongs <= 7;
  const isStay   = furlongs !== null && furlongs >= 16;

  if (isSprint) {
    notes.push("sprint — pace premium");
    if (runner.draw && fieldSize > 8) {
      if (runner.draw <= 3)            { score += 7;  notes.push(`low draw (${runner.draw}) sprint advantage`); }
      else if (runner.draw >= fieldSize - 2) { score -= 6; notes.push(`wide draw (${runner.draw}) sprint penalty`); }
    }
  } else if (isStay) {
    notes.push("staying trip — stamina test");
    score += 3;
  }

  // Big-field handicap — pace lottery
  const raceName = racecard.raceName.toLowerCase();
  if (raceName.includes("handicap") && fieldSize >= 14) {
    score -= 8; notes.push("large-field handicap — pace lottery");
  } else if (raceName.includes("handicap")) {
    score -= 3; notes.push("handicap — some pace unpredictability");
  }

  // Improving horse in small field — elevated pace advantage
  if (form.trend === "improving" && fieldSize <= 10) { score += 4; notes.push("improving horse — manageable pace scenario"); }

  // Track profile signals
  const trackProfile = (racecard.trackProfile ?? "").toLowerCase();
  if (trackProfile.includes("pace collapse") || trackProfile.includes("false pace")) { score -= 8; notes.push("track: pace collapse risk"); }
  else if (trackProfile.includes("slow pace") || trackProfile.includes("slow early")) { score -= 5; notes.push("track: slow pace expected"); }
  else if (trackProfile.includes("strong pace") || trackProfile.includes("fast pace")) { score += 5; notes.push("track: strong gallop expected"); }
  else if (trackProfile.includes("pace duel") || trackProfile.includes("two pace"))    { score -= 4; notes.push("track: pace duel risk"); }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Standard pace scenario" };
}

function scoreTacticalResilience(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 54;
  const form = parseForm(runner.form);
  const age  = parseInt(runner.age ?? "0", 10);
  const { fieldSize } = racecard;

  // Age → experience proxy
  if (!isNaN(age) && age > 0) {
    if (age >= 6)       { score += 9;  notes.push("experienced (6yo+)"); }
    else if (age === 5) { score += 5;  notes.push("race-hardened"); }
    else if (age === 4) { score += 2; }
    else if (age === 3) { score -= 5;  notes.push("3yo — still developing"); }
    else if (age === 2) { score -= 15; notes.push("2yo — limited experience"); }
  }

  // Run count → exposure
  if (form.total >= 8)      { score += 6;  notes.push("seasoned (8+ runs)"); }
  else if (form.total >= 5) { score += 3; }

  // Incidents damage reliability
  if (form.incidents > 0) { score -= form.incidents * 12; notes.push(`${form.incidents} incident(s) — reliability concern`); }

  // Finishing position consistency
  const formConsistency = (() => {
    const numericRuns = form.recentForm.filter(r => /[0-9]/.test(r)).map(r => parseInt(r === "0" ? "10" : r));
    if (numericRuns.length < 3) return 0;
    const avg = numericRuns.reduce((a, b) => a + b, 0) / numericRuns.length;
    return Math.sqrt(numericRuns.reduce((acc, r) => acc + Math.pow(r - avg, 2), 0) / numericRuns.length);
  })();

  if (formConsistency > 4.5)                           { score -= 12; notes.push("erratic finishing positions"); }
  else if (formConsistency > 3)                        { score -= 5; }
  else if (formConsistency <= 1.5 && form.total >= 4)  { score += 9;  notes.push("very consistent finisher"); }
  else if (formConsistency <= 2.5 && form.total >= 4)  { score += 4; }

  // Field size — traffic risk
  if (fieldSize > 16)       { score -= 9;  notes.push(`${fieldSize}-runner field — high traffic risk`); }
  else if (fieldSize > 12)  { score -= 4; }
  else if (fieldSize <= 6)  { score += 5;  notes.push("small field — clear run likely"); }

  // Draw in large fields — extra ground
  if (runner.draw && fieldSize >= 12) {
    const midHigh = fieldSize * 0.6;
    if (runner.draw > midHigh) { score -= 5; notes.push(`wide draw (${runner.draw}) — extra ground risk`); }
  }

  // Form trend → confidence
  if (form.trend === "improving") { score += 6; notes.push("building confidence"); }
  if (form.trend === "declining") { score -= 7; notes.push("losing confidence"); }

  // Memory: tactical style
  const mem = runner.memory;
  if (mem?.tactical) {
    const t = mem.tactical.toLowerCase();
    if (t.includes("front") || t.includes("leader") || t.includes("prominent")) { score += 8; notes.push("memory: front-running profile"); }
    else if (t.includes("held up") || t.includes("late") || t.includes("closer")) { score += 6; notes.push("memory: patient tactical style"); }
    else if (t.includes("traffic") || t.includes("trouble") || t.includes("bump")) { score -= 8; notes.push("memory: traffic trouble history"); }
    else { score += 4; notes.push("memory: tactical profile noted"); }
  }
  if (mem?.behaviour) {
    const b = mem.behaviour.toLowerCase();
    if (b.includes("awkward") || b.includes("refuses") || b.includes("rears") || b.includes("unruly")) { score -= 10; notes.push("memory: behavioural concern"); }
    else if (b.includes("genuine") || b.includes("settled") || b.includes("relaxed")) { score += 7; notes.push("memory: genuine temperament"); }
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Standard resilience profile" };
}

function scoreGroundTrip(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 57;
  const going = (racecard.going ?? "").toLowerCase();
  const furlongs = distanceFurlongs(racecard.distance);
  const age  = parseInt(runner.age ?? "0", 10);
  const form = parseForm(runner.form);
  const nrCount = (racecard.nonRunners ?? "").split(",").filter(s => s.trim().length > 0).length;

  // Ground
  if (going.includes("heavy"))                                              { score -= 10; notes.push("Heavy going — specialist surface"); }
  else if (going.includes("soft"))                                          { score -= 5;  notes.push("Soft going — stamina bias"); }
  else if (going.includes("firm") || going.includes("hard"))               { score -= 6;  notes.push("Firm/Hard going — fast surface risk"); }
  else if (going.includes("good to soft") || going.includes("good/soft"))  { score += 2; }
  else if (going.includes("good"))                                          { score += 9;  notes.push("Good going — optimal conditions"); }

  // Distance
  if (furlongs !== null) {
    if (furlongs <= 5)              { notes.push("minimum trip — speed test"); }
    else if (furlongs <= 8)         { score += 3; notes.push(`${furlongs}f — standard trip`); }
    else if (furlongs <= 14)        { score += 2; notes.push(`${furlongs}f — middle distance`); }
    else if (furlongs >= 16)        { notes.push(`${furlongs}f — stamina trip`); }

    if (!isNaN(age) && age > 0) {
      if (age === 3 && furlongs >= 14) { score += 5; notes.push("3yo improving over extended trip"); }
      if (age >= 5 && furlongs >= 16)  { score += 6; notes.push("proven stayer profile"); }
    }
  }

  // Non-runners removing unsuitable types
  if (nrCount >= 3)      { score += 7; notes.push(`${nrCount} NRs — unsuitable rivals withdrawn`); }
  else if (nrCount >= 1) { score += 3; notes.push(`${nrCount} NR(s) — minor field change`); }

  // Experienced in maiden/novice field
  const raceName = racecard.raceName.toLowerCase();
  if ((raceName.includes("novice") || raceName.includes("maiden")) && !isNaN(age) && age >= 4) {
    score += 6; notes.push("experienced in inexperienced field");
  }

  // Clean completion record
  if (form.incidents === 0 && form.total >= 4) { score += 4; notes.push("clean completion record"); }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Standard ground/trip profile" };
}

// ── Contextual modifiers (5% weight each) ─────────────────────────────────────
// These are MINOR adjustments. They cannot manufacture a selection on their own.
// Maximum realistic contribution ≈ ±5 pts to final score.

function scoreReplayIntelligence(runner: RunnerInput, _racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 50;
  const form = parseForm(runner.form);

  // Form trend — consistent improving evidence
  if (form.trend === "improving")      { score += 8; notes.push("improving run-to-run trend"); }
  else if (form.trend === "declining") { score -= 7; notes.push("declining trend — concern"); }

  // Progressive type — multiple wins in few runs
  if (form.wins >= 2 && form.total <= 5) { score += 5; notes.push("progressive type (multiple wins, few runs)"); }

  // Season break recovery
  if (form.hasSeasonBreak) {
    const recentGood = form.recentForm.slice(-3).filter(r => r === "1" || r === "2" || r === "3").length;
    if (recentGood >= 2) { score += 4; notes.push("solid form after seasonal break"); }
    else                 { score -= 3; notes.push("seasonal returner — first-run unknowns"); }
  }

  // Small sample — uncertainty
  if (form.total === 0)       { score = 45; notes.push("no runs — unknown quantity"); }
  else if (form.total <= 2)   { score -= 5; notes.push("limited runs — small sample"); }

  // Incidents may mask true ability
  if (form.incidents >= 2)    { score += 4; notes.push("incidents may mask ability"); }

  // Memory: replay-verified unlucky runs — highest-confidence signal
  const mem = runner.memory;
  if (mem?.replay) {
    const r = mem.replay.toLowerCase();
    if (r.includes("unlucky") || r.includes("blocked") || r.includes("hampered") || r.includes("bumped") || r.includes("checked")) {
      score += 12; notes.push("memory: replay shows interference / unlucky");
    } else if (r.includes("found") || r.includes("more to give") || r.includes("eased") || r.includes("not pushed")) {
      score += 8;  notes.push("memory: replay shows unexploited potential");
    } else if (r.includes("flat") || r.includes("no run") || r.includes("didn't stay") || r.includes("poor")) {
      score -= 8;  notes.push("memory: replay showed weakness");
    } else {
      score += 4;  notes.push("memory: replay notes on file");
    }
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "No specific replay signals" };
}

function scoreHiddenValue(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 46;
  const form = parseForm(runner.form);
  const odds = parseOdds(runner.odds);
  const age  = parseInt(runner.age ?? "0", 10);
  const nrCount = (racecard.nonRunners ?? "").split(",").filter(s => s.trim().length > 0).length;
  const cls = raceClassNum(racecard.raceClass);

  // Odds-based market miss signal
  if (odds?.type === "sp") {
    const dec = odds.value;
    if (dec >= 8)        { score += 10; notes.push(`long shot (${runner.odds}) — potential market miss`); }
    else if (dec >= 4)   { score += 6;  notes.push(`fair price (${runner.odds}) — value possible`); }
    else if (dec >= 2)   { score += 2;  notes.push("mid-market — limited hidden value"); }
    else                 { score -= 8;  notes.push("short-priced — market well aware"); }
  } else if (odds?.type === "or") {
    score = 50; notes.push(`OR ${odds.value} — market assessment pending`);
  }

  // NRs changing race dynamics
  if (nrCount >= 3)      { score += 6;  notes.push(`${nrCount} NRs — race opens up`); }
  else if (nrCount >= 1) { score += 3;  notes.push("NRs — minor field weakening"); }

  // Age underestimation by market
  if (!isNaN(age) && age > 0) {
    if (age === 3) { score += 5; notes.push("3yo — often underrated"); }
    if (age === 4) { score += 3; notes.push("improving 4yo — market can lag"); }
  }

  // Improving form not yet priced in
  if (form.trend === "improving") { score += 6; notes.push("improving form — market may undervalue"); }

  // Class drop relief
  if (cls !== null && cls >= 5) {
    const raceName = racecard.raceName.toLowerCase();
    if (raceName.includes("class 5") || raceName.includes("class 6")) { score += 5; notes.push("class relief — dropping in grade"); }
  }

  // Positive trainer signals
  const trainerComments = (racecard.trainerComments ?? "").toLowerCase();
  const positiveKeywords = ["fit", "well", "pleased", "improve", "ready", "bouncing", "fresh", "right"];
  if (positiveKeywords.some(kw => trainerComments.includes(kw))) { score += 5; notes.push("positive trainer comments"); }

  // Consistent placer yet to win
  if (form.wins === 0 && form.total >= 4 && form.places >= 2) { score += 5; notes.push("consistent placer — overdue a win"); }

  // Memory: specific hidden value angles
  const mem = runner.memory;
  if (mem?.hiddenValue) {
    const h = mem.hiddenValue.toLowerCase();
    if (h.includes("trainer angle") || h.includes("stable") || h.includes("confidently backed") || h.includes("gamble")) {
      score += 10; notes.push("memory: stable/market angle flagged");
    } else if (h.includes("equipment") || h.includes("blinkers") || h.includes("tongue tie") || h.includes("visor")) {
      score += 7;  notes.push("memory: equipment change angle");
    } else if (h.includes("course") || h.includes("distance") || h.includes("specialist") || h.includes("loves")) {
      score += 8;  notes.push("memory: course/distance specialist");
    } else if (h.includes("overpriced") || h.includes("value") || h.includes("wrong price")) {
      score += 7;  notes.push("memory: market value flag");
    } else {
      score += 4;  notes.push("memory: hidden value noted");
    }
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Baseline hidden value assessment" };
}

// ── Volatility risk (runner-level) ────────────────────────────────────────────

function scoreVolatilityRisk(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 32;
  const form = parseForm(runner.form);
  const odds = parseOdds(runner.odds);
  const age  = parseInt(runner.age ?? "0", 10);
  const { fieldSize } = racecard;

  // Age-based unpredictability
  if (!isNaN(age) && age > 0) {
    if (age === 2)      { score += 24; notes.push("2yo — highly unpredictable"); }
    else if (age === 3) { score += 10; notes.push("3yo — still developing"); }
    else if (age === 4) { score += 3; }
    else if (age >= 6)  { score -= 8;  notes.push("veteran — known quantity"); }
  }

  // Incidents signal behavioural volatility
  if (form.incidents > 0) { score += form.incidents * 15; notes.push(`${form.incidents} incident(s) — behavioural risk`); }

  // Finishing position variance
  const formConsistency = (() => {
    const numericRuns = form.recentForm.filter(r => /[0-9]/.test(r)).map(r => parseInt(r === "0" ? "10" : r));
    if (numericRuns.length < 3) return 0;
    const avg = numericRuns.reduce((a, b) => a + b, 0) / numericRuns.length;
    return Math.sqrt(numericRuns.reduce((acc, r) => acc + Math.pow(r - avg, 2), 0) / numericRuns.length);
  })();

  if (formConsistency > 4.5)                          { score += 16; notes.push("erratic finishing positions"); }
  else if (formConsistency > 3)                       { score += 7; }
  else if (formConsistency <= 1.5 && form.total >= 4) { score -= 10; notes.push("very consistent — low variance"); }

  // Field size amplifies risk
  if (fieldSize >= 16) { score += 8; notes.push("large field increases risk"); }
  else if (fieldSize >= 12) { score += 4; }
  else if (fieldSize <= 5)  { score -= 6; notes.push("small field — manageable"); }

  // Price: odds-on = market confidence
  if (odds?.type === "sp") {
    if (odds.value < 0.5)      { score -= 12; notes.push("odds-on — market rates as reliable"); }
    else if (odds.value < 1.5) { score -= 6;  notes.push("short-priced — market confidence"); }
    else if (odds.value >= 10) { score += 8;  notes.push("big-price outsider — high uncertainty"); }
  }

  // Multiple-winner consistency
  if (form.wins >= 2 && formConsistency < 3) { score -= 6; notes.push("multiple-winner — reliable"); }

  // Limited seasonal form
  if (form.hasSeasonBreak && form.total <= 3) { score += 8; notes.push("limited form — unknown readiness"); }

  // Memory: behaviour and pressure
  const mem = runner.memory;
  if (mem?.behaviour) {
    const b = mem.behaviour.toLowerCase();
    if (b.includes("rears") || b.includes("refuses") || b.includes("unruly") || b.includes("violent")) { score += 22; notes.push("memory: serious behavioural concern"); }
    else if (b.includes("awkward") || b.includes("slowly away") || b.includes("dwelt"))                 { score += 12; notes.push("memory: gate/start issue"); }
    else if (b.includes("genuine") || b.includes("reliable") || b.includes("settled"))                  { score -= 12; notes.push("memory: genuine and reliable"); }
  }
  if (mem?.pressure) {
    const p = mem.pressure.toLowerCase();
    if (p.includes("weak") || p.includes("fold") || p.includes("quit") || p.includes("hang"))          { score += 14; notes.push("memory: caves under pressure"); }
    else if (p.includes("battles") || p.includes("digs") || p.includes("tough") || p.includes("fight")) { score -= 8;  notes.push("memory: genuine battler"); }
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Standard risk profile" };
}

// ── Weighted total ────────────────────────────────────────────────────────────
//
// Weights (sum to 1.0 before volatility penalty):
//   Ability              38%  — form + rating: primary signal
//   Pace Fit             20%  — race dynamics: major factor
//   Tactical Resilience  18%  — experience + consistency: major factor
//   Ground / Trip        16%  — conditions: significant factor
//   Replay Intelligence   5%  — contextual modifier: slight adjustment
//   Hidden Value          5%  — contextual modifier: slight adjustment
//   Volatility Risk     −12%  — negative penalty (subtracted)
//
// The 10% combined contextual weight means replay+hidden can influence the
// final total by at most ±4–5 pts. Core factors dominate.

function computeTotal(a: number, pf: number, tr: number, gt: number, ri: number, hv: number, vr: number): number {
  const weighted = a * 0.38 + pf * 0.20 + tr * 0.18 + gt * 0.16 + ri * 0.05 + hv * 0.05 - vr * 0.12;
  return clampF(Math.round(weighted * 10) / 10, 0, 100);
}

// ── Race Environment Volatility ───────────────────────────────────────────────

export function computeRaceVolatility(racecard: RacecardInput): RaceVolatilityResult {
  let score = 0;
  const factors: string[] = [];
  const name     = racecard.raceName.toLowerCase();
  const going    = (racecard.going ?? "").toLowerCase();
  const profile  = (racecard.trackProfile ?? "").toLowerCase();
  const { fieldSize } = racecard;
  const furlongs = distanceFurlongs(racecard.distance);
  const cls      = raceClassNum(racecard.raceClass);
  const nrCount  = (racecard.nonRunners ?? "").split(",").filter(s => s.trim().length > 0).length;

  // Field size — primary chaos driver
  if (fieldSize >= 20)      { score += 40; factors.push(`${fieldSize}-runner field (maximum chaos)`); }
  else if (fieldSize >= 16) { score += 30; factors.push(`${fieldSize}-runner field (large)`); }
  else if (fieldSize >= 12) { score += 18; factors.push(`${fieldSize}-runner field (above average)`); }
  else if (fieldSize >= 8)  { score += 8; }
  else if (fieldSize <= 5)  { score -= 5;  factors.push("small field (reduced chaos)"); }

  // Race type
  const isHandicap   = name.includes("handicap") || name.includes("hcap");
  const isMaiden     = name.includes("maiden") || name.includes("novice");
  const isSelling    = name.includes("selling") || name.includes("claimer") || name.includes("claiming");
  const isJump       = name.includes("chase") || name.includes("hurdle") || name.includes("national hunt");
  const isGroup      = name.includes("group") || name.includes("listed") || name.includes("grade");
  const isConditions = name.includes("conditions") || name.includes("stakes") || isGroup;
  const isSprint     = furlongs !== null && furlongs <= 7;

  if (isGroup)               { score -= 10; factors.push("Group/Listed — high-quality, reliable form"); }
  else if (isConditions)     { score -= 4; }
  else if (isSelling)        { score += 20; factors.push("Selling/Claiming — unpredictable"); }
  else if (isMaiden)         { score += 14; factors.push("Maiden/Novice — inexperienced field"); }
  else if (isHandicap && fieldSize >= 14) { score += 26; factors.push("Large-field handicap — maximum chaos"); }
  else if (isHandicap)       { score += 12; factors.push("Handicap race"); }
  if (isJump)                { score += 14; factors.push("Jump race — incident risk"); }

  // Chaos multipliers: dangerous type combinations that frequently produce chaotic outcomes
  if (isSprint && isHandicap && fieldSize >= 10) {
    score += 18; factors.push("Sprint handicap ≥10 runners — draw lottery, pace chaos compound");
  } else if (isSprint && isHandicap) {
    score += 8; factors.push("Sprint handicap — draw factor elevated");
  }
  if (isMaiden && fieldSize >= 10) {
    score += 10; factors.push("Inexperienced field ≥10 — form reliability low");
  }

  // Going
  if (going.includes("heavy"))                                             { score += 22; factors.push("Heavy going — stamina lottery"); }
  else if (going.includes("soft"))                                         { score += 14; factors.push("Soft going — stamina variance"); }
  else if (going.includes("yielding"))                                     { score += 10; }
  else if (going.includes("good to soft") || going.includes("good/soft")) { score += 6; }
  else if (going.includes("firm") || going.includes("hard"))              { score += 10; factors.push("Fast/Firm surface — pace explosion risk"); }
  else if (going.includes("good"))                                         { score -= 4;  factors.push("Good ground — optimal, stable"); }

  // Track profile signals
  if (profile.includes("pace collapse") || profile.includes("false pace")) { score += 28; factors.push("Track: pace collapse / false pace flagged"); }
  else if (profile.includes("slow pace") || profile.includes("slow early")) { score += 20; factors.push("Track: slow pace expected"); }
  else if (profile.includes("pace duel") || profile.includes("two pace"))   { score += 18; factors.push("Track: pace duel / multiple pace setters"); }
  else if (profile.includes("strong pace") || profile.includes("fast pace")) { score += 4; }
  else if (profile.includes("rail bias") || profile.includes("draw bias"))   { score += 14; factors.push("Track: draw/rail bias noted"); }

  // Draw chaos amplified in sprints (base component — combination above adds more for handicaps)
  if (isSprint) {
    if (fieldSize >= 16)      { score += 26; factors.push("Sprint + large field — draw chaos maximum"); }
    else if (fieldSize >= 12) { score += 16; factors.push("Sprint + sizeable field — draw bias significant"); }
    else if (fieldSize >= 8)  { score += 8;  factors.push("Sprint ≥8 runners — draw factor"); }
    else                      { score += 4;  factors.push("Sprint — draw factor"); }
  }

  // Staying trips
  if (furlongs !== null) {
    if (furlongs >= 20) { score += 18; factors.push("Marathon trip — extreme stamina test"); }
    else if (furlongs >= 16) { score += 12; factors.push("Staying trip — stamina uncertainty"); }
  }

  // Non-runners — late field change
  if (nrCount >= 4)      { score += 14; factors.push(`${nrCount} NRs — field changed significantly`); }
  else if (nrCount >= 2) { score += 8;  factors.push(`${nrCount} NRs — field altered`); }

  // Race class
  if (cls !== null) {
    if (cls >= 5)      { score += 10; factors.push(`Class ${cls} — lower grade, open form book`); }
    else if (cls <= 2) { score -= 6;  factors.push(`Class ${cls} — elite, predictable form lines`); }
  }

  // Market context
  const mktCtx = (racecard.marketContext ?? "").toLowerCase();
  if (mktCtx.includes("open market") || mktCtx.includes("wide open")) { score += 12; factors.push("Market: open race"); }
  if (mktCtx.includes("market mover") || mktCtx.includes("backed") || mktCtx.includes("gamble")) { score += 6; factors.push("Market: significant moves"); }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  let tier: VolatilityTier;
  let label: string;
  let blockedClasses: string[];
  let governanceNote: string;

  // Tier thresholds — calibrated so that:
  //   Group/Listed on good ground with small field → low
  //   Standard conditions handicap ≤8 runners     → medium
  //   10+ runner handicap / sprint + handicap      → high
  //   Large-field sprint handicap / heavy going    → extreme
  if (finalScore >= 52) {
    tier = "extreme";
    label = "Extreme Volatility";
    blockedClasses = ["best_of_day", "top_rated_high_variance"];
    governanceNote = `Race environment score ${finalScore}/100 — highly unpredictable. Best Of Day and Top Rated blocked. Only Each Way Value or No Bet permitted.`;
  } else if (finalScore >= 30) {
    tier = "high";
    label = "High Volatility";
    blockedClasses = ["best_of_day"];
    governanceNote = `Race environment score ${finalScore}/100 — chaotic conditions. Best Of Day blocked. Top Rated / High Variance is the maximum available classification.`;
  } else if (finalScore >= 15) {
    tier = "medium";
    label = "Medium Volatility";
    blockedClasses = [];
    governanceNote = `Race environment score ${finalScore}/100 — moderate unpredictability. Best Of Day requires a relative score of 79+.`;
  } else {
    tier = "low";
    label = "Low Volatility";
    blockedClasses = [];
    governanceNote = `Race environment score ${finalScore}/100 — stable, controlled conditions. All classifications available.`;
  }

  return { score: finalScore, tier, label, factors, blockedClasses, governanceNote };
}

// ── Classification ────────────────────────────────────────────────────────────
// Operates on field-relative score + runner volatility.
// Only rank-1 horses may achieve best_of_day.

function classifyScore(
  relativeScore: number,
  hiddenComponent: number,
  runnerVolatility: number,
  raceVolatility: RaceVolatilityResult,
  isFieldLeader: boolean,
  oddsDecimal: number | null
): { cls: string; note: string } {
  const blocked = raceVolatility.blockedClasses;
  const allow = (cls: string) => !blocked.includes(cls);

  // ── BEST OF THE DAY — most selective tier ─────────────────────────────────
  // Prerequisites: rank-1 in the field, race is low or medium volatility only,
  // runner must have low personal volatility (reliable, consistent individual).
  // Thresholds are deliberately tight — the typical BOD pool should be 0-3 horses.
  if (isFieldLeader) {
    // Low volatility: clearest path — score ≥ 73, controlled runner (vol ≤ 35)
    if (raceVolatility.tier === "low" && relativeScore >= 73 && runnerVolatility <= 35 && allow("best_of_day")) {
      return { cls: "best_of_day", note: `Field leader — score ${Math.round(relativeScore)}, stable race environment, controlled volatility — highest confidence` };
    }
    // Medium volatility: stricter threshold — score ≥ 79, very controlled runner (vol ≤ 30)
    if (raceVolatility.tier === "medium" && relativeScore >= 79 && runnerVolatility <= 30 && allow("best_of_day")) {
      return { cls: "best_of_day", note: `Field leader — score ${Math.round(relativeScore)}, qualifies despite medium volatility — controlled runner in manageable environment` };
    }
    // Would qualify but race governance blocks BOD → downgrade to Top Rated
    if (relativeScore >= 73 && !allow("best_of_day") && allow("top_rated_high_variance")) {
      return { cls: "top_rated_high_variance", note: `Score ${Math.round(relativeScore)} meets Best Of Day threshold — ${raceVolatility.label} environment blocks classification, capped at Top Rated` };
    }
  }

  // ── TOP RATED / HIGH VARIANCE ─────────────────────────────────────────────
  // Strong horse in a volatile race, or non-leader with an exceptional score.
  // Race governance may force strong horses here; volatile runners land here.
  if (relativeScore >= 66 && allow("top_rated_high_variance")) {
    const ctx = isFieldLeader ? "Field leader" : "Strong contender";
    return { cls: "top_rated_high_variance", note: `${ctx} — score ${Math.round(relativeScore)}, ${raceVolatility.label}` };
  }

  // ── EACH WAY VALUE ────────────────────────────────────────────────────────
  // Requires: moderate composite score + elevated hidden value profile + EW odds.
  // The score floor sits below Top Rated (66) to catch capable horses that miss
  // the Top Rated bar but still carry genuine each-way potential.
  // Not available in extreme volatility races (too unpredictable to recommend EW).
  if (
    relativeScore >= 54 &&
    hiddenComponent >= 61 &&
    (oddsDecimal === null || oddsDecimal >= 3.0) &&
    raceVolatility.tier !== "extreme"
  ) {
    return { cls: "each_way_value", note: `Each-way potential — score ${Math.round(relativeScore)}, elevated hidden value profile (${hiddenComponent}), odds suitable` };
  }

  // ── NO BET ────────────────────────────────────────────────────────────────
  return { cls: "no_bet", note: `Score ${Math.round(relativeScore)} — insufficient evidence for a confident selection` };
}

// ── Individual runner engine (for detail pages / backward compat) ─────────────
// Uses raw (un-normalised) total. Classification may differ from field-level
// results because there's no relative context. Use runApexEngineForField for
// dashboard-level classification.

export function runApexEngine(runner: RunnerInput, racecard: RacecardInput): ApexEngineResult {
  const ability            = scoreAbility(runner, racecard);
  const paceFit            = scorePaceFit(runner, racecard);
  const tacticalResilience = scoreTacticalResilience(runner, racecard);
  const groundTrip         = scoreGroundTrip(runner, racecard);
  const replayIntelligence = scoreReplayIntelligence(runner, racecard);
  const hiddenValue        = scoreHiddenValue(runner, racecard);
  const volatilityRisk     = scoreVolatilityRisk(runner, racecard);
  const raceVolatility     = computeRaceVolatility(racecard);

  const totalScore = computeTotal(
    ability.score, paceFit.score, tacticalResilience.score,
    groundTrip.score, replayIntelligence.score, hiddenValue.score, volatilityRisk.score
  );

  const oddsDecimal = parseOddsDecimal(runner.odds);
  // For individual calls: isFieldLeader assumed true (no field context)
  const { cls, note: classificationNote } = classifyScore(
    totalScore, hiddenValue.score, volatilityRisk.score,
    raceVolatility, true, oddsDecimal
  );

  return {
    ability, paceFit, tacticalResilience, groundTrip,
    replayIntelligence, hiddenValue, volatilityRisk,
    totalScore, confidenceClass: cls, classificationNote, raceVolatility,
  };
}

// ── Field-level engine (dashboard / primary selection) ────────────────────────
// This is the authoritative path for classification.
//
// Process:
//   1. Score every runner individually.
//   2. Rank by raw total (strongest → weakest).
//   3. Compute field mean; apply relative modifier.
//   4. Classify with rank-awareness (only rank-1 can be best_of_day).
//   5. Return FieldRunnerResult[] sorted by relativeScore descending.

export function runApexEngineForField(
  runners: RunnerInput[],
  racecard: RacecardInput
): FieldRunnerResult[] {
  if (runners.length === 0) return [];

  const raceVolatility = computeRaceVolatility(racecard);

  // Step 1 — individual scores
  const raw = runners.map(runner => {
    const ability            = scoreAbility(runner, racecard);
    const paceFit            = scorePaceFit(runner, racecard);
    const tacticalResilience = scoreTacticalResilience(runner, racecard);
    const groundTrip         = scoreGroundTrip(runner, racecard);
    const replayIntelligence = scoreReplayIntelligence(runner, racecard);
    const hiddenValue        = scoreHiddenValue(runner, racecard);
    const volatilityRisk     = scoreVolatilityRisk(runner, racecard);

    const totalScore = computeTotal(
      ability.score, paceFit.score, tacticalResilience.score,
      groundTrip.score, replayIntelligence.score, hiddenValue.score, volatilityRisk.score
    );

    return { runner, ability, paceFit, tacticalResilience, groundTrip, replayIntelligence, hiddenValue, volatilityRisk, totalScore };
  });

  // Step 2 — rank by raw total
  raw.sort((a, b) => b.totalScore - a.totalScore);

  // Step 3 — field-relative adjustment
  //
  // Two-component separation mechanism to ensure the strongest horse in each
  // race clearly stands above the rest:
  //
  // A. Mean-deviation amplifier (0.40×): horses above field mean gain a boost,
  //    those below take a penalty. Higher multiplier = wider score spread.
  //
  // B. Rank bonus/penalty (fixed per tier): rewards the clear leader,
  //    penalises the mid-pack and tail to prevent clustering.
  //    rank 1: +3.0   (leader bonus)
  //    rank 2: +1.0   (second place — modest lift)
  //    rank 3: −1.5   (mid-pack — slight penalty)
  //    rank 4+: −3.0  (tail — meaningful penalty)
  //
  // These two components together create 5–12 pt separation between rank-1
  // and rank-2, making field leaders clearly distinguishable.

  const fieldMean = raw.reduce((s, e) => s + e.totalScore, 0) / raw.length;

  function rankBonus(rank: number): number {
    if (rank === 1) return 3.0;
    if (rank === 2) return 1.0;
    if (rank === 3) return -1.5;
    return -3.0;
  }

  const withRelative = raw.map((e, idx) => {
    const fieldRank = idx + 1;
    const relativeScore = clampF(
      e.totalScore + (e.totalScore - fieldMean) * 0.40 + rankBonus(fieldRank),
      0, 100
    );
    return { ...e, fieldRank, relativeScore };
  });

  // Step 4 — classify with rank awareness
  return withRelative.map((e, idx, arr) => {
    const isFieldLeader = e.fieldRank === 1;
    const oddsDecimal   = parseOddsDecimal(e.runner.odds);
    const { cls, note: classificationNote } = classifyScore(
      e.relativeScore, e.hiddenValue.score, e.volatilityRisk.score,
      raceVolatility, isFieldLeader, oddsDecimal
    );

    const nextScore    = arr[idx + 1]?.relativeScore ?? e.relativeScore;
    const fieldEdge    = Math.max(0, Math.round((e.relativeScore - nextScore) * 10) / 10);

    const result: ApexEngineResult = {
      ability:            e.ability,
      paceFit:            e.paceFit,
      tacticalResilience: e.tacticalResilience,
      groundTrip:         e.groundTrip,
      replayIntelligence: e.replayIntelligence,
      hiddenValue:        e.hiddenValue,
      volatilityRisk:     e.volatilityRisk,
      totalScore:         Math.round(e.relativeScore * 10) / 10,  // expose relative as totalScore
      confidenceClass:    cls,
      classificationNote,
      raceVolatility,
    };

    return {
      runner:        e.runner,
      result,
      fieldRank:     e.fieldRank,
      relativeScore: e.relativeScore,
      fieldEdge,
      fieldSize:     runners.length,
    };
  });
}
