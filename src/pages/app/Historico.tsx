import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/utils";

export default function Historico() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [filtro, setFiltro] = useState("");
  const [data, setData] = useState("");

  const load = async () => {
    const { data } = await supabase.from("remessas").select("*").eq("status", "recebida").order("recebida_em", { ascending: false });
    setItems(data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("hist").on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!isAdmin) return <p className="text-muted-foreground">Acesso restrito.</p>;

  const reabrir = async (id: string) => {
    await supabase.from("remessas").update({ status: "em_conferencia", recebida_em: null }).eq("id", id);
    toast.success("Remessa reaberta");
  };

  const filtered = items.filter((r) => {
    if (filtro && !r.numero.toLowerCase().includes(filtro.toLowerCase())) return false;
    if (data && (!r.recebida_em || !r.recebida_em.startsWith(data))) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Histórico</h1>
        <p className="text-muted-foreground text-sm mt-1">Remessas marcadas como recebidas</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Buscar por número..." value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-xs" />
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="max-w-xs" />
      </div>

      <Card className="p-0 overflow-hidden border-border/50 shadow-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Remessa</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Qtd Esperada</TableHead>
                <TableHead>Recebida em</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Nenhuma remessa no histórico</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.numero}</TableCell>
                  <TableCell><Badge variant="secondary">{r.categoria}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(r.total_itens)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNum(r.total_qtd_esperada)}</TableCell>
                  <TableCell className="text-xs">{r.recebida_em ? new Date(r.recebida_em).toLocaleString("pt-BR") : "—"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => reabrir(r.id)}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Reabrir
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
