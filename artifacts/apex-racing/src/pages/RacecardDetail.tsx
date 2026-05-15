import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetRacecardAnalysis, getGetRacecardAnalysisQueryKey,
  useUpdateRacecard,
  useCreateRunner, useUpdateRunner, useDeleteRunner,
  useListScores, getListScoresQueryKey,
  useCreateScore,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2, ChevronLeft, Edit2, Save, X, Youtube } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

const runnerSchema = z.object({
  horseName: z.string().min(1),
  jockey: z.string().min(1),
  trainer: z.string().min(1),
  weight: z.string().min(1),
  draw: z.string().optional(),
  age: z.string().optional(),
  form: z.string().optional(),
  odds: z.string().optional(),
});

type RunnerForm = z.infer<typeof runnerSchema>;

function ApexScoreBar({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold">{value}</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${colorClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function RacecardDetail() {
  const { id } = useParams<{ id: string }>();
  const racecardId = parseInt(id, 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [runnerDialog, setRunnerDialog] = useState(false);

  const { data: analysis, isLoading } = useGetRacecardAnalysis(racecardId, {
    query: { queryKey: getGetRacecardAnalysisQueryKey(racecardId) }
  });

  const updateRacecard = useUpdateRacecard();
  const createRunner = useCreateRunner();
  const deleteRunner = useDeleteRunner();
  const createScore = useCreateScore();

  const { data: scores } = useListScores(
    { racecardId },
    { query: { queryKey: getListScoresQueryKey({ racecardId }) } }
  );

  const form = useForm<RunnerForm>({
    resolver: zodResolver(runnerSchema),
    defaultValues: { horseName: "", jockey: "", trainer: "", weight: "", draw: "", age: "", form: "", odds: "" },
  });

  const startEdit = (field: string, value: string | null) => {
    setEditField(field);
    setEditValue(value ?? "");
  };

  const saveEdit = () => {
    if (!editField || !analysis) return;
    updateRacecard.mutate(
      { id: racecardId, data: { [editField]: editValue } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRacecardAnalysisQueryKey(racecardId) });
          setEditField(null);
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  const addRunner = (data: RunnerForm) => {
    createRunner.mutate({
      data: {
        racecardId,
        horseName: data.horseName,
        jockey: data.jockey,
        trainer: data.trainer,
        weight: data.weight,
        draw: data.draw ? parseInt(data.draw, 10) : undefined,
        age: data.age || undefined,
        form: data.form || undefined,
        odds: data.odds || undefined,
        isNonRunner: false,
        scratched: false,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Runner added" });
        queryClient.invalidateQueries({ queryKey: getGetRacecardAnalysisQueryKey(racecardId) });
        setRunnerDialog(false);
        form.reset();
      },
      onError: () => toast({ title: "Failed to add runner", variant: "destructive" }),
    });
  };

  const removeRunner = (runnerId: number) => {
    deleteRunner.mutate({ id: runnerId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetRacecardAnalysisQueryKey(racecardId) });
      },
    });
  };

  const getScoreForRunner = (runnerId: number) => {
    return (scores ?? []).find(s => s.runnerId === runnerId);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!analysis) {
    return <div className="text-muted-foreground text-center mt-10">Race not found</div>;
  }

  const { racecard, runners } = analysis;

  const EditableField = ({ field, value, multiline = false }: { field: string; value: string | null; multiline?: boolean }) => {
    if (editField === field) {
      return (
        <div className="flex items-start gap-2">
          {multiline ? (
            <Textarea
              data-testid={`input-edit-${field}`}
              className="text-sm min-h-[80px]"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              autoFocus
            />
          ) : (
            <Input
              data-testid={`input-edit-${field}`}
              className="text-sm h-8"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              autoFocus
            />
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-primary shrink-0" onClick={saveEdit} data-testid={`button-save-${field}`}>
            <Save className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditField(null)} data-testid={`button-cancel-${field}`}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    }
    return (
      <div
        className="flex items-start gap-2 group/edit cursor-pointer"
        onClick={() => startEdit(field, value)}
        data-testid={`field-${field}`}
      >
        <span className={value ? "text-sm" : "text-sm text-muted-foreground/50 italic"}>
          {value || "Click to add..."}
        </span>
        <Edit2 className="h-3 w-3 opacity-0 group-hover/edit:opacity-100 transition-opacity text-muted-foreground mt-0.5 shrink-0" />
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <Link href="/racecards">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2" data-testid="button-back-racecards">
            <ChevronLeft className="h-4 w-4" /> Racecards
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{racecard.venue}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-lg font-mono text-primary font-semibold">{racecard.raceTime}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground text-sm">{racecard.raceName}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className="text-xs">{racecard.raceDate}</Badge>
            <Badge variant="outline" className="text-xs">{racecard.distance}</Badge>
            <Badge variant="outline" className="text-xs">{racecard.going}</Badge>
            <Badge variant="outline" className="text-xs">{racecard.raceClass}</Badge>
            {racecard.prize && <Badge variant="outline" className="text-xs">{racecard.prize}</Badge>}
          </div>
        </div>
        {analysis.topPick && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="px-4 py-3">
              <div className="text-xs text-primary font-semibold tracking-widest uppercase mb-1">Top Pick</div>
              <div className="font-bold">{analysis.topPick.horseName}</div>
              <div className="text-xs text-muted-foreground">{analysis.topPick.jockey} · {analysis.topPick.trainer}</div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Contextual Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { label: "Track Profile", field: "trackProfile", value: racecard.trackProfile },
          { label: "Market Context", field: "marketContext", value: racecard.marketContext },
          { label: "Trainer Comments", field: "trainerComments", value: racecard.trainerComments },
          { label: "Non-Runners", field: "nonRunners", value: racecard.nonRunners },
        ].map(({ label, field, value }) => (
          <Card key={field} className="group">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">{label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <EditableField field={field} value={value ?? null} multiline />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calibration Note */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">Calibration Note</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <EditableField field="calibrationNote" value={racecard.calibrationNote ?? null} multiline />
        </CardContent>
      </Card>

      {/* Runners */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Runners ({runners.length})</h2>
        <Dialog open={runnerDialog} onOpenChange={setRunnerDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2" data-testid="button-add-runner">
              <Plus className="h-3.5 w-3.5" /> Add Runner
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Runner</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(addRunner)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="horseName" render={({ field }) => (
                    <FormItem><FormLabel>Horse</FormLabel><FormControl><Input data-testid="input-horseName" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="jockey" render={({ field }) => (
                    <FormItem><FormLabel>Jockey</FormLabel><FormControl><Input data-testid="input-jockey" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="trainer" render={({ field }) => (
                    <FormItem><FormLabel>Trainer</FormLabel><FormControl><Input data-testid="input-trainer" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="weight" render={({ field }) => (
                    <FormItem><FormLabel>Weight</FormLabel><FormControl><Input data-testid="input-weight" placeholder="11-10" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="draw" render={({ field }) => (
                    <FormItem><FormLabel>Draw</FormLabel><FormControl><Input data-testid="input-draw" type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="age" render={({ field }) => (
                    <FormItem><FormLabel>Age</FormLabel><FormControl><Input data-testid="input-age" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="form" render={({ field }) => (
                    <FormItem><FormLabel>Form</FormLabel><FormControl><Input data-testid="input-form" placeholder="1-2-1-3" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="odds" render={({ field }) => (
                    <FormItem><FormLabel>Odds</FormLabel><FormControl><Input data-testid="input-odds" placeholder="5/2" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <Button type="submit" className="w-full" disabled={createRunner.isPending} data-testid="button-submit-runner">
                  {createRunner.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Add Runner
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {runners.length === 0 ? (
          <Card><CardContent className="flex items-center justify-center h-20 text-muted-foreground text-sm">No runners yet.</CardContent></Card>
        ) : (
          runners.map(runner => {
            const score = getScoreForRunner(runner.id);
            return (
              <Card key={runner.id} className={`group transition-colors ${runner.isNonRunner || runner.scratched ? "opacity-50" : ""}`} data-testid={`card-runner-${runner.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      {runner.draw && (
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-primary shrink-0">
                          {runner.draw}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{runner.horseName}</span>
                          {runner.odds && <span className="text-sm font-mono text-primary">{runner.odds}</span>}
                          {runner.isNonRunner && <Badge variant="outline" className="text-xs text-orange-400 border-orange-400/30">NR</Badge>}
                          {runner.scratched && <Badge variant="outline" className="text-xs text-red-400 border-red-400/30">Scratched</Badge>}
                          {score && <ConfidenceBadge confidenceClass={score.confidenceClass} />}
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                          <span>{runner.jockey}</span>
                          <span>·</span>
                          <span>{runner.trainer}</span>
                          {runner.weight && <><span>·</span><span>{runner.weight}</span></>}
                          {runner.age && <><span>·</span><span>{runner.age}yo</span></>}
                          {runner.form && <><span>·</span><span className="font-mono">{runner.form}</span></>}
                        </div>
                        {score && (
                          <div className="mt-3 w-64 space-y-1">
                            <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between">
                              <span>APEX Score</span>
                              <span className="font-mono font-bold text-primary">{score.totalScore}</span>
                            </div>
                            <ApexScoreBar label="Ability" value={score.abilityScore} colorClass="bg-amber-500" />
                            <ApexScoreBar label="Pace Fit" value={score.paceFitScore} colorClass="bg-blue-500" />
                            <ApexScoreBar label="Tactical Resilience" value={score.tacticalResilienceScore} colorClass="bg-purple-500" />
                            <ApexScoreBar label="Ground/Trip" value={score.groundTripScore} colorClass="bg-green-500" />
                            <ApexScoreBar label="Replay Intelligence" value={score.replayIntelligenceScore} colorClass="bg-cyan-500" />
                            <ApexScoreBar label="Hidden Value" value={score.hiddenValueScore} colorClass="bg-orange-500" />
                            <ApexScoreBar label="Volatility Risk" value={score.volatilityRisk} colorClass="bg-red-500" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(runner.horseName + " horse racing")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Watch ${runner.horseName} on YouTube`}
                      >
                        <Button size="icon" variant="outline" className="h-8 w-8 text-red-500 border-red-500/30 hover:bg-red-500/10">
                          <Youtube className="h-4 w-4" />
                        </Button>
                      </a>
                      <Link href={`/racecards/${racecardId}/score/${runner.id}`}>
                        <Button size="sm" variant="outline" className="h-8 text-xs px-2.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" data-testid={`button-score-runner-${runner.id}`}>
                          APEX
                        </Button>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        onClick={() => removeRunner(runner.id)}
                        data-testid={`button-delete-runner-${runner.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
