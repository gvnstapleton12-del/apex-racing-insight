import { useMemo } from "react";
import { Link } from "wouter";
import { useQueries } from "@tanstack/react-query";
import {
  useListRacecards,
  getListRacecardsQueryKey,
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  getGetRacecardAnalysisQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2, Trophy, Eye, Film, Ban, ChevronRight,
  Zap, Star, TrendingUp, ShieldOff,
} from "lucide-react";
import {
  runApexEngine, computeRaceVolatility,
  type RaceVolatilityResult, type VolatilityTier,
} from "@/lib/apexEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScoredPick {
  racecardId: number;
  venue: string;
  raceTime: string;
  raceName: string;
  horseName: string;
  odds?: string | null;
  confidenceClass: string;
  reason: string;
  totalScore: number;
  categoryScore: number;
  fieldEdge: number;       // gap from 2nd horse in same race
  volatilityTier: VolatilityTier;
}

interface AvoidEntry {
  racecardId: number;
  venue: string;
  raceTime: string;
  raceName: string;
  volatility: RaceVolatilityResult;
  runnerCount: number;
}

interface DayBoard {
  betOfDay:       ScoredPick | null;   // single elected horse — highest-scoring BOD only
  bestOfDay:      ScoredPick[];        // all other best_of_day qualifiers, ranked
  topRated:       ScoredPick[];        // engine top_rated_high_variance
  eachWayValue:   ScoredPick[];
  replayUpgrades: ScoredPick[];
  hiddenValue:    ScoredPick[];
  avoidRaces:     AvoidEntry[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const todayStr = new Date().toISOString().slice(0, 10);

// Governance thresholds for the single Best Of The Day horse
const BOD_MIN_SCORE      = 62;   // must score at least this
const BOD_MIN_FIELD_EDGE = 4;    // must be this many points clear of 2nd horse in race
const BOD_ALLOWED_TIERS: VolatilityTier[] = ["low", "medium"];

const TIER_COLOR: Record<VolatilityTier, string> = {
  low: "text-green-400", medium: "text-amber-400",
  high: "text-orange-400", extreme: "text-red-400",
};

const CONF_STYLE: Record<string, { chip: string; label: string }> = {
  best_of_day:             { chip: "bg-amber-400/15 text-amber-300 border-amber-400/30",       label: "Best Of The Day" },
  top_rated_high_variance: { chip: "bg-blue-400/15 text-blue-300 border-blue-400/30",          label: "Top Rated"       },
  hidden_value:            { chip: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30", label: "Hidden Value"    },
  replay_upgrade:          { chip: "bg-purple-400/15 text-purple-300 border-purple-400/30",    label: "Replay Upgrade"  },
  each_way_value:          { chip: "bg-teal-400/15 text-teal-300 border-teal-400/30",          label: "EW Value"        },
  no_bet:                  { chip: "bg-muted/20 text-muted-foreground/50 border-border/30",     label: "No Bet"          },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOddsDecimal(odds: string | null | undefined): number | null {
  if (!odds) return null;
  const s = odds.trim().toLowerCase();
  if (s === "evs" || s === "evens") return 2.0;
  const sl = s.indexOf("/");
  if (sl !== -1) {
    const n = parseFloat(s.slice(0, sl)), d = parseFloat(s.slice(sl + 1));
    if (!isNaN(n) && !isNaN(d) && d > 0) return n / d + 1;
  }
  const dec = parseFloat(s);
  if (!isNaN(dec)) return dec;
  return null;
}

// ── Race entry builder ────────────────────────────────────────────────────────

type RunnerRow = {
  id: number; horseName: string; draw?: number | null; age?: string | null;
  form?: string | null; odds?: string | null; jockey?: string | null;
  trainer?: string | null; weight?: string | null;
  isNonRunner?: boolean | null; scratched?: boolean | null;
};

type RacecardRow = {
  id: number; venue: string; raceTime: string; raceName: string;
  distance?: string | null; going?: string | null; raceClass?: string | null;
  prize?: string | null; trackProfile?: string | null; marketContext?: string | null;
  trainerComments?: string | null; nonRunners?: string | null;
};

function buildRaceEntries(rc: RacecardRow, runners: RunnerRow[]): {
  bodCandidates:  ScoredPick[];  // engine-classified best_of_day — day-level governance picks ONE
  topRatedPicks:  ScoredPick[];  // top_rated_high_variance from engine
  eachWayPicks:   ScoredPick[];
  replayPicks:    ScoredPick[];
  hiddenPicks:    ScoredPick[];
  avoid?:         AvoidEntry;
} {
  const empty = { bodCandidates: [], topRatedPicks: [], eachWayPicks: [], replayPicks: [], hiddenPicks: [] };
  const active = runners.filter(r => !r.isNonRunner && !r.scratched);
  if (active.length === 0) return empty;

  const racecardInput = {
    raceName: rc.raceName, distance: rc.distance ?? null, going: rc.going ?? null,
    raceClass: rc.raceClass ?? null, prize: rc.prize ?? null,
    trackProfile: rc.trackProfile ?? null, marketContext: rc.marketContext ?? null,
    trainerComments: rc.trainerComments ?? null, nonRunners: rc.nonRunners ?? null,
    fieldSize: active.length,
  };

  const volatility = computeRaceVolatility(racecardInput);

  if (volatility.tier === "extreme") {
    return {
      ...empty,
      avoid: {
        racecardId: rc.id, venue: rc.venue, raceTime: rc.raceTime,
        raceName: rc.raceName, volatility, runnerCount: active.length,
      },
    };
  }

  const scored = active
    .map(r => ({
      runner: r,
      result: runApexEngine(
        { horseName: r.horseName, draw: r.draw, age: r.age, form: r.form,
          odds: r.odds, jockey: r.jockey, trainer: r.trainer, weight: r.weight },
        racecardInput,
      ),
    }))
    .sort((a, b) => b.result.totalScore - a.result.totalScore);

  // Field edge = gap between rank-1 score and rank-2 score within this race
  const fieldEdgeForRank = (idx: number) => {
    if (scored.length < 2) return 20; // only one runner: infinite edge
    if (idx === 0) return scored[0].result.totalScore - scored[1].result.totalScore;
    return scored[idx].result.totalScore - (scored[idx + 1]?.result.totalScore ?? 0);
  };

  const toPick = (e: typeof scored[0], idx: number, confOverride?: string, catScore?: number): ScoredPick => ({
    racecardId: rc.id, venue: rc.venue, raceTime: rc.raceTime, raceName: rc.raceName,
    horseName: e.runner.horseName, odds: e.runner.odds,
    confidenceClass: confOverride ?? e.result.confidenceClass,
    reason: e.result.classificationNote || e.result.ability.note,
    totalScore: e.result.totalScore,
    categoryScore: catScore ?? e.result.totalScore,
    fieldEdge: fieldEdgeForRank(idx),
    volatilityTier: volatility.tier,
  });

  // BOD candidates: engine says best_of_day — day-level governance will elect at most one
  const bodCandidates = scored
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.result.confidenceClass === "best_of_day")
    .map(({ e, i }) => toPick(e, i));

  // Top Rated: engine says top_rated_high_variance
  const topRatedPicks = scored
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.result.confidenceClass === "top_rated_high_variance")
    .map(({ e, i }) => toPick(e, i));

  // Replay Upgrades
  const replayPicks = scored
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.result.confidenceClass === "replay_upgrade")
    .map(({ e, i }) => toPick(e, i, undefined, e.result.replayIntelligence.score));

  // Hidden Value
  const hiddenPicks = scored
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.result.hiddenValue.score >= 60 && e.result.confidenceClass !== "no_bet")
    .sort((a, b) => b.e.result.hiddenValue.score - a.e.result.hiddenValue.score)
    .map(({ e, i }) => toPick(e, i, "hidden_value", e.result.hiddenValue.score));

