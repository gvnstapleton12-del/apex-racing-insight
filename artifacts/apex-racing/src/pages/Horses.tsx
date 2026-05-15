import { useState } from "react";
import { Link } from "wouter";
import {
  useListHorses, getListHorsesQueryKey,
  useCreateHorse,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Search, ChevronRight, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const createSchema = z.object({
  name: z.string().min(1),
  trainer: z.string().optional(),
  owner: z.string().optional(),
  age: z.string().optional(),
  sex: z.string().optional(),
  colour: z.string().optional(),
  sire: z.string().optional(),
  dam: z.string().optional(),
  preferredGoing: z.string().optional(),
  preferredDistance: z.string().optional(),
  volatilityRating: z.string().optional(),
});

type CreateForm = z.infer<typeof createSchema>;

const VOLATILITY_COLORS: Record<string, string> = {
  low: "text-green-400 border-green-400/30",
  medium: "text-amber-400 border-amber-400/30",
  high: "text-red-400 border-red-400/30",
};

export default function Horses() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: horses, isLoading } = useListHorses(
    search ? { search } : {},
    { query: { queryKey: getListHorsesQueryKey(search ? { search } : {}) } }
  );

  const createHorse = useCreateHorse();

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "", trainer: "", owner: "", age: "", sex: "", colour: "",
      sire: "", dam: "", preferredGoing: "", preferredDistance: "", volatilityRating: "",
    },
  });

  const onSubmit = (data: CreateForm) => {
    createHorse.mutate({
      data: {
        name: data.name,
        trainer: data.trainer || undefined,
        owner: data.owner || undefined,
        age: data.age ? parseInt(data.age, 10) : undefined,
        sex: data.sex || undefined,
        colour: data.colour || undefined,
        sire: data.sire || undefined,
        dam: data.dam || undefined,
        preferredGoing: data.preferredGoing || undefined,
        preferredDistance: data.preferredDistance || undefined,
        volatilityRating: data.volatilityRating || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Horse profile created" });
        queryClient.invalidateQueries({ queryKey: getListHorsesQueryKey() });
        setDialogOpen(false);
        form.reset();
      },
      onError: () => toast({ title: "Failed to create horse profile", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Horse Intelligence Library</h1>
          <p className="text-muted-foreground text-sm">Behavioural profiles, memory notes, and replay intelligence.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-horse">
              <Plus className="h-4 w-4" /> New Profile
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>New Horse Profile</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Horse Name</FormLabel><FormControl><Input data-testid="input-horse-name" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="trainer" render={({ field }) => (
                    <FormItem><FormLabel>Trainer</FormLabel><FormControl><Input data-testid="input-horse-trainer" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="owner" render={({ field }) => (
                    <FormItem><FormLabel>Owner</FormLabel><FormControl><Input data-testid="input-horse-owner" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="age" render={({ field }) => (
                    <FormItem><FormLabel>Age</FormLabel><FormControl><Input data-testid="input-horse-age" type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="sex" render={({ field }) => (
                    <FormItem><FormLabel>Sex</FormLabel><FormControl><Input data-testid="input-horse-sex" placeholder="Gelding / Mare / Colt" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="sire" render={({ field }) => (
                    <FormItem><FormLabel>Sire</FormLabel><FormControl><Input data-testid="input-horse-sire" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="dam" render={({ field }) => (
                    <FormItem><FormLabel>Dam</FormLabel><FormControl><Input data-testid="input-horse-dam" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="preferredGoing" render={({ field }) => (
                    <FormItem><FormLabel>Preferred Going</FormLabel><FormControl><Input data-testid="input-preferred-going" placeholder="Good to Soft" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="preferredDistance" render={({ field }) => (
                    <FormItem><FormLabel>Preferred Distance</FormLabel><FormControl><Input data-testid="input-preferred-distance" placeholder="2m-2m4f" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="volatilityRating" render={({ field }) => (
                  <FormItem><FormLabel>Volatility Rating</FormLabel><FormControl><Input data-testid="input-volatility-rating" placeholder="low / medium / high" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createHorse.isPending} data-testid="button-submit-horse">
                  {createHorse.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Create Profile
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-search-horses"
          className="pl-9"
          placeholder="Search by horse name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (horses ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <Target className="h-8 w-8 opacity-30" />
            <p className="text-sm">{search ? "No horses found matching your search." : "No horse profiles yet. Create your first above."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {(horses ?? []).map(horse => (
            <Card key={horse.id} className="group hover:border-primary/40 transition-colors" data-testid={`card-horse-${horse.id}`}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-sm bg-secondary flex items-center justify-center text-xs font-mono font-bold text-primary shrink-0">
                    {horse.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{horse.name}</span>
                      {horse.volatilityRating && (
                        <Badge variant="outline" className={`text-xs ${VOLATILITY_COLORS[horse.volatilityRating.toLowerCase()] ?? ""}`}>
                          {horse.volatilityRating} vol
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-0.5">
                      {horse.trainer && <span>{horse.trainer}</span>}
                      {horse.age && <span>{horse.age}yo</span>}
                      {horse.sex && <span>{horse.sex}</span>}
                      {horse.preferredGoing && <span>Pref: {horse.preferredGoing}</span>}
                      {horse.preferredDistance && <span>{horse.preferredDistance}</span>}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs font-mono text-muted-foreground">
                      {horse.totalRuns != null && <span>{horse.totalRuns} runs</span>}
                      {horse.wins != null && <span className="text-green-400">{horse.wins}W</span>}
                      {horse.places != null && <span className="text-amber-400">{horse.places}P</span>}
                    </div>
                  </div>
                </div>
                <Link href={`/horses/${horse.id}`}>
                  <Button variant="outline" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity gap-1" data-testid={`button-view-horse-${horse.id}`}>
                    Profile <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
