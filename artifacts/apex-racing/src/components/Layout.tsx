import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart2,
  Flag,
  Home,
  Upload as UploadIcon,
  Crosshair,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/",            label: "Dashboard",  icon: Home },
  { href: "/racecards",   label: "Racecards",  icon: Flag },
  { href: "/horses",      label: "Horses",     icon: Crosshair },
  { href: "/calibration", label: "Calibration",icon: BarChart2 },
  { href: "/upload",      label: "Upload",     icon: UploadIcon },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <ul className="space-y-1 px-3">
      {navItems.map((item) => {
        const active =
          location === item.href ||
          (item.href !== "/" && location.startsWith(item.href));
        return (
          <li key={item.href}>
            <Link href={item.href} onClick={onNavigate}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors cursor-pointer ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
                data-testid={`nav-item-${item.label.toLowerCase()}`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                {item.label}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 border-r border-sidebar-border bg-sidebar shrink-0 flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <h1 className="text-lg font-bold tracking-tight text-primary">APEX Racing</h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <NavLinks />
        </nav>
      </aside>

      {/* ── Mobile slide-out drawer ──────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-72 max-w-[80vw] bg-sidebar border-r border-sidebar-border flex flex-col shadow-2xl">
            <div className="h-14 flex items-center justify-between px-5 border-b border-sidebar-border">
              <h1 className="text-base font-bold tracking-tight text-primary">APEX Racing</h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto py-4">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </nav>
          </aside>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden h-14 flex items-center gap-3 px-4 border-b border-border/50 bg-background shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-base font-bold tracking-tight text-primary">APEX Racing</span>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