  // Each Way: hidden_value profile + decent odds + field large enough
  const eachWayPicks = active.length >= 5
    ? scored
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => {
          const dec = parseOddsDecimal(e.runner.odds);
          return e.result.hiddenValue.score >= 58
            && e.result.confidenceClass !== "no_bet"
            && (dec === null || dec >= 3.0);
        })
        .sort((a, b) => b.e.result.hiddenValue.score - a.e.result.hiddenValue.score)
        .map(({ e, i }) => toPick(e, i, "each_way_value", e.result.hiddenValue.score))
    : [];

  return { bodCandidates, topRatedPicks, eachWayPicks, replayPicks, hiddenPicks };
}

// ── Aggregate into day board ──────────────────────────────────────────────────

function electBetOfDay(candidates: ScoredPick[]): { winner: ScoredPick | null; rest: ScoredPick[] } {
  // Only Best Of The Day horses are eligible — governance filters applied
  const qualified = candidates
    .filter(c =>
      c.totalScore >= BOD_MIN_SCORE &&
      BOD_ALLOWED_TIERS.includes(c.volatilityTier) &&
      c.fieldEdge >= BOD_MIN_FIELD_EDGE
    )
    .sort((a, b) => b.totalScore - a.totalScore);

  if (qualified.length === 0) {
    // No single horse clears governance — all remain in Best Of The Day list
    return { winner: null, rest: candidates };
  }

  const winner = qualified[0];
  // Remaining BOD candidates still carry best_of_day classification in the list below
  const rest = candidates
    .filter(c => !(c.racecardId === winner.racecardId && c.horseName === winner.horseName));

  return { winner, rest };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfChip({ cls }: { cls: string }) {
  const s = CONF_STYLE[cls] ?? CONF_STYLE.no_bet;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${s.chip}`}>
      {s.label}
    </span>
  );
}

// Single hero card for the one Bet Of The Day election
function BetOfDayHero({ pick }: { pick: ScoredPick }) {
  return (
    <Link href={`/racecards/${pick.racecardId}`}>
      <div className="group relative overflow-hidden rounded-xl border border-amber-500/50 bg-gradient-to-br from-amber-500/12 via-amber-400/5 to-transparent p-5 cursor-pointer hover:border-amber-500/80 transition-all duration-200">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-400/5 rounded-full -translate-y-20 translate-x-20 pointer-events-none" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Bet Of The Day</span>
              <ConfChip cls="best_of_day" />
            </div>
            <div className="text-2xl md:text-3xl font-bold leading-tight text-foreground">{pick.horseName}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-primary">{pick.venue}</span>
              <span className="text-muted-foreground/50 text-sm">·</span>
              <span className="text-sm font-mono text-muted-foreground">{pick.raceTime}</span>
              {pick.odds && (
                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {pick.odds}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70 leading-relaxed max-w-prose">{pick.reason}</p>
            <div className="flex items-center gap-3 pt-0.5">
              <span className="text-[11px] text-muted-foreground/50">
                Field edge <span className="text-amber-400/80 font-semibold">+{pick.fieldEdge.toFixed(1)}</span> pts
              </span>
              <span className="text-[11px] text-muted-foreground/50">
                Volatility <span className={`font-semibold ${TIER_COLOR[pick.volatilityTier]}`}>{pick.volatilityTier}</span>
              </span>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-amber-400/40 group-hover:text-amber-400 transition-colors mt-1 shrink-0" />
        </div>
      </div>
    </Link>
  );
}

// No-qualifier banner
function NoBetOfDay({ scanning }: { scanning: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/20 bg-amber-500/5 p-5 flex items-center gap-3">
      <ShieldOff className="h-5 w-5 text-amber-400/40 shrink-0" />
      <p className="text-sm text-muted-foreground/60">
        {scanning
          ? "Scanning Best Of The Day pool for a Bet Of The Day qualifier…"
          : "No Bet Of The Day today — no Best Of The Day horse cleared all governance thresholds (score ≥ 62, field separation ≥ 4 pts, low/medium volatility)."}
      </p>
    </div>
  );
}

function BoardRow({ pick, rank }: { pick: ScoredPick; rank: number }) {
  return (
    <Link href={`/racecards/${pick.racecardId}`}>
      <div className="group flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer border-b border-border/15 last:border-0">
        <span className="text-xs font-bold font-mono text-muted-foreground/35 w-5 shrink-0 text-right">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm leading-tight">{pick.horseName}</span>
            {pick.odds && (
              <span className="text-[11px] font-mono font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                {pick.odds}
              </span>
            )}
            <ConfChip cls={pick.confidenceClass} />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground/80">{pick.venue}</span>
            <span className="text-muted-foreground/30 text-xs">·</span>
            <span className="text-xs font-mono text-muted-foreground/60">{pick.raceTime}</span>
            {pick.reason && (
              <>
                <span className="text-muted-foreground/25 text-xs hidden sm:inline">—</span>
                <span className="text-[11px] text-muted-foreground/50 hidden sm:inline truncate max-w-xs">{pick.reason}</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
      </div>
    </Link>
  );
}

function AvoidRow({ entry }: { entry: AvoidEntry }) {
  return (
    <Link href={`/racecards/${entry.racecardId}`}>
      <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors cursor-pointer border-b border-border/15 last:border-0">
        <Ban className="h-3.5 w-3.5 text-red-400/50 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold">{entry.venue}</span>
            <span className="text-muted-foreground/30 text-xs">·</span>
            <span className="text-xs font-mono text-muted-foreground/60">{entry.raceTime}</span>
            <span className="text-muted-foreground/25 text-xs">—</span>
            <span className="text-xs text-muted-foreground/60 truncate">{entry.raceName}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-semibold ${TIER_COLOR[entry.volatility.tier]}`}>
              {entry.volatility.label} · {entry.volatility.score}/100
            </span>
            <span className="text-[10px] text-muted-foreground/40">{entry.runnerCount} runners</span>
          </div>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
      </div>
    </Link>
  );
}

