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
  Zap, Star, TrendingUp, ShieldAlert,
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
  betsOfDay:     ScoredPick[];
  eachWayValue:  ScoredPick[];
  replayUpgrades: ScoredPick[];
  hiddenValue:   ScoredPick[];
  avoidRaces:    AvoidEntry[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const todayStr = new Date().toISOString().slice(0, 10);

const TIER_COLOR: Record<VolatilityTier, string> = {
  low: "text-green-400", medium: "text-amber-400",
  high: "text-orange-400", extreme: "text-red-400",
};

const CONF_STYLE: Record<string, { chip: string; label: string }> = {
  best_of_day:             { chip: "bg-amber-400/15 text-amber-300 border-amber-400/30",     label: "Best Of Day"   },
  top_rated_high_variance: { chip: "bg-blue-400/15 text-blue-300 border-blue-400/30",        label: "High Variance" },
  hidden_value:            { chip: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30", label: "Hidden Value" },
  replay_upgrade:          { chip: "bg-purple-400/15 text-purple-300 border-purple-400/30",  label: "Replay Upgrade"},
  each_way_value:          { chip: "bg-teal-400/15 text-teal-300 border-teal-400/30",        label: "EW Value"      },
  no_bet:                  { chip: "bg-muted/20 text-muted-foreground/50 border-border/30",   label: "No Bet"        },
};

// ── Parse odds decimal ────────────────────────────────────────────────────────

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

// ── Compute board entries for one race ───────────────────────────────────────

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
  betsOfDay: ScoredPick[]; eachWayValue: ScoredPick[];
  replayUpgrades: ScoredPick[]; hiddenValue: ScoredPick[];
  avoid?: AvoidEntry;
} {
  const active = runners.filter(r => !r.isNonRunner && !r.scratched);
  const empty = { betsOfDay: [], eachWayValue: [], replayUpgrades: [], hiddenValue: [] };
  if (active.length === 0) return empty;

  const racecardInput = {
    raceName: rc.raceName,
    distance: rc.distance ?? null, going: rc.going ?? null,
    raceClass: rc.raceClass ?? null, prize: rc.prize ?? null,
    trackProfile: rc.trackProfile ?? null, marketContext: rc.marketContext ?? null,
    trainerComments: rc.trainerComments ?? null, nonRunners: rc.nonRunners ?? null,
    fieldSize: active.length,
  };

  const volatility = computeRaceVolatility(racecardInput);

  if (volatility.tier === "extreme") {
    return {
      ...empty,
      avoid: { racecardId: rc.id, venue: rc.venue, raceTime: rc.raceTime, raceName: rc.raceName, volatility, runnerCount: active.length },
    };
  }

  const scored = active.map(r => ({
    runner: r,
    result: runApexEngine(
      { horseName: r.horseName, draw: r.draw, age: r.age, form: r.form,
        odds: r.odds, jockey: r.jockey, trainer: r.trainer, weight: r.weight },
      racecardInput,
    ),
  })).sort((a, b) => b.result.totalScore - a.result.totalScore);

  const pick = (entry: typeof scored[0], confOverride?: string, catScore?: number): ScoredPick => ({
    racecardId: rc.id, venue: rc.venue, raceTime: rc.raceTime, raceName: rc.raceName,
    horseName: entry.runner.horseName, odds: entry.runner.odds,
    confidenceClass: confOverride ?? entry.result.confidenceClass,
    reason: entry.result.classificationNote || entry.result.ability.note,
    totalScore: entry.result.totalScore,
    categoryScore: catScore ?? entry.result.totalScore,
  });

  const betsOfDay = scored
    .filter(e => e.result.confidenceClass === "best_of_day")
    .map(e => pick(e));

  const replayUpgrades = scored
    .filter(e => e.result.confidenceClass === "replay_upgrade")
    .map(e => pick(e, undefined, e.result.replayIntelligence.score));

  const hiddenValue = scored
    .filter(e => e.result.hiddenValue.score >= 60 && e.result.confidenceClass !== "no_bet")
    .sort((a, b) => b.result.hiddenValue.score - a.result.hiddenValue.score)
    .map(e => pick(e, "hidden_value", e.result.hiddenValue.score));

  // Each-way: HV score ≥ 58, odds ≥ 3.0 decimal (2/1+), not odds-on, field ≥ 5
  const eachWayValue = active.length >= 5
    ? scored
        .filter(e => {
          const dec = parseOddsDecimal(e.runner.odds);
          return e.result.hiddenValue.score >= 58
            && e.result.confidenceClass !== "no_bet"
            && (dec === null || dec >= 3.0);
        })
        .sort((a, b) => b.result.hiddenValue.score - a.result.hiddenValue.score)
        .map(e => pick(e, "each_way_value", e.result.hiddenValue.score))
    : [];

  return { betsOfDay, eachWayValue, replayUpgrades, hiddenValue };
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

function BoardRow({ pick, rank }: { pick: ScoredPick; rank: number }) {
  return (
    <Link href={`/racecards/${pick.racecardId}`}>
      <div className="group flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer border-b border-border/15 last:border-0">
        {/* Rank */}
        <span className="text-xs font-bold font-mono text-muted-foreground/40 w-5 shrink-0 text-right">
          {rank}
        </span>

        {/* Horse + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm leading-tight">{pick.horseName}</span>
            {pick.odds && (
              <span className="text-[11px] font-mono font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{pick.odds}</span>
            )}
            <ConfChip cls={pick.confidenceClass} />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground/80">{pick.venue}</span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="text-xs font-mono text-muted-foreground/60">{pick.raceTime}</span>
            {pick.reason && (
              <>
                <span className="text-muted-foreground/30 text-xs hidden sm:inline">—</span>
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
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="text-xs font-mono text-muted-foreground/70">{entry.raceTime}</span>
            <span className="text-muted-foreground/40 text-xs">—</span>
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
  icon, title, subtitle, accent, picks, maxRows = 8, emptyNote,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  accent: string;
  picks: ScoredPick[];
  maxRows?: number;
  emptyNote: string;
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
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-current/10 ${accent}`} style={{ backgroundColor: "transparent", border: "1px solid currentColor", opacity: 0.7 }}>
                {display.length}
              </span>
            )}
          </div>
          {subtitle && <span className="text-[10px] text-muted-foreground/50">{subtitle}</span>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {display.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <p className="text-xs text-muted-foreground/50">{emptyNote}</p>
          </div>
        ) : (
          display.map((p, i) => <BoardRow key={`${p.racecardId}-${p.horseName}`} pick={p} rank={i + 1} />)
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

  const loadedCount = analysisQueries.filter(q => q.isSuccess).length;
  const totalCount = analysisQueries.length;
  const loadingAnalysis = analysisQueries.some(q => q.isLoading);

  const board: DayBoard = useMemo(() => {
    const out: DayBoard = { betsOfDay: [], eachWayValue: [], replayUpgrades: [], hiddenValue: [], avoidRaces: [] };
    if (!todayRacecards) return out;

    analysisQueries.forEach((q, i) => {
      const rc = todayRacecards[i];
      if (!q.data || !rc) return;
      const { betsOfDay, eachWayValue, replayUpgrades, hiddenValue, avoid } = buildRaceEntries(rc, q.data.runners);
      out.betsOfDay.push(...betsOfDay);
      out.eachWayValue.push(...eachWayValue);
      out.replayUpgrades.push(...replayUpgrades);
      out.hiddenValue.push(...hiddenValue);
      if (avoid) out.avoidRaces.push(avoid);
    });

    // Sort each list strongest → weakest
    const byScore = (a: ScoredPick, b: ScoredPick) => b.totalScore - a.totalScore;
    const byCatScore = (a: ScoredPick, b: ScoredPick) => b.categoryScore - a.categoryScore;

    out.betsOfDay.sort(byScore);
    out.eachWayValue.sort(byCatScore);
    out.replayUpgrades.sort(byCatScore);
    out.hiddenValue.sort(byCatScore);
    out.avoidRaces.sort((a, b) => b.volatility.score - a.volatility.score);

    // Deduplicate: one horse can appear in multiple categories but only once per category per racecard
    const dedup = (arr: ScoredPick[]) => {
      const seen = new Set<string>();
      return arr.filter(p => {
        const key = `${p.racecardId}:${p.horseName}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    out.betsOfDay    = dedup(out.betsOfDay);
    out.eachWayValue = dedup(out.eachWayValue);
    out.replayUpgrades = dedup(out.replayUpgrades);
    out.hiddenValue  = dedup(out.hiddenValue);

    return out;
  }, [analysisQueries, todayRacecards]);

  const isBootstrapping = loadingRacecards || (totalCount > 0 && loadedCount === 0);
  const totalPicks = board.betsOfDay.length + board.eachWayValue.length + board.replayUpgrades.length + board.hiddenValue.length;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight mb-0.5">APEX Daily Betting Board</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 pt-1">
          {loadingAnalysis ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/60" />
              <span className="text-xs text-muted-foreground/60">{loadedCount}/{totalCount} races</span>
            </>
          ) : totalCount > 0 ? (
            <>
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-primary font-semibold">{loadedCount} races analysed</span>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Today's Races",  value: summary?.todayRaceCount ?? "—",  accent: "" },
          { label: "Bets Of Day",    value: board.betsOfDay.length   || (loadingAnalysis ? "…" : "0"), accent: "text-amber-400" },
          { label: "EW Value",       value: board.eachWayValue.length || (loadingAnalysis ? "…" : "0"), accent: "text-teal-400"   },
          { label: "Replay Picks",   value: board.replayUpgrades.length || (loadingAnalysis ? "…" : "0"), accent: "text-purple-400" },
          { label: "Avoid Today",    value: board.avoidRaces.length   || (loadingAnalysis ? "…" : "0"), accent: "text-red-400"    },
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

          {/* 1 ── BETS OF THE DAY */}
          <BoardSection
            icon={<Trophy className="h-4 w-4" />}
            title="Bets Of The Day"
            subtitle="Best Of Day classifications — strongest to weakest"
            accent="text-amber-400"
            picks={board.betsOfDay}
            maxRows={5}
            emptyNote={loadingAnalysis ? "Scanning races…" : "No Best Of Day qualifiers today — race volatility may be blocking this tier."}
          />

          {/* 2 ── EACH WAY VALUE BETS */}
          <BoardSection
            icon={<Star className="h-4 w-4" />}
            title="Each Way Value Bets"
            subtitle="Hidden value profiles with each-way odds potential"
            accent="text-teal-400"
            picks={board.eachWayValue}
            maxRows={6}
            emptyNote={loadingAnalysis ? "Scanning races…" : "No each-way value candidates identified today."}
          />

          {/* 3 ── REPLAY UPGRADES */}
          <BoardSection
            icon={<Film className="h-4 w-4" />}
            title="Replay Upgrades"
            subtitle="Horses whose effort is better than form figures suggest"
            accent="text-purple-400"
            picks={board.replayUpgrades}
            maxRows={6}
            emptyNote={loadingAnalysis ? "Scanning races…" : "No replay upgrade candidates today."}
          />

          {/* 4 ── HIDDEN VALUE */}
          <BoardSection
            icon={<Eye className="h-4 w-4" />}
            title="Hidden Value Horses"
            subtitle="Underestimated runners with market miss potential"
            accent="text-emerald-400"
            picks={board.hiddenValue}
            maxRows={6}
            emptyNote={loadingAnalysis ? "Scanning races…" : "No hidden value candidates identified today."}
          />

          {/* 5 ── AVOID TODAY */}
          {board.avoidRaces.length > 0 && (
            <Card className="overflow-hidden border-red-500/20">
              <CardHeader className="px-4 py-3 border-b border-red-500/15 bg-red-500/5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Ban className="h-4 w-4 text-red-400/70" />
                    <CardTitle className="text-sm font-bold tracking-tight">Avoid Today</CardTitle>
                    <span className="text-[10px] font-bold text-red-400/60">{board.avoidRaces.length}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/50">Extreme Volatility / No Bet races</span>
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
            <div className="text-xs text-muted-foreground/40">
              {totalPicks} qualifying picks from {loadedCount} races · APEX engine · automatic
            </div>
            <Link href="/racecards">
              <span className="text-xs text-primary hover:underline flex items-center gap-1">
                View all racecards <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
