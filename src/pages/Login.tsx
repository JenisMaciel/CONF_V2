import { useState, FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, PackageCheck } from "lucide-react";
import conferenciaBg from "@/assets/conferencia-bg.jpg";

export default function Login() {
  const { user, loading: authLoading, signIn } = useAuth();
  const { settings } = useAppSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && user) return <Navigate to="/app" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) toast.error("Falha no login", { description: error });
    else toast.success("Bem-vindo!");
  };

  const heroImage = conferenciaBg;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="relative hidden lg:flex items-end p-12 overflow-hidden">
        <img
          src={heroImage}
          alt="Conferência de devolução"
          className="absolute inset-0 w-full h-full object-cover"
          width={1280}
          height={1280}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="relative z-10 max-w-md animate-fade-in">
          <h2 className="text-4xl font-bold mb-3 text-gradient">{settings.app_name}</h2>
          <p className="text-muted-foreground text-lg">
            Receba, confira e gerencie devoluções com precisão e agilidade.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md p-8 shadow-card border-border/50 animate-fade-in">
          <div className="flex items-center gap-3 mb-8">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-12 w-12 object-contain rounded-lg" />
            ) : (
              <div className="h-12 w-12 rounded-lg gradient-primary flex items-center justify-center shadow-glow">
                <PackageCheck className="h-6 w-6 text-primary-foreground" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold leading-tight">{settings.app_name}</h1>
              <p className="text-xs text-muted-foreground">Acesso restrito</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>

          <div className="mt-4 text-center">
            <a href="/forgot-password" className="text-sm text-primary hover:underline">
              Esqueci minha senha
            </a>
          </div>

          <p className="mt-6 text-xs text-muted-foreground text-center">
            Solicite acesso ao administrador do sistema.
          </p>
        </Card>
      </div>
    </div>
  );
}
