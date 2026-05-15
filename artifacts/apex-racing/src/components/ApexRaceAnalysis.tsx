import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Star, Eye, AlertTriangle, Film, TrendingUp } from "lucide-react";
import {
  runApexEngine,
  type ApexEngineResult,
  type RacecardInput,
  type RaceVolatilityResult,
  type VolatilityTier,
} from "@/lib/apexEngine";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { detectReplayTriggers, type DetectedTrigger } from "@/lib/replayTriggers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Runner {
  id: number;
  horseName: string;
  draw?: number | null;
  age?: string | null;
  form?: string | null;
  odds?: string | null;
  jockey?: string | null;
  trainer?: string | null;
  weight?: string | null;
  isNonRunner?: boolean;
  scratched?: boolean;
}

type Highlight = "top_rated" | "hidden_value_pick" | "dangerous_favourite" | "replay_trigger";

interface RankedEntry {
  runner: Runner;
  result: ApexEngineResult;
  rank: number;
  highlights: Highlight[];
  triggers: DetectedTrigger[];
}

interface Props {
  racecardInput: RacecardInput;
  runners: Runner[];
  raceVolatility: RaceVolatilityResult;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOddsDecimal(odds: string | null | undefined): number | null {
  if (!odds) return null;
  const s = odds.trim().toLowerCase();
  if (s === "evs" || s === "evens") return 2.0;
  const slash = s.indexOf("/");
  if (slash !== -1) {
    const num = parseFloat(s.slice(0, slash));
    const den = parseFloat(s.slice(slash + 1));
    if (!isNaN(num) && !isNaN(den) && den > 0) return num / den + 1;
  }
  const dec = parseFloat(s);
  if (!isNaN(dec)) return dec;
  return null;
}

const RANK_STYLE: Record<number, { outer: string; text: string; label: string }> = {
  1: { outer: "bg-amber-500/20 border-amber-500/40",  text: "text-amber-400",  label: "1st" },
  2: { outer: "bg-slate-500/15 border-slate-400/30",  text: "text-slate-300",  label: "2nd" },
  3: { outer: "bg-orange-700/15 border-orange-600/30", text: "text-orange-400", label: "3rd" },
};

const SCORE_COLOR = (s: number) =>
  s >= 72 ? "text-amber-400" : s >= 65 ? "text-blue-400" : s >= 55 ? "text-green-400" : s >= 45 ? "text-yellow-400" : "text-muted-foreground";

const SCORE_RING_COLOR = (s: number) =>
  s >= 72 ? "#f59e0b" : s >= 65 ? "#3b82f6" : s >= 55 ? "#22c55e" : s >= 45 ? "#eab308" : "#6b7280";

const TIER_ACCENT: Record<VolatilityTier, string> = {
  low: "text-green-400",
  medium: "text-amber-400",
  high: "text-orange-400",
  extreme: "text-red-400",
};

const CATS = [
  { key: "ability",            label: "Ability",             bar: "bg-amber-500" },
  { key: "paceFit",            label: "Pace Fit",            bar: "bg-blue-500" },
  { key: "tacticalResilience", label: "Tactical Resilience", bar: "bg-purple-500" },
  { key: "groundTrip",         label: "Ground / Trip",       bar: "bg-green-500" },
  { key: "replayIntelligence", label: "Replay Intelligence", bar: "bg-fuchsia-500" },
  { key: "hiddenValue",        label: "Hidden Value",        bar: "bg-emerald-500" },
  { key: "volatilityRisk",     label: "Volatility Risk",     bar: "bg-red-500", inverted: true },
] as const;

const HIGHLIGHT_CONFIG: Record<Highlight, { icon: React.ReactNode; label: string; style: string }> = {
  top_rated:           { icon: <Star className="h-3 w-3" />,          label: "Top Rated",          style: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  hidden_value_pick:   { icon: <Eye className="h-3 w-3" />,           label: "Hidden Value",        style: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10" },
  dangerous_favourite: { icon: <AlertTriangle className="h-3 w-3" />, label: "Dangerous Fav",      style: "text-red-400 border-red-400/40 bg-red-400/10" },
  replay_trigger:      { icon: <Film className="h-3 w-3" />,          label: "Replay Trigger",     style: "text-purple-400 border-purple-400/40 bg-purple-400/10" },
};

// ── Mini score ring ───────────────────────────────────────────────────────────

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = size * 0.37;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = SCORE_RING_COLOR(score);
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="absolute inset-0 -rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(220 25% 18%)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="font-mono font-bold text-sm leading-none" style={{ color }}>{score}</span>
    </div>
  );
}

// ── Category breakdown row ────────────────────────────────────────────────────

function CatBar({ label, score, note, bar, inverted }: { label: string; score: number; note: string; bar: string; inverted?: boolean }) {
  const display = inverted ? 100 - score : score;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground/80 w-36 shrink-0">{label}</span>
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${display}%` }} />
        </div>
        <span className="font-mono w-6 text-right text-muted-foreground shrink-0">{score}</span>
      </div>
      {note && <p className="text-[10px] text-muted-foreground/60 leading-snug pl-36">{note}</p>}
    </div>
  );
}

// ── Summary insight card ──────────────────────────────────────────────────────

function InsightCard({ icon, title, subtitle, accent }: { icon: React.ReactNode; title: string; subtitle: string; accent: string }) {
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-border/40 bg-secondary/20 min-w-0`}>
      <div className={`mt-0.5 shrink-0 ${accent}`}>{icon}</div>
      <div className="min-w-0">
        <div className={`text-xs font-semibold truncate ${accent}`}>{title}</div>
        <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 truncate">{subtitle}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ApexRaceAnalysis({ racecardInput, runners, raceVolatility }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const ranked: RankedEntry[] = useMemo(() => {
    const active = runners.filter(r => !r.isNonRunner && !r.scratched);
    if (active.length === 0) return [];

