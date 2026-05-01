import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Play, Loader2, ListOrdered } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const detectarTurno = (d: Date) => {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Manhã";
  if (h >= 12 && h < 18) return "Tarde";
  if (h >= 18 && h < 23) return "Noite";
  return "Madrugada";
};

export default function Workflow() {
  const { isAdmin, user } = useAuth();
  const nav = useNavigate();
  const [remessas, setRemessas] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [iniciandoId, setIniciandoId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("remessas")
      .select("*")
      .eq("status", "aberta")
      .order("prioridade", { ascending: true })
      .order("created_at", { ascending: true });
    setRemessas(data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`wf_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const updatePrioridade = async (id: string, value: number) => {
    setSavingId(id);
    const { error } = await supabase.from("remessas").update({ prioridade: value } as any).eq("id", id);
    setSavingId(null);
    if (error) toast.error(error.message); else toast.success("Prioridade atualizada");
  };

  const iniciarConferencia = async (id: string) => {
    if (!user) return;
    setIniciandoId(id);
    const now = new Date();
    const { error } = await supabase.from("remessas").update({
      status: "em_conferencia",
      recebido_por: user.id,
      conferencia_inicio: now.toISOString(),
      conferencia_turno_inicio: detectarTurno(now),
    } as any).eq("id", id);
    setIniciandoId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Conferência iniciada");
    nav(`/app/conferencia?remessa=${id}`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><ListOrdered className="h-7 w-7" /> Workflow</h1>
        <p className="text-muted-foreground text-sm mt-1">Remessas aguardando conferência — admins definem a prioridade</p>
      </div>

      <Card className="p-0 overflow-hidden border-border/50 shadow-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Prioridade</TableHead>
                <TableHead>Anexada em</TableHead>
                <TableHead>Processo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {remessas.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Nenhuma remessa aguardando conferência</TableCell></TableRow>
              ) : remessas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {isAdmin ? (
                      <Input
                        type="number" min={1}
                        defaultValue={r.prioridade}
                        disabled={savingId === r.id}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v && v !== r.prioridade) updatePrioridade(r.id, v);
                        }}
                        className="w-20"
                      />
                    ) : (
                      <Badge variant="outline">{r.prioridade}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>{r.categoria}</TableCell>
                  <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                  <TableCell className="text-xs">{r.origem ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.total_itens}</TableCell>
                  <TableCell><Badge variant="secondary">Aguardando</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => iniciarConferencia(r.id)} disabled={iniciandoId === r.id}>
                      {iniciandoId === r.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      Iniciar Conferência
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
