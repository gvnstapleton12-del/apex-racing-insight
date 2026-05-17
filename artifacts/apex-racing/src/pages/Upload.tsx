import { useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";

export default function Upload() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      XLSX.utils.book_new();

      const res = await fetch("/api/fetch/today", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, date }),
      });

      const text = await res.text();

      try {
        const data = JSON.parse(text);

        if (!res.ok) {
          setError(data.error || "Fetch failed");
        } else {
          setMessage(data.message || "Fetch successful");
        }
      } catch {
        setError(`Server returned non-JSON response: ${text.slice(0, 120)}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Upload Centre</h1>
        <p className="text-muted-foreground">Racecard import and API tools.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Fetch Today's Card
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <Input
            placeholder="API Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <Input
            type="password"
            placeholder="API Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <Button onClick={handleFetch} disabled={loading} className="w-full">
            {loading ? "Fetching..." : `Fetch ${date}`}
          </Button>

          {message && (
            <div className="flex items-center gap-2 rounded border border-green-500/30 bg-green-500/10 p-3 text-sm">
              <CheckCircle className="h-4 w-4 text-green-400" />
              {message}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