    const scored = active.map(runner => ({
      runner,
      result: runApexEngine(
        { horseName: runner.horseName, draw: runner.draw, age: runner.age, form: runner.form,
          odds: runner.odds, jockey: runner.jockey, trainer: runner.trainer, weight: runner.weight },
        racecardInput
      ),
      triggers: detectReplayTriggers({ form: runner.form, odds: runner.odds, age: runner.age }),
    }));

    scored.sort((a, b) => b.result.totalScore - a.result.totalScore);

    // Highlight candidates
    const bestHV = scored.reduce<typeof scored[0] | null>((best, cur) =>
      cur.result.hiddenValue.score > (best?.result.hiddenValue.score ?? -1) ? cur : best, null);

    const byOdds = scored
      .map(e => ({ e, dec: parseOddsDecimal(e.runner.odds) }))
      .filter(x => x.dec !== null)
      .sort((a, b) => a.dec! - b.dec!);
    const shortFav = byOdds[0]?.e;
    const favIsDangerous = shortFav && shortFav.result.volatilityRisk.score >= 50;

    return scored.map((entry, i) => {
      const highlights: Highlight[] = [];
      if (i === 0) highlights.push("top_rated");
      if (bestHV && entry.runner.id === bestHV.runner.id && entry.result.hiddenValue.score >= 60)
        highlights.push("hidden_value_pick");
      if (favIsDangerous && entry.runner.id === shortFav.runner.id)
        highlights.push("dangerous_favourite");
      if (entry.triggers.length > 0) highlights.push("replay_trigger");
      return { ...entry, rank: i + 1, highlights };
    });
  }, [runners, racecardInput]);

  if (ranked.length === 0) return null;

  const topPick  = ranked[0];
  const hvPick   = ranked.find(e => e.highlights.includes("hidden_value_pick"));
  const dangerFav = ranked.find(e => e.highlights.includes("dangerous_favourite"));
  const replayCount = ranked.filter(e => e.highlights.includes("replay_trigger")).length;

  return (
    <Card className="border-primary/20 bg-secondary/10" data-testid="apex-race-analysis">
      <CardHeader className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold tracking-tight">APEX Race Analysis</CardTitle>
            <span className="text-[10px] text-muted-foreground/60 font-mono">{ranked.length} runners ranked</span>
          </div>
          <span className={`text-[10px] font-semibold ${TIER_ACCENT[raceVolatility.tier]}`}>
            {raceVolatility.label} · {raceVolatility.score}/100
          </span>
        </div>
      </CardHeader>

      {/* ── Insight summary strip ── */}
      <div className="px-4 pb-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <InsightCard
          icon={<Star className="h-3.5 w-3.5" />}
          title={topPick.runner.horseName}
          subtitle={`#1 · ${topPick.result.totalScore} APEX · ${topPick.result.confidenceClass.replace(/_/g, " ")}`}
          accent="text-amber-400"
        />
        {hvPick && hvPick.runner.id !== topPick.runner.id && (
          <InsightCard
            icon={<Eye className="h-3.5 w-3.5" />}
            title={hvPick.runner.horseName}
            subtitle={`HV ${hvPick.result.hiddenValue.score} · Odds ${hvPick.runner.odds ?? "—"}`}
            accent="text-emerald-400"
          />
        )}
        {dangerFav && (
          <InsightCard
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            title={`Fav at Risk: ${dangerFav.runner.horseName}`}
            subtitle={`Odds ${dangerFav.runner.odds ?? "—"} · VRisk ${dangerFav.result.volatilityRisk.score}`}
            accent="text-red-400"
          />
        )}
        {replayCount > 0 && (
          <InsightCard
            icon={<Film className="h-3.5 w-3.5" />}
            title={`${replayCount} Replay Trigger${replayCount > 1 ? "s" : ""}`}
            subtitle={ranked.filter(e => e.highlights.includes("replay_trigger")).map(e => e.runner.horseName).join(", ")}
            accent="text-purple-400"
          />
        )}
      </div>

      {/* ── Ranked list ── */}
      <div className="border-t border-border/30 divide-y divide-border/20">
        {ranked.map(entry => {
          const { runner, result, rank, highlights, triggers } = entry;
          const rankS = RANK_STYLE[rank];
          const isExpanded = expandedId === runner.id;

          return (
            <div key={runner.id} data-testid={`apex-rank-row-${runner.id}`}>
              {/* ── Summary row ── */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors text-left"
                onClick={() => setExpandedId(isExpanded ? null : runner.id)}
                data-testid={`apex-rank-toggle-${runner.id}`}
              >
                {/* Rank badge */}
                <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${rankS ? rankS.outer : "bg-secondary/30 border-border/30"}`}>
                  <span className={`text-xs font-bold font-mono ${rankS ? rankS.text : "text-muted-foreground"}`}>
                    {rank}
                  </span>
                </div>

                {/* Horse info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm leading-tight truncate">{runner.horseName}</span>
                    {runner.odds && (
                      <span className="text-xs font-mono font-semibold text-primary shrink-0">{runner.odds}</span>
                    )}
                    <ConfidenceBadge confidenceClass={result.confidenceClass} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {runner.jockey && (
                      <span className="text-[11px] text-muted-foreground truncate">{runner.jockey}</span>
                    )}
                    {runner.form && (
                      <span className="text-[11px] font-mono text-muted-foreground/60">{runner.form}</span>
                    )}
                    {highlights.map(h => (
                      <span key={h}
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${HIGHLIGHT_CONFIG[h].style}`}>
                        {HIGHLIGHT_CONFIG[h].icon}
                        {HIGHLIGHT_CONFIG[h].label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Score ring + expand */}
                <div className="flex items-center gap-2 shrink-0">
                  <ScoreRing score={result.totalScore} size={48} />
                  {isExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              </button>

              {/* ── Expanded breakdown ── */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/20 bg-secondary/5">

                  {/* Classification note + governance */}
                  <div className="space-y-1.5">
                    {result.classificationNote && (
                      <p className={`text-xs px-2.5 py-1.5 rounded border-l-2 border-primary/40 bg-primary/5 ${SCORE_COLOR(result.totalScore)}`}>
                        <span className="font-semibold">{result.confidenceClass.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}: </span>
                        {result.classificationNote}
                      </p>
                    )}
                    {raceVolatility.blockedClasses.length > 0 && (
                      <p className={`text-[10px] px-2.5 py-1 rounded border-l-2 border-orange-500/30 bg-orange-500/5 text-orange-400/70`}>
                        {raceVolatility.governanceNote}
                      </p>
                    )}
                  </div>

                  {/* 7 category bars */}
                  <div className="space-y-2.5">
                    {CATS.map(cat => {
                      const breakdown = result[cat.key as keyof ApexEngineResult] as { score: number; note: string };
                      return (
                        <CatBar
                          key={cat.key}
                          label={cat.label}
                          score={breakdown.score}
                          note={breakdown.note}
                          bar={cat.bar}
                          inverted={"inverted" in cat ? cat.inverted : false}
                        />
                      );
                    })}
                  </div>

                  {/* Replay triggers */}
                  {triggers.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-purple-400/80 font-semibold uppercase tracking-wider">Replay Triggers Detected</div>
                      <div className="flex flex-wrap gap-1.5">
                        {triggers.map((t, i) => (
                          <div key={i}
                            className="text-[10px] px-2 py-1 rounded border border-purple-500/30 bg-purple-500/8 text-purple-300/80 flex items-center gap-1">
                            <Film className="h-2.5 w-2.5 shrink-0" />
                            <span className="font-semibold">{t.label}</span>
                            {t.reason && <span className="opacity-60">— {t.reason}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
