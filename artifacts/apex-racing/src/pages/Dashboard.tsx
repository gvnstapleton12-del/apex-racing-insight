import React from "react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!summary) {
    return <div className="text-muted-foreground text-center mt-10">Failed to load dashboard</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Terminal Dashboard</h1>
        <p className="text-muted-foreground text-sm">System intelligence overview and daily context.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Racecards</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-racecards">{summary.totalRacecards}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Horses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-horses">{summary.totalHorses}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Runners</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-runners">{summary.totalRunners}</div>
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary-foreground/80">Today's Races</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-today">{summary.todayRaceCount || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Confidence Classification Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(summary.confidenceBreakdown || {}).map(([key, value]) => {
                // Convert camelCase to snake_case for the badge
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                return (
                  <div key={key} className="flex items-center justify-between">
                    <ConfidenceBadge confidenceClass={snakeKey} />
                    <span className="font-mono font-medium">{value}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Recent Races</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.recentRaces?.length ? (
              <div className="space-y-4">
                {summary.recentRaces.map((race) => (
                  <div key={race.id} className="flex justify-between items-center pb-4 border-b last:border-0 last:pb-0">
                    <div>
                      <div className="font-medium text-sm">{race.venue} <span className="text-muted-foreground ml-2">{race.raceTime}</span></div>
                      <div className="text-xs text-muted-foreground">{race.raceName} • {race.distance}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-8 text-center">No recent races found.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
