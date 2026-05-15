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
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Trophy, Eye, Film, Ban, ChevronRight, Zap, TrendingUp, Star } from "lucide-react";
import { runApexEngine, computeRaceVolatility, type RaceVolatilityResult, type VolatilityTier } from "@/lib/apexEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RacePick {
  racecardId: number;
  venue: string;
  raceTime: string;
  raceName: string;
  horseName: string;
  odds?: string | null;
  confidenceClass: string;
  reason: string;
  volatility: RaceVolatilityResult;
  noBetRace: boolean;
  runnerCount: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const todayStr = new Date().toISOString().slice(0, 10);

const TIER_COLOR: Record<VolatilityTier, string> = {
  low:     "text-green-400",
  medium:  "text-amber-400",
  high:    "text-orange-400",
  extreme: "text-red-400",
};

// ── Compute picks for a single race ──────────────────────────────────────────

function computeRacePicks(racecard: {
  id: number; venue: string; raceTime: string; raceName: string;
  distance?: string | null; going?: string | null; raceClass?: string | null;
  prize?: string | null; trackProfile?: string | null; marketContext?: string | null;
  trainerComments?: string | null; nonRunners?: string | null;
}, runners: Array<{
  id: number; horseName: string; draw?: number | null; age?: string | null;
  form?: string | null; odds?: string | null; jockey?: string | null;
  trainer?: string | null; weight?: string | null;
  isNonRunner?: boolean | null; scratched?: boolean | null;
}>): {
  topRated: RacePick;
  bestOfDay?: RacePick;
  hiddenValue?: RacePick;
  replayUpgrade?: RacePick;
  volatility: RaceVolatilityResult;
  noBetRace: boolean;
} | null {
  const active = runners.filter(r => !r.isNonRunner && !r.scratched);
  if (active.length === 0) return null;

  const racecardInput = {
    raceName: racecard.raceName,
    distance: racecard.distance ?? null,
    going: racecard.going ?? null,
    raceClass: racecard.raceClass ?? null,
    prize: racecard.prize ?? null,
    trackProfile: racecard.trackProfile ?? null,
    marketContext: racecard.marketContext ?? null,
    trainerComments: racecard.trainerComments ?? null,
    nonRunners: racecard.nonRunners ?? null,
    fieldSize: active.length,
  };

  const volatility = computeRaceVolatility(racecardInput);
  const allNoBet = volatility.tier === "extreme";

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

  const fieldAvg = scored.reduce((s, e) => s + e.result.totalScore, 0) / scored.length;

  const toRacePick = (entry: typeof scored[0], confidenceOverride?: string): RacePick => ({
    racecardId: racecard.id,
    venue: racecard.venue,
    raceTime: racecard.raceTime,
    raceName: racecard.raceName,
    horseName: entry.runner.horseName,
    odds: entry.runner.odds,
    confidenceClass: confidenceOverride ?? entry.result.confidenceClass,
    reason: entry.result.classificationNote || entry.result.ability.note,
    volatility,
    noBetRace: allNoBet || entry.result.confidenceClass === "no_bet",
    runnerCount: active.length,
  });

  const topRated    = toRacePick(scored[0]);
  const bodEntry    = scored.find(e => e.result.confidenceClass === "best_of_day");
  const hvEntry     = scored.find(e => e.result.confidenceClass === "hidden_value"
    || (e.result.hiddenValue.score >= 62 && e.result.confidenceClass !== "no_bet"));
  const replayEntry = scored.find(e => e.result.confidenceClass === "replay_upgrade");

  return {
    topRated,
    bestOfDay:    bodEntry    ? toRacePick(bodEntry, "best_of_day")     : undefined,
    hiddenValue:  hvEntry     ? toRacePick(hvEntry, "hidden_value")      : undefined,
    replayUpgrade:replayEntry ? toRacePick(replayEntry, "replay_upgrade") : undefined,
    volatility,
    noBetRace: allNoBet,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PickChip({ cls }: { cls: string }) {
  const map: Record<string, string> = {
    best_of_day:             "bg-amber-400/15 text-amber-300 border-amber-400/30",
    top_rated_high_variance: "bg-blue-400/15 text-blue-300 border-blue-400/30",
    hidden_value:            "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    replay_upgrade:          "bg-purple-400/15 text-purple-300 border-purple-400/30",
    no_bet:                  "bg-muted/20 text-muted-foreground border-border/30",
  };
  const label: Record<string, string> = {
    best_of_day: "Best Of Day", top_rated_high_variance: "High Variance",
    hidden_value: "Hidden Value", replay_upgrade: "Replay Upgrade", no_bet: "No Bet",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[cls] ?? map.no_bet}`}>
      {label[cls] ?? cls}
    </span>
  );
}

function BetOfDayCard({ pick }: { pick: RacePick }) {
  return (
    <Link href={`/racecards/${pick.racecardId}`}>
      <div className="group relative overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent p-5 cursor-pointer hover:border-amber-500/70 transition-all duration-200">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/5 rounded-full -translate-y-16 translate-x-16" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Bet Of The Day</span>
              <PickChip cls="best_of_day" />
            </div>
            <div className="text-2xl font-bold leading-tight text-foreground">{pick.horseName}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-primary">{pick.venue}</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm font-mono text-muted-foreground">{pick.raceTime}</span>
              {pick.odds && <span className="text-xs font-mono font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{pick.odds}</span>}
            </div>
            <p className="text-xs text-muted-foreground/70 leading-relaxed max-w-prose">{pick.reason}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-amber-400/40 group-hover:text-amber-400 transition-colors mt-1 shrink-0" />
        </div>
      </div>
    </Link>
  );
}

function PickCard({ pick, type }: { pick: RacePick; type: "value" | "replay" | "rated" }) {
  const config = {
    value:  { icon: <Eye className="h-3.5 w-3.5" />,   label: "Value Bet",       border: "border-emerald-500/35 hover:border-emerald-500/60", bg: "bg-emerald-500/5",  accent: "text-emerald-400",  cls: "hidden_value"   },
    replay: { icon: <Film className="h-3.5 w-3.5" />,   label: "Replay Upgrade",  border: "border-purple-500/35 hover:border-purple-500/60",  bg: "bg-purple-500/5",   accent: "text-purple-400",   cls: "replay_upgrade" },
    rated:  { icon: <Star className="h-3.5 w-3.5" />,   label: "Top Rated",       border: "border-blue-500/35 hover:border-blue-500/60",      bg: "bg-blue-500/5",     accent: "text-blue-400",     cls: "top_rated_high_variance" },
  }[type];

  return (
    <Link href={`/racecards/${pick.racecardId}`}>
      <div className={`group rounded-xl border p-4 cursor-pointer transition-all duration-200 h-full ${config.border} ${config.bg}`}>
        <div className="flex items-center gap-1.5 mb-3">
          <span className={config.accent}>{config.icon}</span>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${config.accent}`}>{config.label}</span>
        </div>
        <div className="font-bold text-lg leading-tight mb-1">{pick.horseName}</div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs font-semibold text-primary">{pick.venue}</span>
          <span className="text-muted-foreground text-xs">·</span>
          <span className="text-xs font-mono text-muted-foreground">{pick.raceTime}</span>
          {pick.odds && <span className="text-[11px] font-mono font-semibold text-primary">{pick.odds}</span>}
        </div>
        <p className="text-[11px] text-muted-foreground/60 leading-snug line-clamp-2">{pick.reason}</p>
        <div className="mt-2.5 flex items-center justify-between">
          <PickChip cls={config.cls} />
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>
    </Link>
  );
}

