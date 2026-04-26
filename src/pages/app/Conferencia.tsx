import { useEffect, useMemo, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScanBarcode, CheckCircle2, Loader2, History, AlertOctagon } from "lucide-react";
import { toast } from "sonner";

export default function Conferencia() {
  const { user } = useAuth();
  const [remessas, setRemessas] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [codigo, setCodigo] = useState("");
  const [qtd, setQtd] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [bipagens, setBipagens] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase
      .from("remessas")
      .select("*")
      .in("status", ["aberta", "em_conferencia"])
      .order("created_at", { ascending: false });
    setRemessas(data ?? []);
    if (data?.length && !selected) setSelected(data[0].id);

    const { data: profs } = await supabase.from("profiles").select("user_id, display_name, email");
    const map: Record<string, string> = {};
    profs?.forEach((p) => (map[p.user_id] = p.display_name || p.email));
    setUsuarios(map);
  };

  const loadItens = async (id: string) => {
    const { data } = await supabase
      .from("remessa_itens")
      .select("*")
      .eq("remessa_id", id)
      .order("codigo");
    setItens(data ?? []);
  };

  const loadBipagens = async (id: string) => {
    const { data } = await supabase
      .from("conferencias")
      .select("*")
      .eq("remessa_id", id)
      .order("created_at", { ascending: false });
    setBipagens(data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`conf_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessa_itens" }, () => selected && loadItens(selected))
      .on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "conferencias" }, () => selected && loadBipagens(selected))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  useEffect(() => { if (selected) { loadItens(selected); loadBipagens(selected); } }, [selected]);

  const remessaAtual = remessas.find((r) => r.id === selected);

  const progresso = useMemo(() => {
    const totalItens = itens.length;
    const conferidos = itens.filter((i) => Number(i.qtd_conferida) >= Number(i.qtd_esperada) && Number(i.qtd_esperada) > 0).length;
    const pct = totalItens ? Math.round((conferidos / totalItens) * 100) : 0;
    return { totalItens, conferidos, pct };
  }, [itens]);

  const codigosRemessa = useMemo(() => new Set(itens.map((i) => i.codigo)), [itens]);

  const bipar = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !user || !codigo.trim()) return;
    const quantidade = Number(qtd) || 0;
    if (quantidade <= 0) { toast.error("Quantidade inválida"); return; }
    setSubmitting(true);

    const item = itens.find((i) => i.codigo === codigo.trim());

    // Sempre registra a bipagem, mesmo se não constar na remessa
    const { error: e1 } = await supabase.from("conferencias").insert({
      remessa_id: selected,
      item_id: item?.id ?? null,
      codigo: codigo.trim(),
      quantidade,
      user_id: user.id,
    });
    if (e1) { toast.error(e1.message); setSubmitting(false); return; }

    if (item) {
      const novaQtd = Number(item.qtd_conferida) + quantidade;
      await supabase.from("remessa_itens").update({
        qtd_conferida: novaQtd,
        recebido_por: user.id,
        recebido_em: new Date().toISOString(),
      }).eq("id", item.id);
      toast.success(`+${quantidade} em ${item.codigo}`);
    } else {
      toast.warning(`Produto ${codigo.trim()} NÃO consta na remessa — bipagem registrada`);
    }

    if (remessaAtual?.status === "aberta") {
      await supabase.from("remessas").update({ status: "em_conferencia", recebido_por: user.id }).eq("id", selected);
    }

    setCodigo("");
    setQtd("1");
    setSubmitting(false);
  };

  const finalizarConferencia = async () => {
    if (!selected) return;
    setFinishing(true);
    // gerar divergências
    const divergentes = itens.filter((i) => Number(i.qtd_conferida) !== Number(i.qtd_esperada));
    if (divergentes.length) {
      await supabase.from("divergencias").insert(divergentes.map((i) => ({
        remessa_id: selected,
        item_id: i.id,
        codigo: i.codigo,
        descricao: i.descricao,
        qtd_esperada: i.qtd_esperada,
        qtd_conferida: i.qtd_conferida,
        diferenca: Number(i.qtd_conferida) - Number(i.qtd_esperada),
      })));
    }
    await supabase.from("remessas").update({ status: "finalizada", finalizada_em: new Date().toISOString() }).eq("id", selected);
    toast.success("Conferência finalizada");
    setFinishing(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Conferência</h1>
        <p className="text-muted-foreground text-sm mt-1">Bipe os códigos e informe a quantidade conferida</p>
      </div>

      <Card className="p-5 border-border/50 shadow-card">
        <Label className="text-xs text-muted-foreground">Remessa</Label>
        <Select value={selected ?? ""} onValueChange={setSelected}>
          <SelectTrigger className="mt-2"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {remessas.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.numero} • {r.categoria}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {remessaAtual && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Remessa</p>
              <p className="font-bold text-lg">{remessaAtual.numero}</p>
              <p className="text-xs text-muted-foreground">{progresso.conferidos}/{progresso.totalItens} itens</p>
            </div>
            <div className="sm:col-span-2 flex flex-col justify-center">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progresso</span><span>{progresso.pct}%</span>
              </div>
              <Progress value={progresso.pct} className="h-3" />
              <p className="text-xs text-muted-foreground mt-2">Recebendo: <span className="text-foreground font-medium">{user?.email}</span></p>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 border-border/50 shadow-card">
        <form onSubmit={bipar} className="grid sm:grid-cols-[1fr_120px_auto] gap-3 items-end">
          <div>
            <Label htmlFor="codigo">Código (bipe ou digite)</Label>
            <Input id="codigo" autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="EAN / SKU" disabled={!selected} className="mt-2 font-mono" />
          </div>
          <div>
            <Label htmlFor="qtd">Quantidade</Label>
            <Input id="qtd" type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} disabled={!selected} className="mt-2" />
          </div>
          <Button type="submit" disabled={submitting || !selected} className="gradient-primary text-primary-foreground shadow-glow">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4 mr-2" />}
            Bipar
          </Button>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden border-border/50 shadow-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
                <TableHead className="text-right">Contado</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => {
                const ok = Number(i.qtd_conferida) === Number(i.qtd_esperada) && Number(i.qtd_esperada) > 0;
                const div = Number(i.qtd_conferida) !== Number(i.qtd_esperada) && Number(i.qtd_conferida) > 0;
                return (
                  <TableRow key={i.id} className={div ? "bg-destructive/10" : ok ? "bg-success/5" : ""}>
                    <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                    <TableCell>{i.descricao}</TableCell>
                    <TableCell className="text-right">{i.qtd_esperada}</TableCell>
                    <TableCell className="text-right font-semibold">{i.qtd_conferida}</TableCell>
                    <TableCell>
                      {ok ? <Badge className="bg-success text-success-foreground">OK</Badge>
                        : div ? <Badge variant="destructive">Divergente</Badge>
                        : <Badge variant="secondary">Pendente</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {itens.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">Selecione uma remessa</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {selected && (
        <Card className="p-0 overflow-hidden border-border/50 shadow-card">
          <div className="flex items-center justify-between p-4 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Histórico de Bipagem</h2>
            </div>
            <Badge variant="secondary">{bipagens.length} {bipagens.length === 1 ? "registro" : "registros"}</Badge>
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bipagens.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma bipagem ainda</TableCell></TableRow>
                ) : bipagens.map((b) => {
                  const naoConsta = !codigosRemessa.has(b.codigo);
                  return (
                    <TableRow key={b.id} className={naoConsta ? "bg-warning/10 hover:bg-warning/20" : ""}>
                      <TableCell className="text-xs">{new Date(b.created_at).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="font-mono text-xs">{b.codigo}</TableCell>
                      <TableCell className="text-right font-semibold">{b.quantidade}</TableCell>
                      <TableCell className="text-xs">{usuarios[b.user_id] ?? "—"}</TableCell>
                      <TableCell>
                        {naoConsta ? (
                          <Badge className="bg-warning text-warning-foreground gap-1">
                            <AlertOctagon className="h-3 w-3" />
                            PRODUTO NÃO CONSTA NA REMESSA
                          </Badge>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {selected && progresso.totalItens > 0 && (
        <div className="flex justify-end">
          <Button size="lg" onClick={finalizarConferencia} disabled={finishing} className="bg-success text-success-foreground hover:bg-success/90">
            {finishing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Conferência Finalizada
          </Button>
        </div>
      )}
    </div>
  );
}
