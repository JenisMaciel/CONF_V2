import { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/hooks/useAppSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, PackageCheck } from "lucide-react";
import loginBg from "@/assets/login-bg.jpg";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the user lands via the recovery link
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Also check if there's already a session (link already processed)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error("Erro ao redefinir senha", { description: error.message });
      return;
    }
    toast.success("Senha atualizada com sucesso!");
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const heroImage = settings.login_image_url || loginBg;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="relative hidden lg:flex items-end p-12 overflow-hidden">
        <img src={heroImage} alt="Redefinir senha" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="relative z-10 max-w-md animate-fade-in">
          <h2 className="text-4xl font-bold mb-3 text-gradient">{settings.app_name}</h2>
          <p className="text-muted-foreground text-lg">Defina uma nova senha de acesso.</p>
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
              <h1 className="text-xl font-bold leading-tight">Nova senha</h1>
              <p className="text-xs text-muted-foreground">Defina sua nova senha</p>
            </div>
          </div>

          {!ready ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-3" />
              Validando link de recuperação…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar nova senha</Label>
                <Input id="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Redefinir senha
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}