function BoardSection({
  icon, title, subtitle, accent, picks, maxRows = 8, emptyNote, scanning,
}: {
  icon: React.ReactNode; title: string; subtitle?: string; accent: string;
  picks: ScoredPick[]; maxRows?: number; emptyNote: string; scanning?: boolean;
}) {
  const display = picks.slice(0, maxRows);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="px-4 py-3 border-b border-border/30 bg-secondary/10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={accent}>{icon}</span>
            <CardTitle className="text-sm font-bold tracking-tight">{title}</CardTitle>
            {display.length > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${accent}`}
                style={{ opacity: 0.65 }}>
                {display.length}
              </span>
            )}
          </div>
          {subtitle && <span className="text-[10px] text-muted-foreground/50 hidden sm:block">{subtitle}</span>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {display.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <p className="text-xs text-muted-foreground/50">
              {scanning ? "Scanning races…" : emptyNote}
            </p>
          </div>
        ) : (
          display.map((p, i) => (
            <BoardRow key={`${p.racecardId}-${p.horseName}`} pick={p} rank={i + 1} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: summary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });

  const { data: todayRacecards, isLoading: loadingRacecards } = useListRacecards(
    { date: todayStr },
    { query: { queryKey: getListRacecardsQueryKey({ date: todayStr }), staleTime: 60_000 } }
  );

  const analysisQueries = useQueries({
    queries: (todayRacecards ?? []).map(r => ({
      queryKey: getGetRacecardAnalysisQueryKey(r.id),
      queryFn: async () => {
        const res = await fetch(`/api/racecards/${r.id}/analysis`);
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<{ runners: RunnerRow[] }>;
      },
      staleTime: 60_000,
      enabled: (todayRacecards?.length ?? 0) > 0,
    })),
  });

  const loadedCount   = analysisQueries.filter(q => q.isSuccess).length;
  const totalCount    = analysisQueries.length;
  const loadingAnalysis = analysisQueries.some(q => q.isLoading);

  const board: DayBoard = useMemo(() => {
    const empty: DayBoard = {
      betOfDay: null, bestOfDay: [], topRated: [], eachWayValue: [],
      replayUpgrades: [], hiddenValue: [], avoidRaces: [],
    };
    if (!todayRacecards) return empty;

    const allBodCandidates: ScoredPick[] = [];
    const allTopRated:      ScoredPick[] = [];
    const allEachWay:       ScoredPick[] = [];
    const allReplay:        ScoredPick[] = [];
    const allHidden:        ScoredPick[] = [];
    const allAvoid:         AvoidEntry[] = [];

    analysisQueries.forEach((q, i) => {
      const rc = todayRacecards[i];
      if (!q.data || !rc) return;
      const { bodCandidates, topRatedPicks, eachWayPicks, replayPicks, hiddenPicks, avoid }
        = buildRaceEntries(rc, q.data.runners);

      allBodCandidates.push(...bodCandidates);
      allTopRated.push(...topRatedPicks);
      allEachWay.push(...eachWayPicks);
      allReplay.push(...replayPicks);
      allHidden.push(...hiddenPicks);
      if (avoid) allAvoid.push(avoid);
    });

    // ── Elect a single Bet Of The Day from the Best Of The Day pool ──────────
    // Only best_of_day horses are eligible — Hidden Value / Replay / High Variance excluded
    const { winner: betOfDay, rest: remainingBod } = electBetOfDay(allBodCandidates);

    // Dedup helper
    const dedup = (arr: ScoredPick[]) => {
      const seen = new Set<string>();
      return arr.filter(p => {
        const key = `${p.racecardId}:${p.horseName}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
    };

    return {
      betOfDay,
      // Best Of The Day list = all remaining BOD horses after the winner is removed
      bestOfDay:      dedup(remainingBod.sort((a, b) => b.totalScore - a.totalScore)),
      // Top Rated = engine-classified top_rated_high_variance only
      topRated:       dedup(allTopRated.sort((a, b) => b.totalScore - a.totalScore)),
      eachWayValue:   dedup(allEachWay.sort((a, b) => b.categoryScore - a.categoryScore)),
      replayUpgrades: dedup(allReplay.sort((a, b) => b.categoryScore - a.categoryScore)),
      hiddenValue:    dedup(allHidden.sort((a, b) => b.categoryScore - a.categoryScore)),
      avoidRaces:     allAvoid.sort((a, b) => b.volatility.score - a.volatility.score),
    };
  }, [analysisQueries, todayRacecards]);

  const isBootstrapping = loadingRacecards || (totalCount > 0 && loadedCount === 0);
  const totalPicks = board.bestOfDay.length + board.topRated.length + board.eachWayValue.length
    + board.replayUpgrades.length + board.hiddenValue.length;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight mb-0.5">APEX Daily Betting Board</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>
        {totalCount > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 pt-1">
            {loadingAnalysis ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin text-primary/60" />
                <span className="text-xs text-muted-foreground/60">{loadedCount}/{totalCount} races</span></>
            ) : (
              <><Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-primary font-semibold">{loadedCount} races analysed</span></>
            )}
          </div>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Today's Races",   value: summary?.todayRaceCount ?? "—",                             accent: "" },
          { label: "Best Of The Day", value: board.bestOfDay.length    || (loadingAnalysis ? "…" : "0"), accent: "text-amber-400"  },
          { label: "EW Value",        value: board.eachWayValue.length  || (loadingAnalysis ? "…" : "0"), accent: "text-teal-400"   },
          { label: "Replay Picks",    value: board.replayUpgrades.length || (loadingAnalysis ? "…" : "0"), accent: "text-purple-400" },
          { label: "Avoid Today",     value: board.avoidRaces.length    || (loadingAnalysis ? "…" : "0"), accent: "text-red-400"    },
        ].map(s => (
          <div key={s.label} className="bg-secondary/30 rounded-lg px-3 py-2.5 text-center">
            <div className={`text-xl font-bold font-mono ${s.accent}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {isBootstrapping ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          <p className="text-sm text-muted-foreground">Loading today's races and computing picks…</p>
        </div>
      ) : totalCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
            <TrendingUp className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No racecards for today. Upload a racecard to get started.</p>
            <Link href="/upload">
              <span className="text-xs text-primary hover:underline">Upload racecards →</span>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">

          {/* ── BET OF THE DAY (hero — single elected horse) ──────────────── */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bet Of The Day</h2>
              <span className="text-[10px] text-muted-foreground/40">Single strongest qualifier — elected from Best Of The Day pool only</span>
            </div>
            {board.betOfDay
              ? <BetOfDayHero pick={board.betOfDay} />
              : <NoBetOfDay scanning={loadingAnalysis} />}
          </section>

          {/* ── BEST OF THE DAY (ranked list — all other qualifiers) ──────── */}
          <BoardSection
            icon={<Trophy className="h-4 w-4" />}
            title="Best Of The Day"
            subtitle="Controlled-confidence selections — strongest to weakest"
            accent="text-amber-400"
            picks={board.bestOfDay}
            maxRows={8}
            scanning={loadingAnalysis}
            emptyNote="No Best Of The Day qualifiers today."
          />

          {/* ── EACH WAY VALUE ────────────────────────────────────────────── */}
          <BoardSection
            icon={<Star className="h-4 w-4" />}
            title="Each Way Value Bets"
            subtitle="Hidden value profiles with each-way odds potential"
            accent="text-teal-400"
            picks={board.eachWayValue}
            maxRows={6}
            scanning={loadingAnalysis}
            emptyNote="No each-way value candidates today."
          />

          {/* ── REPLAY UPGRADES ───────────────────────────────────────────── */}
          <BoardSection
            icon={<Film className="h-4 w-4" />}
            title="Replay Upgrades"
            subtitle="Horses whose effort is better than form figures suggest"
            accent="text-purple-400"
            picks={board.replayUpgrades}
            maxRows={6}
            scanning={loadingAnalysis}
            emptyNote="No replay upgrade candidates today."
          />

          {/* ── HIDDEN VALUE ──────────────────────────────────────────────── */}
          <BoardSection
            icon={<Eye className="h-4 w-4" />}
            title="Hidden Value Horses"
            subtitle="Underestimated runners with market miss potential"
            accent="text-emerald-400"
            picks={board.hiddenValue}
            maxRows={6}
            scanning={loadingAnalysis}
            emptyNote="No hidden value candidates today."
          />

          {/* ── AVOID TODAY ───────────────────────────────────────────────── */}
          {board.avoidRaces.length > 0 && (
            <Card className="overflow-hidden border-red-500/20">
              <CardHeader className="px-4 py-3 border-b border-red-500/15 bg-red-500/5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Ban className="h-4 w-4 text-red-400/70" />
                    <CardTitle className="text-sm font-bold">Avoid Today</CardTitle>
                    <span className="text-[10px] font-bold text-red-400/60">{board.avoidRaces.length}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 hidden sm:block">
                    Extreme Volatility / No Bet races
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {board.avoidRaces.map(entry => (
                  <AvoidRow key={entry.racecardId} entry={entry} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 pb-2 border-t border-border/20">
            <span className="text-xs text-muted-foreground/40">
              {totalPicks} qualifying picks from {loadedCount} races · APEX engine · automatic
            </span>
            <Link href="/racecards">
              <span className="text-xs text-primary hover:underline flex items-center gap-1">
                All racecards <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          </div>

        </div>
      )}
    </div>
  );
}
