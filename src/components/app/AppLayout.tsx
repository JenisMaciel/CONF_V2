import { ReactNode, useState } from "react";
import { NavLink, useLocation, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { Button } from "@/components/ui/button";
import {
  PackageCheck, ScanBarcode, Database, AlertTriangle, History,
  Settings, LogOut, Menu, X, PackageOpen
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof PackageCheck;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/app", label: "Recebimento", icon: PackageOpen },
  { to: "/app/conferencia", label: "Conferência", icon: ScanBarcode },
  { to: "/app/dados", label: "Dados", icon: Database, adminOnly: true },
  { to: "/app/divergencias", label: "Gestão de Divergência", icon: AlertTriangle, adminOnly: true },
  { to: "/app/historico", label: "Histórico", icon: History, adminOnly: true },
  { to: "/app/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
];

export default function AppLayout() {
  const { user, loading, isAdmin, signOut } = useAuth();
  const { settings } = useAppSettings();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  const items = NAV.filter((i) => !i.adminOnly || isAdmin);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center gap-3 p-5 border-b border-sidebar-border">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="h-10 w-10 rounded-lg object-contain bg-sidebar-accent" />
          ) : (
            <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center">
              <PackageCheck className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-bold truncate text-sidebar-foreground">{settings.app_name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:text-sidebar-foreground" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
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
          <span className="font-semibold">{settings.app_name}</span>
          <div className="w-10" />
        </header>
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
