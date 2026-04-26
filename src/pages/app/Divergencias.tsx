import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/utils";
import { DiffBadge } from "@/components/DiffBadge";

export default function Divergencias() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState("");
  const [obs, setObs] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("divergencias").select("*").order("created_at", { ascending: false });
    setItems(data ?? []);
    const { data: profs } = await supabase.from("profiles").select("user_id, display_name, email");
    const m: Record<string, string> = {};
    profs?.forEach((p) => (m[p.user_id] = p.display_name || p.email));
    setUsuarios(m);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("div")
      .on("postgres_changes", { event: "*", schema: "public", table: "divergencias" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!isAdmin) return <p className="text-muted-foreground">Acesso restrito.</p>;

  const ajustar = async () => {
    if (!selected || !user) return;
    const { error } = await supabase.from("divergencias").update({
      status: "ajustado",
      ajustado_por: user.id,
      ajustado_em: new Date().toISOString(),
      observacao: obs,
    }).eq("id", selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Divergência ajustada");
    setOpen(false);
    setObs("");
    setSelected(null);
  };

  const filtered = items.filter((i) =>
    !filtro ||
    i.codigo.toLowerCase().includes(filtro.toLowerCase()) ||
    (i.descricao ?? "").toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Gestão de Divergências</h1>
        <p className="text-muted-foreground text-sm mt-1">Acompanhe e ajuste as divergências de conferência</p>
      </div>

      <Input placeholder="Filtrar por código ou descrição..." value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-md" />

      <Card className="p-0 overflow-hidden border-border/50 shadow-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
                <TableHead className="text-right">Contado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ajustado por</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">Nenhuma divergência</TableCell></TableRow>
              ) : filtered.map((d) => (
                <TableRow key={d.id} className={d.status === "ajustado" ? "" : "bg-destructive/5"}>
                  <TableCell className="font-mono text-xs">{d.codigo}</TableCell>
                  <TableCell>{d.descricao}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(d.qtd_esperada)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(d.qtd_conferida)}</TableCell>
                  <TableCell className="text-right">
                    <DiffBadge value={Number(d.diferenca)} />
                  </TableCell>
                  <TableCell>
                    {d.status === "ajustado"
                      ? <Badge className="bg-success text-success-foreground">AJUSTADO</Badge>
                      : <Badge variant="destructive">PENDENTE</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{d.ajustado_por ? usuarios[d.ajustado_por] ?? "—" : "—"}</TableCell>
                  <TableCell className="text-xs max-w-xs truncate">{d.observacao ?? "—"}</TableCell>
                  <TableCell>
                    {d.status !== "ajustado" && (
                      <Button size="sm" variant="secondary" onClick={() => { setSelected(d); setOpen(true); }}>
                        Ajustar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar divergência</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">Código:</span> <span className="font-mono">{selected.codigo}</span></p>
              <p><span className="text-muted-foreground">Diferença:</span> <span className="font-semibold">{fmtNum(selected.diferenca)}</span></p>
              <div>
                <Label htmlFor="obs">Observação</Label>
                <Textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Descreva o ajuste realizado..." className="mt-2" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={ajustar} className="bg-success text-success-foreground hover:bg-success/90"><CheckCircle2 className="h-4 w-4 mr-2" />Confirmar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
