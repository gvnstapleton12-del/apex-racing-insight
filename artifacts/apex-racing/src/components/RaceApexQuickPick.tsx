import { useMemo } from "react";
import {
  useGetRacecardAnalysis,
  getGetRacecardAnalysisQueryKey,
} from "@workspace/api-client-react";
import { runApexEngine, computeRaceVolatility, type VolatilityTier } from "@/lib/apexEngine";
import { Trophy, Star, Eye, Film, Ban, ShieldAlert, Loader2 } from "lucide-react";

interface Props {
  racecardId: number;
  raceName: string;
  distance?: string | null;
  going?: string | null;
  raceClass?: string | null;
  prize?: string | null;
  trackProfile?: string | null;
  marketContext?: string | null;
  trainerComments?: string | null;
  nonRunners?: string | null;
}

const TIER_CHIP: Record<VolatilityTier, string> = {
  low:     "text-green-400 bg-green-500/10 border-green-500/30",
  medium:  "text-amber-400 bg-amber-500/10 border-amber-500/30",
  high:    "text-orange-400 bg-orange-500/10 border-orange-500/30",
  extreme: "text-red-400   bg-red-500/10   border-red-500/30",
};

const CONF_CHIP: Record<string, string> = {
  best_of_day:             "text-amber-300 bg-amber-400/10 border-amber-400/25",
  top_rated_high_variance: "text-blue-300  bg-blue-400/10  border-blue-400/25",
  hidden_value:            "text-emerald-300 bg-emerald-400/10 border-emerald-400/25",
  replay_upgrade:          "text-purple-300 bg-purple-400/10 border-purple-400/25",
  no_bet:                  "text-muted-foreground bg-muted/20 border-border/30",
};

const CONF_LABEL: Record<string, string> = {
  best_of_day:             "Best Of Day",
  top_rated_high_variance: "High Variance",
  hidden_value:            "Hidden Value",
  replay_upgrade:          "Replay Upgrade",
  no_bet:                  "No Bet",
};

export function RaceApexQuickPick({
  racecardId,
  raceName,
  distance,
  going,
  raceClass,
  prize,
  trackProfile,
  marketContext,
  trainerComments,
  nonRunners,
}: Props) {
  const { data: analysis, isLoading } = useGetRacecardAnalysis(racecardId, {
    query: {
      queryKey: getGetRacecardAnalysisQueryKey(racecardId),
      staleTime: 60_000,
    },
  });

  const picks = useMemo(() => {
    if (!analysis) return null;
    const active = analysis.runners.filter(r => !r.isNonRunner && !r.scratched);
    if (active.length === 0) return null;

    const racecardInput = {
      raceName,
      distance: distance ?? null,
      going: going ?? null,
      raceClass: raceClass ?? null,
      prize: prize ?? null,
      trackProfile: trackProfile ?? null,
      marketContext: marketContext ?? null,
      trainerComments: trainerComments ?? null,
      nonRunners: nonRunners ?? null,
      fieldSize: active.length,
    };

    const volatility = computeRaceVolatility(racecardInput);

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
    const topRated = scored[0];
    const bestOfDay = scored.find(e => e.result.confidenceClass === "best_of_day");
    const hiddenValue = scored.find(e => e.result.confidenceClass === "hidden_value");
    const replayUpgrade = scored.find(e => e.result.confidenceClass === "replay_upgrade");
    const allNoBet = scored.every(e => e.result.confidenceClass === "no_bet");
    const noBetRace = allNoBet || volatility.tier === "extreme";
    const fieldEdge = Math.round(topRated.result.totalScore - fieldAvg);

    return { topRated, bestOfDay, hiddenValue, replayUpgrade, volatility, noBetRace, fieldEdge, count: active.length };
  }, [analysis, raceName, distance, going, raceClass, prize, trackProfile, marketContext, trainerComments, nonRunners]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
        <span className="text-[10px] text-muted-foreground/40">Analysing…</span>
      </div>
    );
  }

  if (!picks) {
    return (
      <div className="mt-1.5">
        <span className="text-[10px] text-muted-foreground/40">No runners — upload runners to generate picks</span>
      </div>
    );
  }

  const { topRated, bestOfDay, hiddenValue, replayUpgrade, volatility, noBetRace, fieldEdge, count } = picks;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {/* Volatility */}
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TIER_CHIP[volatility.tier]}`}>
        <ShieldAlert className="h-2.5 w-2.5 shrink-0" />
        {volatility.label}
      </span>

      {noBetRace ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border text-red-400 bg-red-500/10 border-red-500/30">
          <Ban className="h-2.5 w-2.5 shrink-0" />
          No Bet Race
        </span>
      ) : (
        <>
          {/* Top Rated */}
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border text-amber-400 bg-amber-400/10 border-amber-400/30">
            <Trophy className="h-2.5 w-2.5 shrink-0" />
            {topRated.runner.horseName}
            <span className="font-mono opacity-70">{topRated.result.totalScore}</span>
            {fieldEdge > 0 && <span className="text-green-400/70 font-mono">+{fieldEdge}</span>}
          </span>

          {/* Best Of Day (if different from top rated) */}
          {bestOfDay && bestOfDay.runner.id !== topRated.runner.id && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CONF_CHIP.best_of_day}`}>
              <Star className="h-2.5 w-2.5 shrink-0" />
              BOD: {bestOfDay.runner.horseName}
            </span>
          )}

          {/* Confidence class of top pick */}
          <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CONF_CHIP[topRated.result.confidenceClass] ?? CONF_CHIP.no_bet}`}>
            {CONF_LABEL[topRated.result.confidenceClass] ?? topRated.result.confidenceClass}
          </span>

          {/* Hidden Value */}
          {hiddenValue && (
            <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CONF_CHIP.hidden_value}`}>
              <Eye className="h-2.5 w-2.5 shrink-0" />
              HV: {hiddenValue.runner.horseName}
            </span>
          )}

          {/* Replay Upgrade */}
          {replayUpgrade && !hiddenValue && (
            <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CONF_CHIP.replay_upgrade}`}>
              <Film className="h-2.5 w-2.5 shrink-0" />
              Replay: {replayUpgrade.runner.horseName}
            </span>
          )}
        </>
      )}

      <span className="text-[10px] text-muted-foreground/40 font-mono">{count} runners</span>
    </div>
  );
}
