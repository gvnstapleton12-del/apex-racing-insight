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
  totalScore: number;
  confidenceClass: string;
  classificationNote: string;
  raceVolatility: RaceVolatilityResult;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

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
    if (r === "1") { wins++; }
    else if (r === "2" || r === "3") { places++; }
    else if (/[4-9]/.test(r) || r === "0") { unplaced++; }
    else if ("PFURW".includes(r)) { incidents++; }
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
  const older = runs.slice(0, Math.min(3, runs.length - 3)).map(runScore);
  const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 50;
  const olderAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : 50;

  const trend: FormStats["trend"] =
    recentAvg > olderAvg + 12 ? "improving" :
    recentAvg < olderAvg - 12 ? "declining" :
    "consistent";

  return { wins, places, unplaced, incidents, total: runs.length, recentForm: runs, trend, hasSeasonBreak };
}

function parseOdds(odds?: string | null): { type: "or"; value: number } | { type: "sp"; value: number } | null {
  if (!odds || odds.trim() === "") return null;
  const s = odds.trim();

  if (s.includes("/")) {
    const [num, den] = s.split("/").map(Number);
    if (!isNaN(num) && !isNaN(den) && den > 0) {
      return { type: "sp", value: num / den };
    }
  }

  const n = parseFloat(s);
  if (!isNaN(n)) {
    if (n >= 40 && n <= 135) return { type: "or", value: n };
    if (n >= 1.0 && n <= 40) return { type: "sp", value: n - 1 };
  }

  return null;
}

function distanceFurlongs(distStr?: string | null): number | null {
  if (!distStr) return null;
  const lower = distStr.toLowerCase();
  const mileMatch = lower.match(/(\d+(?:\.\d+)?)\s*m(?:ile)?/);
  const furlongMatch = lower.match(/(\d+(?:\.\d+)?)\s*f/);
  const milesFurlong = lower.match(/(\d+)m\s*(\d+)f/);
  if (milesFurlong) return parseFloat(milesFurlong[1]) * 8 + parseFloat(milesFurlong[2]);
  if (mileMatch) return parseFloat(mileMatch[1]) * 8;
  if (furlongMatch) return parseFloat(furlongMatch[1]);
  return null;
}

function raceClassNum(classStr?: string | null): number | null {
  if (!classStr) return null;
  const m = classStr.match(/\d+/);
  if (m) return parseInt(m[0]);
  if (/group\s*1|grade\s*1|g1/i.test(classStr)) return 1;
  if (/group\s*2|grade\s*2|g2/i.test(classStr)) return 2;
  if (/group\s*3|grade\s*3|g3/i.test(classStr)) return 3;
  if (/listed/i.test(classStr)) return 2;
  return null;
}

