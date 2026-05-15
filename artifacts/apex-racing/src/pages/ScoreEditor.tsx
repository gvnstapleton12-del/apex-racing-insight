import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetRunner, getGetRunnerQueryKey,
  useGetRacecard, getGetRacecardQueryKey,
  useListScores, getListScoresQueryKey,
  useCreateScore, useUpdateScore,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Link } from "wouter";

const CATEGORIES = [
  { key: "abilityScore", label: "Ability", description: "Raw racing ability based on form, ratings, and class", color: "bg-amber-500" },
  { key: "paceFitScore", label: "Pace Fit", description: "How well the pace scenario suits this horse", color: "bg-blue-500" },
  { key: "tacticalResilienceScore", label: "Tactical Resilience", description: "Ability to handle adversity, traffic, and positional changes", color: "bg-purple-500" },
  { key: "groundTripScore", label: "Ground / Trip Suitability", description: "Proven suitability to today's conditions and distance", color: "bg-green-500" },
  { key: "replayIntelligenceScore", label: "Replay Intelligence", description: "Evidence from replay analysis showing latent performance", color: "bg-cyan-500" },
  { key: "hiddenValueScore", label: "Hidden Value", description: "Market underestimation, second-run bonus, first-time equipment", color: "bg-orange-500" },
  { key: "volatilityRisk", label: "Volatility Risk", description: "Behavioural risk and inconsistency (lower is better)", color: "bg-red-500" },
] as const;

const CONFIDENCE_CLASSES = [
  { value: "best_of_day", label: "Best Of Day" },
  { value: "top_rated_high_variance", label: "Top Rated / High Variance" },
  { value: "hidden_value", label: "Hidden Value" },
  { value: "replay_upgrade", label: "Replay Upgrade" },
  { value: "no_bet", label: "No Bet" },
];

