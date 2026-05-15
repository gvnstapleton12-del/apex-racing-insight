import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Racecards from "@/pages/Racecards";
import RacecardDetail from "@/pages/RacecardDetail";
import ScoreEditor from "@/pages/ScoreEditor";
import Horses from "@/pages/Horses";
import HorseProfile from "@/pages/HorseProfile";
import Calibration from "@/pages/Calibration";
import Upload from "@/pages/Upload";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/racecards" component={Racecards} />
        <Route path="/racecards/:id/score/:runnerId" component={ScoreEditor} />
        <Route path="/racecards/:id" component={RacecardDetail} />
        <Route path="/horses" component={Horses} />
        <Route path="/horses/:id" component={HorseProfile} />
        <Route path="/calibration" component={Calibration} />
        <Route path="/upload" component={Upload} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