function scoreAbility(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const form = parseForm(runner.form);
  const odds = parseOdds(runner.odds);
  const age = parseInt(runner.age ?? "0", 10);
  const cls = raceClassNum(racecard.raceClass);
  const notes: string[] = [];
  let score = 50;

  if (odds?.type === "or") {
    score = 15 + ((odds.value - 40) / 95) * 68;
    notes.push(`OR ${odds.value}`);
  }

  if (form.total > 0) {
    const winRate = form.wins / form.total;
    const placeRate = (form.wins + form.places) / form.total;
    score += winRate * 22 + placeRate * 9;
    if (form.wins > 0) notes.push(`${form.wins}W in ${form.total} runs`);
    if (form.trend === "improving") { score += 9; notes.push("improving form"); }
    if (form.trend === "declining") { score -= 9; notes.push("form declining"); }
  } else {
    notes.push("unraced or no form data");
    score = 45;
  }

  if (!isNaN(age) && age > 0) {
    if (age === 2) { score -= 8; notes.push("2yo inexperienced"); }
    else if (age === 3) { score -= 3; notes.push("3yo allowance"); }
    else if (age >= 4 && age <= 7) { score += 2; }
    else if (age >= 8) { score -= 5; notes.push("veteran (8yo+)"); }
  }

  if (cls !== null) {
    if (cls === 1) { score += 8; notes.push("top-class race"); }
    else if (cls === 2) { score += 4; }
    else if (cls >= 5) { score -= 5; notes.push("lower-class runner"); }
  }

  if (form.incidents > 0) {
    score -= form.incidents * 5;
    notes.push(`${form.incidents} P/F/U in form`);
  }

  const mem = runner.memory;
  if (mem?.pressure) {
    const p = mem.pressure.toLowerCase();
    if (p.includes("strong") || p.includes("good") || p.includes("battl") || p.includes("tough") || p.includes("respond")) {
      score += 12; notes.push("memory: strong pressure response");
    } else if (p.includes("weak") || p.includes("fold") || p.includes("quit") || p.includes("lack")) {
      score -= 10; notes.push("memory: weak under pressure");
    } else {
      score += 4; notes.push("memory: pressure response noted");
    }
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Standard assessment" };
}

function scorePaceFit(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 55;
  const { fieldSize } = racecard;
  const furlongs = distanceFurlongs(racecard.distance);
  const form = parseForm(runner.form);

  if (fieldSize <= 6) { score += 10; notes.push("small field — clear pace"); }
  else if (fieldSize <= 10) { score += 4; }
  else if (fieldSize >= 16) { score -= 8; notes.push("large field — pace chaos risk"); }
  else if (fieldSize >= 13) { score -= 4; }

  const isSprint = furlongs !== null && furlongs <= 7;
  const isLong = furlongs !== null && furlongs >= 16;
  if (isSprint) {
    notes.push("sprint — pace premium");
    if (runner.draw && fieldSize > 8) {
      if (runner.draw <= 3) { score += 6; notes.push(`low draw (${runner.draw}) favours sprint`); }
      else if (runner.draw >= fieldSize - 2) { score -= 5; notes.push(`wide draw (${runner.draw}) in sprint`); }
    }
  } else if (isLong) {
    notes.push("staying trip — stamina test");
    score += 3;
  }

  const raceName = racecard.raceName.toLowerCase();
  if (raceName.includes("handicap")) {
    if (fieldSize >= 12) { score -= 5; notes.push("big-field handicap — pace lottery"); }
  }

  if (form.trend === "improving" && fieldSize <= 10) {
    score += 4; notes.push("improving horse in manageable field");
  }

  const trackProfile = (racecard.trackProfile ?? "").toLowerCase();
  if (trackProfile.includes("pace collapse") || trackProfile.includes("slow pace")) {
    score -= 6; notes.push("track profile: pace collapse risk");
  }
  if (trackProfile.includes("strong pace") || trackProfile.includes("fast pace")) {
    score += 5; notes.push("track profile: strong pace expected");
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Standard pace scenario" };
}

function scoreTacticalResilience(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 55;
  const form = parseForm(runner.form);
  const age = parseInt(runner.age ?? "0", 10);
  const { fieldSize } = racecard;

  if (!isNaN(age) && age > 0) {
    if (age >= 6) { score += 9; notes.push("experienced (6yo+)"); }
    else if (age === 5) { score += 5; notes.push("race-hardened"); }
    else if (age === 4) { score += 2; }
    else if (age === 3) { score -= 4; notes.push("3yo — developing"); }
    else if (age === 2) { score -= 14; notes.push("2yo — limited experience"); }
  }

  if (form.total >= 5) { score += 5; notes.push("seasoned runner"); }

  if (form.incidents > 0) {
    score -= form.incidents * 12;
    notes.push(`${form.incidents} incident run(s) in form — reliability concern`);
  }

  const formConsistency = (() => {
    const numericRuns = form.recentForm.filter(r => /[0-9]/.test(r)).map(r => parseInt(r === "0" ? "10" : r));
    if (numericRuns.length < 3) return 0;
    const avg = numericRuns.reduce((a, b) => a + b, 0) / numericRuns.length;
    const variance = numericRuns.reduce((acc, r) => acc + Math.pow(r - avg, 2), 0) / numericRuns.length;
    return Math.sqrt(variance);
  })();

  if (formConsistency > 4) { score -= 10; notes.push("inconsistent finishing positions"); }
  else if (formConsistency < 2 && form.total >= 4) { score += 8; notes.push("consistent finisher"); }

  if (fieldSize > 14) { score -= 7; notes.push(`${fieldSize}-runner field — more traffic risk`); }
  else if (fieldSize <= 7) { score += 5; notes.push("small field — cleaner run likely"); }

  if (runner.draw && fieldSize >= 10) {
    const midHigh = fieldSize * 0.6;
    if (runner.draw > midHigh) { score -= 4; notes.push(`wide draw (${runner.draw}) — extra ground`); }
  }

  if (form.trend === "improving") { score += 6; notes.push("building confidence"); }
  if (form.trend === "declining") { score -= 6; notes.push("losing confidence"); }

  const mem = runner.memory;
  if (mem?.tactical) {
    const t = mem.tactical.toLowerCase();
    if (t.includes("front") || t.includes("leader") || t.includes("prominent")) {
      score += 8; notes.push("memory: front-running profile");
    } else if (t.includes("held up") || t.includes("late") || t.includes("closer")) {
      score += 6; notes.push("memory: patient tactical style");
    } else if (t.includes("traffic") || t.includes("trouble") || t.includes("bump")) {
      score -= 8; notes.push("memory: traffic trouble history");
    } else {
      score += 5; notes.push("memory: tactical profile recorded");
    }
  }
  if (mem?.behaviour) {
    const b = mem.behaviour.toLowerCase();
    if (b.includes("awkward") || b.includes("refuses") || b.includes("rears") || b.includes("unruly")) {
      score -= 10; notes.push("memory: behavioural concern at start");
    } else if (b.includes("genuine") || b.includes("settled") || b.includes("relaxed")) {
      score += 7; notes.push("memory: genuine temperament");
    }
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Standard resilience profile" };
}

function scoreGroundTrip(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 58;
  const going = (racecard.going ?? "").toLowerCase();
  const furlongs = distanceFurlongs(racecard.distance);
  const age = parseInt(runner.age ?? "0", 10);
  const form = parseForm(runner.form);
  const nrCount = (racecard.nonRunners ?? "").split(",").filter(s => s.trim().length > 0).length;

  if (going.includes("heavy")) {
    score -= 8;
    notes.push("Heavy going — specialist surface");
  } else if (going.includes("soft")) {
    score -= 4;
    notes.push("Soft going — stamina bias");
  } else if (going.includes("firm") || going.includes("hard")) {
    score -= 5;
    notes.push("Firm/Hard going — fast surface risk");
  } else if (going.includes("good")) {
    score += 8;
    notes.push("Good going — optimal conditions");
  }

  if (furlongs !== null) {
    if (furlongs <= 5) { notes.push("minimum trip — speed test"); }
    else if (furlongs >= 5 && furlongs <= 8) { notes.push(`${furlongs}f — standard trip`); score += 3; }
    else if (furlongs >= 9 && furlongs <= 14) { notes.push(`${furlongs}f — middle distance`); score += 2; }
    else if (furlongs >= 16) { notes.push(`${furlongs}f — stamina trip`); }

    if (!isNaN(age) && age > 0) {
      if (age === 3 && furlongs >= 14) { score += 5; notes.push("3yo over long trip — improving"); }
      if (age >= 5 && furlongs >= 16) { score += 6; notes.push("stayer profile"); }
    }
  }

  if (nrCount >= 3) {
    score += 7;
    notes.push(`${nrCount} NRs — conditions not suiting others`);
  } else if (nrCount >= 1) {
    score += 3;
    notes.push(`${nrCount} NR(s) — minor field reduction`);
  }

  const raceName = racecard.raceName.toLowerCase();
  if (raceName.includes("novice") || raceName.includes("maiden")) {
    if (!isNaN(age) && age >= 4) { score += 5; notes.push("experienced in inexperienced field"); }
  }

  if (form.incidents === 0 && form.total >= 4) {
    score += 4; notes.push("clean completion record");
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Standard ground/trip profile" };
}

function scoreReplayIntelligence(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 50;
  const form = parseForm(runner.form);
  const nameLower = runner.horseName.toLowerCase();

  if (form.trend === "improving") {
    score += 14;
    notes.push("form trend improving — may be better than bare figures suggest");
  } else if (form.trend === "declining") {
    score -= 10;
    notes.push("declining form — loss of form hard to explain from numbers alone");
  }

  if (form.wins >= 2 && form.total <= 5) {
    score += 8;
    notes.push("multiple wins in few runs — progressive type");
  }

  if (form.hasSeasonBreak) {
    const recentForm = form.recentForm.slice(-3);
    const recentGood = recentForm.filter(r => r === "1" || r === "2" || r === "3").length;
    if (recentGood >= 2) {
      score += 7;
      notes.push("strong form after returning from break");
    } else {
      score -= 4;
      notes.push("seasonal returner — first run unknowns");
    }
  }

  const trackProfile = (racecard.trackProfile ?? "").toLowerCase();
  const contextIntel = (racecard.marketContext ?? "").toLowerCase();
  const trainerComments = (racecard.trainerComments ?? "").toLowerCase();

  const allContext = [trackProfile, contextIntel, trainerComments].join(" ");
  if (nameLower.split(" ").some(word => word.length > 3 && allContext.includes(word))) {
    score += 15;
    notes.push("horse mentioned in race intelligence notes");
  }

  if (form.total === 0) {
    score = 45;
    notes.push("no form — unknown quantity");
  } else if (form.total <= 2) {
    score -= 6;
    notes.push("limited runs — small sample");
  }

  if (form.incidents >= 2) {
    score += 5;
    notes.push("incidents may mask true ability — replay value");
  }

  const mem = runner.memory;
  if (mem?.replay) {
    const r = mem.replay.toLowerCase();
    if (r.includes("unlucky") || r.includes("blocked") || r.includes("hampered") || r.includes("bumped") || r.includes("checked")) {
      score += 18; notes.push("memory: replay shows unlucky interference");
    } else if (r.includes("found") || r.includes("more to give") || r.includes("eased") || r.includes("not pushed")) {
      score += 14; notes.push("memory: replay shows unexploited potential");
    } else if (r.includes("flat") || r.includes("no run") || r.includes("poor") || r.includes("didn't stay")) {
      score -= 10; notes.push("memory: replay showed weakness");
    } else {
      score += 8; notes.push("memory: replay notes on file");
    }
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "No specific replay signals — baseline 50" };
}

function scoreHiddenValue(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 45;
  const form = parseForm(runner.form);
  const odds = parseOdds(runner.odds);
  const age = parseInt(runner.age ?? "0", 10);
  const nrCount = (racecard.nonRunners ?? "").split(",").filter(s => s.trim().length > 0).length;
  const cls = raceClassNum(racecard.raceClass);

  if (odds?.type === "sp") {
    const decimal = odds.value;
    if (decimal >= 8) { score += 18; notes.push(`long shot (${runner.odds}) — potential market miss`); }
    else if (decimal >= 4) { score += 10; notes.push(`fair price (${runner.odds}) — value possible`); }
    else if (decimal >= 2) { score += 3; notes.push(`mid-market — limited hidden value`); }
    else { score -= 10; notes.push("short-priced — market has it covered"); }
  } else if (odds?.type === "or") {
    notes.push(`OR ${odds.value} — market assessment pending`);
    score = 50;
  }

  if (nrCount >= 3) {
    score += 10;
    notes.push(`${nrCount} NRs weaken field — race opens up`);
  } else if (nrCount >= 1) {
    score += 4;
    notes.push("field weakened by NRs");
  }

  if (!isNaN(age) && age > 0) {
    if (age === 3) { score += 8; notes.push("3yo — often underrated by market"); }
    if (age === 4) { score += 4; notes.push("improving 4yo — market can lag"); }
  }

  if (form.trend === "improving") {
    score += 10;
    notes.push("improving form not always priced in");
  }

  if (cls !== null) {
    const raceName = racecard.raceName.toLowerCase();
    if (cls >= 4 && (raceName.includes("class 5") || raceName.includes("class 6"))) {
      score += 6; notes.push("class relief — dropping in grade");
    }
  }

  const trainerComments = (racecard.trainerComments ?? "").toLowerCase();
  const positiveKeywords = ["fit", "well", "right", "pleased", "improve", "ready", "bouncing", "fresh"];
  if (positiveKeywords.some(kw => trainerComments.includes(kw))) {
    score += 8; notes.push("positive trainer comments");
  }

  if (form.wins === 0 && form.total >= 4 && form.places >= 2) {
    score += 6; notes.push("consistent placer yet to win — overdue");
  }

  const mem = runner.memory;
  if (mem?.hiddenValue) {
    const h = mem.hiddenValue.toLowerCase();
    if (h.includes("trainer angle") || h.includes("stable") || h.includes("confidently backed") || h.includes("market move")) {
      score += 20; notes.push("memory: stable/market angle flagged");
    } else if (h.includes("equipment") || h.includes("blinkers") || h.includes("tongue tie") || h.includes("visor")) {
      score += 12; notes.push("memory: equipment change angle");
    } else if (h.includes("course") || h.includes("distance") || h.includes("specialist") || h.includes("loves")) {
      score += 15; notes.push("memory: course/distance specialist flagged");
    } else if (h.includes("overpriced") || h.includes("value") || h.includes("wrong price")) {
      score += 14; notes.push("memory: market value flag");
    } else {
      score += 8; notes.push("memory: hidden value flagged");
    }
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Baseline hidden value assessment" };
}

function scoreVolatilityRisk(runner: RunnerInput, racecard: RacecardInput): ScoreBreakdown {
  const notes: string[] = [];
  let score = 35;
  const form = parseForm(runner.form);
  const odds = parseOdds(runner.odds);
  const age = parseInt(runner.age ?? "0", 10);
  const { fieldSize } = racecard;

  if (!isNaN(age) && age > 0) {
    if (age === 2) { score += 22; notes.push("2yo — highly unpredictable"); }
    else if (age === 3) { score += 10; notes.push("3yo — still developing"); }
    else if (age === 4) { score += 3; }
    else if (age >= 6) { score -= 8; notes.push("veteran — known quantity"); }
  }

  if (form.incidents > 0) {
    score += form.incidents * 15;
    notes.push(`${form.incidents} incident(s) (P/F/U) — behavioural risk`);
  }

  const formConsistency = (() => {
    const numericRuns = form.recentForm.filter(r => /[0-9]/.test(r)).map(r => parseInt(r === "0" ? "10" : r));
    if (numericRuns.length < 3) return 0;
    const avg = numericRuns.reduce((a, b) => a + b, 0) / numericRuns.length;
    return Math.sqrt(numericRuns.reduce((acc, r) => acc + Math.pow(r - avg, 2), 0) / numericRuns.length);
  })();

  if (formConsistency > 4) {
    score += 14;
    notes.push("erratic finishing positions — high inconsistency");
  } else if (formConsistency > 2) {
    score += 5;
  } else if (formConsistency <= 1 && form.total >= 4) {
    score -= 10;
    notes.push("very consistent — low variance");
  }

  if (fieldSize >= 16) { score += 8; notes.push("large field increases risk"); }
  else if (fieldSize >= 12) { score += 4; }
  else if (fieldSize <= 6) { score -= 5; notes.push("small field — manageable"); }

  if (odds?.type === "sp") {
    if (odds.value < 0.5) { score -= 12; notes.push("odds-on — market rates as reliable"); }
    else if (odds.value < 1.5) { score -= 6; notes.push("short-priced — market confidence"); }
    else if (odds.value >= 10) { score += 8; notes.push("big-price outsider — high uncertainty"); }
  }

  if (form.wins >= 2 && formConsistency < 3) {
    score -= 6; notes.push("multiple-winner — reliable");
  }

  if (form.hasSeasonBreak && form.total <= 3) {
    score += 8; notes.push("limited seasonal form — unknown current readiness");
  }

  const mem = runner.memory;
  if (mem?.behaviour) {
    const b = mem.behaviour.toLowerCase();
    if (b.includes("rears") || b.includes("refuses") || b.includes("unruly") || b.includes("violent") || b.includes("savage")) {
      score += 22; notes.push("memory: serious behavioural concern");
    } else if (b.includes("awkward") || b.includes("hesitant") || b.includes("slowly away") || b.includes("dwelt")) {
      score += 12; notes.push("memory: start/gate issue");
    } else if (b.includes("genuine") || b.includes("reliable") || b.includes("settled") || b.includes("relaxed") || b.includes("professional")) {
      score -= 12; notes.push("memory: genuine and reliable");
    }
  }
  if (mem?.pressure) {
    const p = mem.pressure.toLowerCase();
    if (p.includes("weak") || p.includes("fold") || p.includes("quit") || p.includes("hang") || p.includes("stops")) {
      score += 14; notes.push("memory: caves under pressure");
    } else if (p.includes("battles") || p.includes("digs") || p.includes("tough") || p.includes("fight")) {
      score -= 8; notes.push("memory: battler — low volatility risk");
    }
  }

  return { score: clamp(score), note: notes.length ? notes.join(" · ") : "Standard risk profile" };
}

function computeTotal(a: number, pf: number, tr: number, gt: number, ri: number, hv: number, vr: number): number {
  const weighted = a * 0.25 + pf * 0.15 + tr * 0.15 + gt * 0.15 + ri * 0.15 + hv * 0.15 - vr * 0.1;
  return Math.max(0, Math.min(100, Math.round(weighted * 10) / 10));
}

// ── Race Environment Volatility ───────────────────────────────────────────────

export function computeRaceVolatility(racecard: RacecardInput): RaceVolatilityResult {
  let score = 0;
  const factors: string[] = [];
  const name = racecard.raceName.toLowerCase();
  const going = (racecard.going ?? "").toLowerCase();
  const profile = (racecard.trackProfile ?? "").toLowerCase();
  const fieldSize = racecard.fieldSize;
  const furlongs = distanceFurlongs(racecard.distance);
  const cls = raceClassNum(racecard.raceClass);
  const nrCount = (racecard.nonRunners ?? "").split(",").filter(s => s.trim().length > 0).length;

  // ── Field size ──────────────────────────────────────────────────────────────
  if (fieldSize >= 20) { score += 40; factors.push(`${fieldSize}-runner field (maximum chaos)`); }
  else if (fieldSize >= 16) { score += 30; factors.push(`${fieldSize}-runner field (large)`); }
  else if (fieldSize >= 12) { score += 20; factors.push(`${fieldSize}-runner field (above average)`); }
  else if (fieldSize >= 8)  { score += 10; }
  else if (fieldSize <= 5)  { score -= 5; factors.push("small field (reduced chaos)"); }

  // ── Race type ───────────────────────────────────────────────────────────────
  const isHandicap = name.includes("handicap") || name.includes("hcap");
  const isMaiden   = name.includes("maiden") || name.includes("novice");
  const isSelling  = name.includes("selling") || name.includes("claimer") || name.includes("claiming");
  const isJump     = name.includes("chase") || name.includes("hurdle") || name.includes("national hunt");
  const isGroup    = name.includes("group") || name.includes("listed") || name.includes("grade");
  const isConditions = name.includes("conditions") || name.includes("stakes") || (isGroup);

  if (isGroup)       { score -= 8;  factors.push("Group/Listed race (high quality, lower chaos)"); }
  else if (isConditions) { score -= 4; }
  else if (isSelling){ score += 18; factors.push("Selling/Claiming (unpredictable market)"); }
  else if (isMaiden) { score += 14; factors.push("Maiden/Novice (inexperienced field)"); }
  else if (isHandicap && fieldSize >= 14) { score += 22; factors.push("Large-field handicap (maximum chaos)"); }
  else if (isHandicap) { score += 10; factors.push("Handicap race"); }
  if (isJump)        { score += 14; factors.push("Jump race (incident risk)"); }

  // ── Going / surface ─────────────────────────────────────────────────────────
  if (going.includes("heavy")) { score += 22; factors.push("Heavy going (stamina lottery)"); }
  else if (going.includes("soft")) { score += 14; factors.push("Soft going (stamina variance)"); }
  else if (going.includes("yielding")) { score += 10; }
  else if (going.includes("good to soft") || going.includes("good/soft")) { score += 6; }
  else if (going.includes("firm") || going.includes("hard")) { score += 10; factors.push("Fast/Firm surface (pace explosion risk)"); }
  else if (going.includes("good")) { score -= 4; factors.push("Good ground (optimal, stable)"); }

  // ── Pace instability (from track profile) ──────────────────────────────────
  if (profile.includes("pace collapse") || profile.includes("false pace")) {
    score += 28; factors.push("Track profile: pace collapse / false pace flagged");
  } else if (profile.includes("slow pace") || profile.includes("slow early")) {
    score += 20; factors.push("Track profile: slow pace expected");
  } else if (profile.includes("multiple pace") || profile.includes("two pace") || profile.includes("pace duel")) {
    score += 18; factors.push("Track profile: multiple pace setters / pace duel");
  } else if (profile.includes("strong pace") || profile.includes("fast pace")) {
    score += 5;
  } else if (profile.includes("rail bias") || profile.includes("draw bias")) {
    score += 12; factors.push("Track profile: draw/rail bias noted");
  }

  // ── Draw chaos ──────────────────────────────────────────────────────────────
  if (furlongs !== null && furlongs <= 7) {
    if (fieldSize >= 16) { score += 25; factors.push("Sprint with large field (draw chaos)"); }
    else if (fieldSize >= 12) { score += 15; factors.push("Sprint with sizeable field (draw bias)"); }
    else { score += 8; factors.push("Sprint race (draw factor)"); }
  }

  // ── Tactical randomness ─────────────────────────────────────────────────────
  if (furlongs !== null) {
    if (furlongs >= 20) { score += 18; factors.push("Marathon distance (extreme stamina test)"); }
    else if (furlongs >= 16) { score += 12; factors.push("Staying trip (stamina uncertainty)"); }
  }

  // ── Non-runners ─────────────────────────────────────────────────────────────
  if (nrCount >= 4) { score += 14; factors.push(`${nrCount} non-runners (field changed significantly)`); }
  else if (nrCount >= 2) { score += 8; factors.push(`${nrCount} non-runners (field altered)`); }

  // ── Race class ──────────────────────────────────────────────────────────────
  if (cls !== null) {
    if (cls >= 5) { score += 10; factors.push(`Class ${cls} (lower grade — open form)`); }
    else if (cls <= 2) { score -= 6; factors.push(`Class ${cls} (elite — predictable form lines)`); }
  }

  // ── Market context signals ──────────────────────────────────────────────────
  const mktCtx = (racecard.marketContext ?? "").toLowerCase();
  if (mktCtx.includes("open market") || mktCtx.includes("wide open")) {
    score += 12; factors.push("Market context: open race");
  }
  if (mktCtx.includes("market mover") || mktCtx.includes("backed") || mktCtx.includes("gamble")) {
    score += 6; factors.push("Market context: significant market moves");
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  let tier: VolatilityTier;
  let label: string;
  let blockedClasses: string[];
  let governanceNote: string;

  if (finalScore >= 65) {
    tier = "extreme";
    label = "Extreme Volatility";
    blockedClasses = ["best_of_day", "top_rated_high_variance"];
    governanceNote = `Race environment score ${finalScore}/100 — highly unpredictable. Best Of Day and Top Rated / High Variance classifications are blocked. Only Hidden Value, Replay Upgrade, or No Bet permitted.`;
  } else if (finalScore >= 45) {
    tier = "high";
    label = "High Volatility";
    blockedClasses = ["best_of_day"];
    governanceNote = `Race environment score ${finalScore}/100 — chaotic field. Best Of Day classification is blocked. Top Rated / High Variance is the maximum available confidence.`;
  } else if (finalScore >= 25) {
    tier = "medium";
    label = "Medium Volatility";
    blockedClasses = [];
    governanceNote = `Race environment score ${finalScore}/100 — moderate unpredictability. Best Of Day requires a total score of 73+.`;
  } else {
    tier = "low";
    label = "Low Volatility";
    blockedClasses = [];
    governanceNote = `Race environment score ${finalScore}/100 — stable field. All confidence classifications available.`;
  }

  return { score: finalScore, tier, label, factors, blockedClasses, governanceNote };
}

// ── Classification with governance ───────────────────────────────────────────

function classifyScore(
  total: number,
  ability: number,
  hidden: number,
  replay: number,
  volatility: number,
  raceVolatility: RaceVolatilityResult
): { cls: string; note: string } {
  const blocked = raceVolatility.blockedClasses;
  const minBestOfDay = raceVolatility.tier === "medium" ? 73 : 72;

  const allow = (cls: string) => !blocked.includes(cls);

  if (total >= minBestOfDay && volatility <= 42 && allow("best_of_day")) {
    return { cls: "best_of_day", note: `Strong composite score (${total}) with controlled volatility (${volatility}) — highest confidence selection` };
  }
  // Would have been best_of_day but race governance blocks it
  if (total >= minBestOfDay && !allow("best_of_day") && allow("top_rated_high_variance")) {
    return { cls: "top_rated_high_variance", note: `Score ${total} qualifies for Best Of Day but ${raceVolatility.label} blocks it — capped at Top Rated / High Variance` };
  }
  if (total >= minBestOfDay && !allow("best_of_day") && !allow("top_rated_high_variance")) {
    return { cls: "no_bet", note: `Score ${total} qualifies for Best Of Day but ${raceVolatility.label} blocks both top classifications` };
  }
  if (total >= 65 && volatility > 48 && allow("top_rated_high_variance")) {
    return { cls: "top_rated_high_variance", note: `High ability score (${ability}) but elevated volatility (${volatility}) — capable but unpredictable` };
  }
  if (hidden >= 70 && total >= 50) {
    return { cls: "hidden_value", note: `Hidden Value indicator (${hidden}) elevated — market may be underestimating this runner` };
  }
  if (replay >= 70 && total >= 50) {
    return { cls: "replay_upgrade", note: `Replay Intelligence score (${replay}) suggests performance better than form shows` };
  }
  if (total >= 60 && volatility <= 50 && allow("best_of_day")) {
    return { cls: "best_of_day", note: `Solid all-round score (${total}) — reliable selection candidate` };
  }
  if (total >= 60 && !allow("best_of_day") && allow("top_rated_high_variance")) {
    return { cls: "top_rated_high_variance", note: `Score ${total} capped by ${raceVolatility.label} — race environment limits confidence` };
  }
  return { cls: "no_bet", note: `Total score ${total} — insufficient evidence for a confident selection` };
}

export function runApexEngine(runner: RunnerInput, racecard: RacecardInput): ApexEngineResult {
  const ability = scoreAbility(runner, racecard);
  const paceFit = scorePaceFit(runner, racecard);
  const tacticalResilience = scoreTacticalResilience(runner, racecard);
  const groundTrip = scoreGroundTrip(runner, racecard);
  const replayIntelligence = scoreReplayIntelligence(runner, racecard);
  const hiddenValue = scoreHiddenValue(runner, racecard);
  const volatilityRisk = scoreVolatilityRisk(runner, racecard);
  const raceVolatility = computeRaceVolatility(racecard);

  const totalScore = computeTotal(
    ability.score, paceFit.score, tacticalResilience.score,
    groundTrip.score, replayIntelligence.score, hiddenValue.score, volatilityRisk.score
  );

  const { cls, note: classificationNote } = classifyScore(
    totalScore, ability.score, hiddenValue.score, replayIntelligence.score,
    volatilityRisk.score, raceVolatility
  );

  return {
    ability,
    paceFit,
    tacticalResilience,
    groundTrip,
    replayIntelligence,
    hiddenValue,
    volatilityRisk,
    totalScore,
    confidenceClass: cls,
    classificationNote,
    raceVolatility,
  };
}
