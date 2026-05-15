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
  Loader2, Trophy, Eye, Ban, ChevronRight,
  Zap, Star, TrendingUp, ShieldOff,
} from "lucide-react";
import {
  runApexEngineForField, computeRaceVolatility,
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
  betOfDay:     ScoredPick | null;  // single elected horse — highest-scoring BOD only
  bestOfDay:    ScoredPick[];       // all other best_of_day qualifiers, ranked
  topRated:     ScoredPick[];       // top_rated_high_variance from engine
  eachWayValue: ScoredPick[];       // each_way_value from engine
  avoidRaces:   AvoidEntry[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const todayStr = new Date().toISOString().slice(0, 10);

// Day-level governance for the single Bet Of The Day election.
// Candidates must already be engine-classified as best_of_day (rank-1, low/med volatility).
// These thresholds then elect at most one horse from that pool.
const BOD_MIN_SCORE      = 68;   // relative score floor — deliberately high
const BOD_MIN_FIELD_EDGE = 6;    // must clearly lead field by this many pts
const BOD_ALLOWED_TIERS: VolatilityTier[] = ["low", "medium"];

const TIER_COLOR: Record<VolatilityTier, string> = {
  low: "text-green-400", medium: "text-amber-400",
  high: "text-orange-400", extreme: "text-red-400",
};

const CONF_STYLE: Record<string, { chip: string; label: string }> = {
  best_of_day:             { chip: "bg-amber-400/15 text-amber-300 border-amber-400/30",   label: "Best Of Day"  },
  top_rated_high_variance: { chip: "bg-blue-400/15 text-blue-300 border-blue-400/30",     label: "Top Rated"    },
  each_way_value:          { chip: "bg-teal-400/15 text-teal-300 border-teal-400/30",     label: "EW Value"     },
  no_bet:                  { chip: "bg-muted/20 text-muted-foreground/50 border-border/30", label: "No Bet"      },
};

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
  bodCandidates: ScoredPick[];
  topRatedPicks: ScoredPick[];
  eachWayPicks:  ScoredPick[];
  avoid?:        AvoidEntry;
} {
  const empty = { bodCandidates: [], topRatedPicks: [], eachWayPicks: [] };
  const active = runners.filter(r => !r.isNonRunner && !r.scratched);
  if (active.length === 0) return empty;

  const racecardInput = {
    raceName: rc.raceName, distance: rc.distance ?? null, going: rc.going ?? null,
    raceClass: rc.raceClass ?? null, prize: rc.prize ?? null,
    trackProfile: rc.trackProfile ?? null, marketContext: rc.marketContext ?? null,
    trainerComments: rc.trainerComments ?? null, nonRunners: rc.nonRunners ?? null,
    fieldSize: active.length,
  };

  // Pre-check race volatility to fast-path extreme races to avoid list
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

  // Field-first scoring: all runners scored, ranked, and classified together
  const runnerInputs = active.map(r => ({
    horseName: r.horseName, draw: r.draw, age: r.age, form: r.form,
    odds: r.odds, jockey: r.jockey, trainer: r.trainer, weight: r.weight,
  }));

  const fieldResults = runApexEngineForField(runnerInputs, racecardInput);

  const toPick = (fr: typeof fieldResults[0]): ScoredPick => ({
    racecardId: rc.id, venue: rc.venue, raceTime: rc.raceTime, raceName: rc.raceName,
    horseName: fr.runner.horseName, odds: fr.runner.odds,
    confidenceClass: fr.result.confidenceClass,
    reason: fr.result.classificationNote,
    totalScore: fr.relativeScore,
    categoryScore: fr.relativeScore,
    fieldEdge: fr.fieldEdge,
    volatilityTier: fr.result.raceVolatility.tier,
  });

  const bodCandidates = fieldResults
    .filter(fr => fr.result.confidenceClass === "best_of_day")
    .map(toPick);

  const topRatedPicks = fieldResults
    .filter(fr => fr.result.confidenceClass === "top_rated_high_variance")
    .map(toPick);

  const eachWayPicks = fieldResults
    .filter(fr => fr.result.confidenceClass === "each_way_value")
    .map(toPick);

  return { bodCandidates, topRatedPicks, eachWayPicks };
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
      betOfDay: null, bestOfDay: [], topRated: [], eachWayValue: [], avoidRaces: [],
    };
    if (!todayRacecards) return empty;

    const allBodCandidates: ScoredPick[] = [];
    const allTopRated:      ScoredPick[] = [];
    const allEachWay:       ScoredPick[] = [];
    const allAvoid:         AvoidEntry[] = [];

    analysisQueries.forEach((q, i) => {
      const rc = todayRacecards[i];
      if (!q.data || !rc) return;
      const { bodCandidates, topRatedPicks, eachWayPicks, avoid }
        = buildRaceEntries(rc, q.data.runners);

      allBodCandidates.push(...bodCandidates);
      allTopRated.push(...topRatedPicks);
      allEachWay.push(...eachWayPicks);
      if (avoid) allAvoid.push(avoid);
    });

    // Elect single Bet Of The Day from the Best Of The Day pool only
    const { winner: betOfDay, rest: remainingBod } = electBetOfDay(allBodCandidates);

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
      bestOfDay:    dedup(remainingBod.sort((a, b) => b.totalScore - a.totalScore)),
      topRated:     dedup(allTopRated.sort((a, b) => b.totalScore - a.totalScore)),
      eachWayValue: dedup(allEachWay.sort((a, b) => b.totalScore - a.totalScore)),
      avoidRaces:   allAvoid.sort((a, b) => b.volatility.score - a.volatility.score),
    };
  }, [analysisQueries, todayRacecards]);

  const isBootstrapping = loadingRacecards || (totalCount > 0 && loadedCount === 0);
  const totalPicks = board.bestOfDay.length + board.topRated.length + board.eachWayValue.length;

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
          { label: "Today's Races",   value: summary?.todayRaceCount ?? "—",                              accent: "" },
          { label: "Best Of The Day", value: board.bestOfDay.length    || (loadingAnalysis ? "…" : "0"),  accent: "text-amber-400"  },
          { label: "Top Rated",       value: board.topRated.length     || (loadingAnalysis ? "…" : "0"),  accent: "text-blue-400"   },
          { label: "EW Value",        value: board.eachWayValue.length  || (loadingAnalysis ? "…" : "0"), accent: "text-teal-400"   },
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

          {/* ── BEST OF THE DAY (ranked list — remaining qualifiers) ─────── */}
          <BoardSection
            icon={<Trophy className="h-4 w-4" />}
            title="Best Of The Day"
            subtitle="Strongest controlled-confidence selections — ranked by final APEX score"
            accent="text-amber-400"
            picks={board.bestOfDay}
            maxRows={8}
            scanning={loadingAnalysis}
            emptyNote="No Best Of The Day qualifiers today."
          />

          {/* ── TOP RATED ─────────────────────────────────────────────────── */}
          <BoardSection
            icon={<Star className="h-4 w-4" />}
            title="Top Rated"
            subtitle="High-scoring horses where race volatility limits top classification"
            accent="text-blue-400"
            picks={board.topRated}
            maxRows={8}
            scanning={loadingAnalysis}
            emptyNote="No Top Rated qualifiers today."
          />

          {/* ── EACH WAY VALUE ────────────────────────────────────────────── */}
          <BoardSection
            icon={<Eye className="h-4 w-4" />}
            title="Each Way Value"
            subtitle="Composite score + elevated hidden component + EW-friendly odds"
            accent="text-teal-400"
            picks={board.eachWayValue}
            maxRows={6}
            scanning={loadingAnalysis}
            emptyNote="No Each Way Value qualifiers today."
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