function ScoreSlider({ label, description, value, onChange, color }: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold">{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="text-2xl font-mono font-bold text-primary w-12 text-right">{value}</div>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-6"
          data-testid={`slider-${label.toLowerCase().replace(/\s+/g, "-")}`}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function computeTotal(scores: Record<string, number>): number {
  const weighted =
    scores.abilityScore * 0.25 +
    scores.paceFitScore * 0.15 +
    scores.tacticalResilienceScore * 0.15 +
    scores.groundTripScore * 0.15 +
    scores.replayIntelligenceScore * 0.15 +
    scores.hiddenValueScore * 0.15 -
    scores.volatilityRisk * 0.1;
  return Math.max(0, Math.min(100, Math.round(weighted * 10) / 10));
}

export default function ScoreEditor() {
  const { id, runnerId } = useParams<{ id: string; runnerId: string }>();
  const racecardId = parseInt(id, 10);
  const runnerIdNum = parseInt(runnerId, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: runner, isLoading: runnerLoading } = useGetRunner(runnerIdNum, {
    query: { queryKey: getGetRunnerQueryKey(runnerIdNum) }
  });
  const { data: racecard, isLoading: racecardLoading } = useGetRacecard(racecardId, {
    query: { queryKey: getGetRacecardQueryKey(racecardId) }
  });
  const { data: scores } = useListScores(
    { runnerId: runnerIdNum },
    { query: { queryKey: getListScoresQueryKey({ runnerId: runnerIdNum }) } }
  );

  const existingScore = (scores ?? []).find(s => s.runnerId === runnerIdNum);

  const [vals, setVals] = useState({
    abilityScore: 50,
    paceFitScore: 50,
    tacticalResilienceScore: 50,
    groundTripScore: 50,
    replayIntelligenceScore: 50,
    hiddenValueScore: 50,
    volatilityRisk: 30,
  });
  const [confidenceClass, setConfidenceClass] = useState("no_bet");
  const [analystNotes, setAnalystNotes] = useState("");
  const [replayContext, setReplayContext] = useState("");
  const [contextualIntelligence, setContextualIntelligence] = useState("");
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (existingScore && !initialised) {
      setVals({
        abilityScore: existingScore.abilityScore,
        paceFitScore: existingScore.paceFitScore,
        tacticalResilienceScore: existingScore.tacticalResilienceScore,
        groundTripScore: existingScore.groundTripScore,
        replayIntelligenceScore: existingScore.replayIntelligenceScore,
        hiddenValueScore: existingScore.hiddenValueScore,
        volatilityRisk: existingScore.volatilityRisk,
      });
      setConfidenceClass(existingScore.confidenceClass);
      setAnalystNotes(existingScore.analystNotes ?? "");
      setReplayContext(existingScore.replayContext ?? "");
      setContextualIntelligence(existingScore.contextualIntelligence ?? "");
      setInitialised(true);
    }
  }, [existingScore, initialised]);

  const createScore = useCreateScore();
  const updateScore = useUpdateScore();

  const totalScore = computeTotal(vals);

  const save = () => {
    const payload = { ...vals, confidenceClass, analystNotes, replayContext, contextualIntelligence };
    if (existingScore) {
      updateScore.mutate({ id: existingScore.id, data: payload }, {
        onSuccess: () => {
          toast({ title: "APEX Score updated" });
          queryClient.invalidateQueries({ queryKey: getListScoresQueryKey({ runnerId: runnerIdNum }) });
          queryClient.invalidateQueries({ queryKey: getListScoresQueryKey({ racecardId }) });
          setLocation(`/racecards/${racecardId}`);
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      });
    } else {
      createScore.mutate({ data: { runnerId: runnerIdNum, racecardId, ...payload } }, {
        onSuccess: () => {
          toast({ title: "APEX Score saved" });
          queryClient.invalidateQueries({ queryKey: getListScoresQueryKey({ runnerId: runnerIdNum }) });
          queryClient.invalidateQueries({ queryKey: getListScoresQueryKey({ racecardId }) });
          setLocation(`/racecards/${racecardId}`);
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      });
    }
  };

  if (runnerLoading || racecardLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!runner || !racecard) {
    return <div className="text-muted-foreground text-center mt-10">Runner or racecard not found</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href={`/racecards/${racecardId}`}>
          <Button variant="ghost" size="sm" className="gap-1 -ml-2" data-testid="button-back-race">
            <ChevronLeft className="h-4 w-4" /> {racecard.venue}
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{runner.horseName}</h1>
          <div className="text-sm text-muted-foreground mt-0.5">
            {runner.jockey} · {runner.trainer} · {racecard.raceTime} {racecard.raceName}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">APEX Score</div>
          <div className="text-4xl font-mono font-bold text-primary">{totalScore}</div>
          <div className="mt-1">
            <ConfidenceBadge confidenceClass={confidenceClass} />
          </div>
        </div>
      </div>

      {/* Score Sliders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Predictor Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {CATEGORIES.map(cat => (
            <ScoreSlider
              key={cat.key}
              label={cat.label}
              description={cat.description}
              value={vals[cat.key]}
              onChange={v => setVals(prev => ({ ...prev, [cat.key]: v }))}
              color={cat.color}
            />
          ))}
        </CardContent>
      </Card>

      {/* Confidence Classification */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Confidence Classification</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={confidenceClass} onValueChange={setConfidenceClass}>
            <SelectTrigger data-testid="select-confidence-class">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONFIDENCE_CLASSES.map(c => (
                <SelectItem key={c.value} value={c.value} data-testid={`option-${c.value}`}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Intelligence Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Analyst Intelligence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm mb-1.5 block">Analyst Notes</Label>
            <Textarea
              data-testid="textarea-analyst-notes"
              placeholder="General analysis notes..."
              className="min-h-[80px]"
              value={analystNotes}
              onChange={e => setAnalystNotes(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Replay Context</Label>
            <Textarea
              data-testid="textarea-replay-context"
              placeholder="What did the replay show? Interference, pace scenario, hidden sections..."
              className="min-h-[80px]"
              value={replayContext}
              onChange={e => setReplayContext(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">Contextual Intelligence</Label>
            <Textarea
              data-testid="textarea-contextual-intelligence"
              placeholder="Track specialist behaviour, trainer context, market clues..."
              className="min-h-[80px]"
              value={contextualIntelligence}
              onChange={e => setContextualIntelligence(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full gap-2"
        onClick={save}
        disabled={createScore.isPending || updateScore.isPending}
        data-testid="button-save-score"
      >
        {(createScore.isPending || updateScore.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {existingScore ? "Update APEX Score" : "Save APEX Score"}
      </Button>
    </div>
  );
}
