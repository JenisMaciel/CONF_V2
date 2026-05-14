import { useState } from "react";
import { NavLink, useLocation, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { Button } from "@/components/ui/button";
import {
  PackageCheck, ScanBarcode, AlertTriangle,
  Settings, LogOut, Menu, X, PackageOpen, Archive, ListOrdered, BarChart3,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  to: string;
  label: string;
  icon: typeof PackageCheck;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/app", label: "Recebimento", icon: PackageOpen },
  { to: "/app/workflow", label: "Workflow", icon: ListOrdered },
  { to: "/app/conferencia", label: "Processo em Conferência", icon: ScanBarcode },
  { to: "/app/divergencias", label: "Gestão de Divergência", icon: AlertTriangle, adminOnly: true },
  { to: "/app/processos-conferidos", label: "Processos Conferidos", icon: Archive, adminOnly: true },
  { to: "/app/visao-detalhada", label: "Visão Detalhada", icon: BarChart3, adminOnly: true },
  { to: "/app/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
];

export default function AppLayout() {
  const { user, loading, isAdmin, signOut } = useAuth();
  const { settings } = useAppSettings();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "1";
  });

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const v = !c;
      try { localStorage.setItem("sidebar-collapsed", v ? "1" : "0"); } catch {}
      return v;
    });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  const items = NAV.filter((i) => !i.adminOnly || isAdmin);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="min-h-screen flex bg-background">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed lg:static inset-y-0 left-0 z-40 bg-sidebar border-r border-sidebar-border flex flex-col transition-[width,transform] duration-200",
            collapsed ? "w-16" : "w-64",
            open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className={cn("flex items-center border-b border-sidebar-border", collapsed ? "justify-center p-3" : "gap-3 p-5")}>
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className={cn("rounded-lg object-contain bg-sidebar-accent shrink-0", collapsed ? "h-8 w-8" : "h-10 w-10")} />
            ) : (
              <div className={cn("rounded-lg gradient-primary flex items-center justify-center shrink-0", collapsed ? "h-8 w-8" : "h-10 w-10")}>
                <PackageCheck className={cn("text-primary-foreground", collapsed ? "h-4 w-4" : "h-5 w-5")} />
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate text-sidebar-foreground">{settings.app_name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
              </div>
            )}
          </div>

          {/* Toggle colapsar (desktop) */}
          <div className={cn("hidden lg:flex border-b border-sidebar-border", collapsed ? "justify-center p-2" : "justify-end px-3 py-2")}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-sidebar-foreground/70 hover:text-sidebar-foreground"
              onClick={toggleCollapsed}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          <nav className={cn("flex-1 overflow-y-auto", collapsed ? "p-2 space-y-1" : "p-3 space-y-1")}>
            {items.map((item) => {
              const link = (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/app"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center rounded-lg font-medium transition-colors",
                      collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5 text-sm",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );

              return collapsed ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : link;
            })}
          </nav>

          <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-full text-sidebar-foreground/80 hover:text-sidebar-foreground" onClick={signOut}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sair</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:text-sidebar-foreground" onClick={signOut}>
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            )}
          </div>
        </aside>

        {/* Mobile overlay */}
        {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setOpen(false)} />}

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card">
            <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          <span className="font-semibold text-white">{settings.app_name}</span>
            <div className="w-10" />
          </header>
          <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
