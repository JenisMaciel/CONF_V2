import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground bg-background">Carregando…</div>;
  return <Navigate to={user ? "/app" : "/login"} replace />;
}
