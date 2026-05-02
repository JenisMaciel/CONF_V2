import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/hooks/useAppSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, PackageCheck, ArrowLeft } from "lucide-react";
import loginBg from "@/assets/login-bg.jpg";

export default function ForgotPassword() {
  const { settings } = useAppSettings();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Erro ao enviar e-mail", { description: error.message });
      return;
    }
    setSent(true);
    toast.success("E-mail enviado!");
  };

  const heroImage = settings.login_image_url || loginBg;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="relative hidden lg:flex items-end p-12 overflow-hidden">
        <img src={heroImage} alt="Recuperação de senha" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="relative z-10 max-w-md animate-fade-in">
          <h2 className="text-4xl font-bold mb-3 text-gradient">{settings.app_name}</h2>
          <p className="text-muted-foreground text-lg">
            Recupere o acesso à sua conta em poucos passos.
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
              <h1 className="text-xl font-bold leading-tight">Recuperar senha</h1>
              <p className="text-xs text-muted-foreground">Enviaremos um link por e-mail</p>
            </div>
          </div>

          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Se existir uma conta para <strong>{email}</strong>, você receberá um e-mail com o link para redefinir sua senha. Verifique também a caixa de spam.
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" />
              </div>
              <Button type="submit" className="w-full gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar link de redefinição
              </Button>
              <Link to="/login" className="block text-center text-sm text-primary hover:underline">
                Voltar ao login
              </Link>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}