function AvoidRow({ pick }: { pick: RacePick }) {
  return (
    <Link href={`/racecards/${pick.racecardId}`}>
      <div className="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer">
        <div className="flex items-center gap-2.5 min-w-0">
          <Ban className="h-3.5 w-3.5 text-red-400/60 shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-medium">{pick.venue}</span>
            <span className="text-muted-foreground text-sm mx-1.5">·</span>
            <span className="text-sm font-mono text-muted-foreground">{pick.raceTime}</span>
            <span className="text-muted-foreground text-sm mx-1.5">—</span>
            <span className="text-xs text-muted-foreground/70 truncate">{pick.raceName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-semibold ${TIER_COLOR[pick.volatility.tier]}`}>
            {pick.volatility.label}
          </span>
          <span className="text-[10px] text-muted-foreground/40 font-mono">{pick.runnerCount}r</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors" />
        </div>
      </div>
    </Link>
  );
}

function EmptySlot({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/40 p-4 flex flex-col items-center justify-center gap-2 text-center min-h-[120px]">
      <span className="text-muted-foreground/30">{icon}</span>
      <span className="text-xs text-muted-foreground/40">{label}</span>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: summary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  const { data: todayRacecards, isLoading: loadingRacecards } = useListRacecards(
    { date: todayStr },
    { query: { queryKey: getListRacecardsQueryKey({ date: todayStr }), staleTime: 60_000 } }
  );

  // Parallel queries — one analysis per today's racecard
  const analysisQueries = useQueries({
    queries: (todayRacecards ?? []).map(r => ({
      queryKey: getGetRacecardAnalysisQueryKey(r.id),
      queryFn: async () => {
        const res = await fetch(`/api/racecards/${r.id}/analysis`);
        if (!res.ok) throw new Error("analysis failed");
        return res.json() as Promise<{
          racecard: typeof r;
          runners: Array<{
            id: number; horseName: string; draw?: number | null; age?: string | null;
            form?: string | null; odds?: string | null; jockey?: string | null;
            trainer?: string | null; weight?: string | null;
            isNonRunner?: boolean | null; scratched?: boolean | null;
          }>;
        }>;
      },
      staleTime: 60_000,
      enabled: (todayRacecards?.length ?? 0) > 0,
    })),
  });

  const loadingAnalysis = analysisQueries.some(q => q.isLoading);
  const loadedCount = analysisQueries.filter(q => q.isSuccess).length;
  const totalCount = analysisQueries.length;

  // Aggregate picks across all today's races
  const { betOfDay, valueBet, replayUpgrade, topRated, avoidRaces, hasAnyPick } = useMemo(() => {
    const allPicks: NonNullable<ReturnType<typeof computeRacePicks>>[] = [];

    analysisQueries.forEach((q, i) => {
      const rc = todayRacecards?.[i];
      if (!q.data || !rc) return;
      const picks = computeRacePicks(rc, q.data.runners);
      if (picks) allPicks.push(picks);
    });

    // Bet Of Day — best_of_day pick, sorted by totalScore proxy (first found, best race)
    const bodCandidates = allPicks
      .filter(p => p.bestOfDay && !p.noBetRace)
      .map(p => p.bestOfDay!);
    const betOfDay = bodCandidates[0] ?? null;

    // Value Bet — best hidden_value pick not in a no-bet race
    const hvCandidates = allPicks
      .filter(p => p.hiddenValue && !p.noBetRace)
      .map(p => p.hiddenValue!);
    const valueBet = hvCandidates[0] ?? null;

    // Replay Upgrade — best replay_upgrade pick
    const replayCandidates = allPicks
      .filter(p => p.replayUpgrade && !p.noBetRace)
      .map(p => p.replayUpgrade!);
    const replayUpgrade = replayCandidates[0] ?? null;

    // Top Rated — overall top-rated horse from any non-extreme race
    const ratedCandidates = allPicks
      .filter(p => !p.noBetRace && p.topRated.confidenceClass !== "no_bet")
      .map(p => p.topRated);
    // Pick one from a different race than BOD if possible
    const topRated = ratedCandidates.find(r =>
      !betOfDay || r.racecardId !== betOfDay.racecardId
    ) ?? ratedCandidates[0] ?? null;

    // Avoid — no-bet / extreme volatility races
    const avoidRaces = allPicks
      .filter(p => p.noBetRace)
      .map(p => p.topRated);

    const hasAnyPick = !!(betOfDay || valueBet || replayUpgrade || topRated);

    return { betOfDay, valueBet, replayUpgrade, topRated, avoidRaces, hasAnyPick };
  }, [analysisQueries, todayRacecards]);

  // Loading state
  const isBootstrapping = loadingRacecards || (totalCount > 0 && loadedCount === 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight mb-0.5">APEX Racing Analyst</h1>
          <p className="text-muted-foreground text-sm">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        {totalCount > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {loadingAnalysis ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/60" />
                <span className="text-xs text-muted-foreground/60">{loadedCount}/{totalCount} analysed</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-primary font-semibold">{loadedCount} races analysed</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Today's Races",  value: summary?.todayRaceCount ?? "—" },
          { label: "Total Runners",  value: summary?.totalRunners   ?? "—" },
          { label: "Horses on File", value: summary?.totalHorses    ?? "—" },
          { label: "Avoid Today",    value: avoidRaces.length || "—"       },
        ].map(s => (
          <div key={s.label} className="bg-secondary/30 rounded-lg px-3 py-2.5 text-center">
            <div className="text-lg font-bold font-mono">{s.value}</div>
            <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {isBootstrapping ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          <p className="text-sm text-muted-foreground">Analysing today's races…</p>
        </div>
      ) : !hasAnyPick && loadedCount > 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <TrendingUp className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No qualifying picks today — all races flagged as No Bet or Extreme Volatility.</p>
            <Link href="/racecards">
              <span className="text-xs text-primary hover:underline">View full racecards →</span>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── BET OF THE DAY ── */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Main Bet Of The Day</h2>
            </div>
            {betOfDay ? (
              <BetOfDayCard pick={betOfDay} />
            ) : (
              <div className="rounded-xl border border-dashed border-amber-500/20 bg-amber-500/5 p-5 text-center">
                <p className="text-sm text-muted-foreground/60">
                  {loadingAnalysis ? "Scanning races for Best Of Day pick…" : "No Best Of Day qualifier today — check back or review individual races."}
                </p>
              </div>
            )}
          </section>

          {/* ── TOP 3 PICKS ── */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Top APEX Picks Today</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {valueBet
                ? <PickCard pick={valueBet}    type="value"  />
                : <EmptySlot label="No Value Bet identified" icon={<Eye className="h-6 w-6" />} />}
              {replayUpgrade
                ? <PickCard pick={replayUpgrade} type="replay" />
                : <EmptySlot label="No Replay Upgrade today" icon={<Film className="h-6 w-6" />} />}
              {topRated
                ? <PickCard pick={topRated}    type="rated"  />
                : <EmptySlot label="No Top Rated pick available" icon={<Star className="h-6 w-6" />} />}
            </div>
          </section>

          {/* ── AVOID TODAY ── */}
          {avoidRaces.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-red-400/70" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Avoid Today</h2>
                <span className="text-[10px] text-muted-foreground/40">No Bet / Extreme Volatility</span>
              </div>
              <Card className="border-red-500/20 bg-red-500/3">
                <CardContent className="p-2 divide-y divide-border/20">
                  {avoidRaces.map(pick => (
                    <AvoidRow key={pick.racecardId} pick={pick} />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}
        </>
      )}

      {/* ── Footer link ── */}
      <div className="flex items-center justify-between pt-2 border-t border-border/20">
        <span className="text-xs text-muted-foreground/40">APEX engine · automatic from race data</span>
        <Link href="/racecards">
          <span className="text-xs text-primary hover:underline flex items-center gap-1">
            View all racecards <ChevronRight className="h-3 w-3" />
          </span>
        </Link>
      </div>
    </div>
  );
}
