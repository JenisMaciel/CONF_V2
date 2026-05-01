import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScanBarcode, CheckCircle2, Loader2, AlertOctagon, Play, Square, FlaskConical, Save } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/utils";
import { DiffBadge, CountCell } from "@/components/DiffBadge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FileCheck2 } from "lucide-react";

const detectarTurno = (d: Date) => {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Manhã";
  if (h >= 12 && h < 18) return "Tarde";
  if (h >= 18 && h < 23) return "Noite";
  return "Madrugada";
};

interface Material { id?: string; ordem: number; codigo: string; quantidade: string; }
const emptyMateriais = (): Material[] =>
  Array.from({ length: 5 }, (_, i) => ({ ordem: i + 1, codigo: "", quantidade: "" }));

export default function Conferencia() {
  const { user } = useAuth();
  const [remessas, setRemessas] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [codigo, setCodigo] = useState("");
  const [qtd, setQtd] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [closingBip, setClosingBip] = useState(false);
  const [bipagens, setBipagens] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});

  // Campos da remessa selecionada
  const [confDivergencia, setConfDivergencia] = useState<"sim" | "nao">("nao");
  const [confDivergenciaComentario, setConfDivergenciaComentario] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  // Materiais de amostras
  const [materiais, setMateriais] = useState<Material[]>(emptyMateriais());
  const [savingMateriais, setSavingMateriais] = useState(false);

  const selectedRef = useRef<string | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

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
    const { data } = await supabase.from("remessa_itens").select("*").eq("remessa_id", id).order("codigo");
    setItens(data ?? []);
  };

  const loadBipagens = async (id: string) => {
    const { data } = await supabase.from("conferencias").select("*").eq("remessa_id", id).order("created_at", { ascending: false });
    setBipagens(data ?? []);
  };

  const loadMateriais = async (id: string) => {
    const { data } = await supabase.from("materiais_amostras").select("*").eq("remessa_id", id).order("ordem");
    if (data && data.length) {
      const arr = emptyMateriais();
      data.forEach((m: any) => {
        const idx = (m.ordem ?? 1) - 1;
        if (idx >= 0 && idx < 5) arr[idx] = { id: m.id, ordem: m.ordem, codigo: m.codigo ?? "", quantidade: String(m.quantidade ?? "") };
      });
      setMateriais(arr);
    } else {
      setMateriais(emptyMateriais());
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`conf_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessa_itens" }, (payload) => {
        const row: any = payload.new ?? payload.old;
        if (!row || row.remessa_id !== selectedRef.current) return;
        if (payload.eventType === "INSERT") {
          setItens((prev) => prev.some((i) => i.id === row.id) ? prev : [...prev, row].sort((a, b) => a.codigo.localeCompare(b.codigo)));
        } else if (payload.eventType === "UPDATE") {
          setItens((prev) => prev.map((i) => (i.id === row.id ? { ...i, ...row } : i)));
        } else if (payload.eventType === "DELETE") {
          setItens((prev) => prev.filter((i) => i.id !== row.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conferencias" }, (payload) => {
        const row: any = payload.new;
        if (!row || row.remessa_id !== selectedRef.current) return;
        setBipagens((prev) => prev.some((b) => b.id === row.id) ? prev : [row, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (selected) {
      loadItens(selected); loadBipagens(selected); loadMateriais(selected);
      const r = remessas.find((x) => x.id === selected);
      if (r) {
        setConfDivergencia(r.conferencia_divergencia ? "sim" : "nao");
        setConfDivergenciaComentario(r.conferencia_divergencia_comentario ?? "");
      }
    }
  }, [selected, remessas]);

  const remessaAtual = remessas.find((r) => r.id === selected);

  const progresso = useMemo(() => {
    const totalItens = itens.length;
    const conferidos = itens.filter((i) => Number(i.qtd_conferida) >= Number(i.qtd_esperada) && Number(i.qtd_esperada) > 0).length;
    const pct = totalItens ? Math.round((conferidos / totalItens) * 100) : 0;
    return { totalItens, conferidos, pct };
  }, [itens]);

  const codigosRemessa = useMemo(() => new Set(itens.map((i) => i.codigo)), [itens]);

  const iniciarConferencia = async () => {
    if (!selected || !user) return;
    const now = new Date();
    const { error } = await supabase.from("remessas").update({
      status: "em_conferencia",
      recebido_por: user.id,
      conferencia_inicio: now.toISOString(),
      conferencia_turno_inicio: detectarTurno(now),
    } as any).eq("id", selected);
    if (error) { toast.error(error.message); return; }
    toast.success(`Conferência iniciada — turno ${detectarTurno(now)}`);
    await load();
  };

  const bipar = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !user || !codigo.trim()) return;
    const quantidade = Number(qtd) || 0;
    if (quantidade <= 0) { toast.error("Quantidade inválida"); return; }
    setSubmitting(true);

    const item = itens.find((i) => i.codigo === codigo.trim());
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
      const now = new Date();
      await supabase.from("remessas").update({
        status: "em_conferencia",
        recebido_por: user.id,
        conferencia_inicio: remessaAtual.conferencia_inicio ?? now.toISOString(),
        conferencia_turno_inicio: remessaAtual.conferencia_turno_inicio ?? detectarTurno(now),
      } as any).eq("id", selected);
    }

    setCodigo("");
    setQtd("1");
    setSubmitting(false);
  };

  const salvarMetaConferencia = async () => {
    if (!selected) return;
    if (confDivergencia === "sim" && !confDivergenciaComentario.trim()) {
      toast.error("Informe o comentário da divergência"); return;
    }
    setSavingMeta(true);
    const { error } = await supabase.from("remessas").update({
      conferencia_divergencia: confDivergencia === "sim",
      conferencia_divergencia_comentario: confDivergencia === "sim" ? confDivergenciaComentario.trim() : null,
    } as any).eq("id", selected);
    setSavingMeta(false);
    if (error) toast.error(error.message); else toast.success("Dados da conferência salvos");
  };

  const salvarMateriais = async () => {
    if (!selected) return;
    setSavingMateriais(true);
    try {
      await supabase.from("materiais_amostras").delete().eq("remessa_id", selected);
      const validos = materiais.filter((m) => m.codigo.trim() || Number(m.quantidade) > 0);
      if (validos.length) {
        const { error } = await supabase.from("materiais_amostras").insert(
          validos.map((m) => ({
            remessa_id: selected,
            ordem: m.ordem,
            codigo: m.codigo.trim() || null,
            quantidade: Number(m.quantidade) || 0,
          }))
        );
        if (error) throw error;
      }
      toast.success("Materiais de amostras salvos");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar materiais");
    } finally {
      setSavingMateriais(false);
    }
  };

  const finalizarConferencia = async () => {
    if (!selected) return;
    setFinishing(true);
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
        remessa_numero: remessaAtual?.numero ?? null,
        remessa_categoria: remessaAtual?.categoria ?? null,
      })));
    }
    const now = new Date();
    await supabase.from("remessas").update({
      status: "finalizada",
      finalizada_em: now.toISOString(),
      conferencia_termino: now.toISOString(),
      conferencia_turno_fim: detectarTurno(now),
    } as any).eq("id", selected);
    toast.success("Conferência finalizada");
    setFinishing(false);
  };

  const finalizarBipagem = async () => {
    if (!selected || !user) return;
    setClosingBip(true);
    const divergentes = itens.filter((i) => Number(i.qtd_conferida) !== Number(i.qtd_esperada));
    await supabase.from("divergencias").delete().eq("remessa_id", selected).eq("status", "pendente");

    if (divergentes.length) {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("divergencias").insert(divergentes.map((i) => ({
        remessa_id: selected,
        item_id: i.id,
        codigo: i.codigo,
        descricao: i.descricao,
        qtd_esperada: i.qtd_esperada,
        qtd_conferida: i.qtd_conferida,
        diferenca: Number(i.qtd_conferida) - Number(i.qtd_esperada),
        remessa_numero: remessaAtual?.numero ?? null,
        remessa_categoria: remessaAtual?.categoria ?? null,
        finalizado_por: user.id,
        finalizado_em: nowIso,
      })));
      if (error) { toast.error(error.message); setClosingBip(false); return; }
      toast.success(`Bipagem finalizada — ${divergentes.length} divergência(s) registrada(s)`);
    } else {
      toast.success("Bipagem finalizada — sem divergências");
    }
    setClosingBip(false);
  };

  const updateMaterial = (idx: number, field: "codigo" | "quantidade", value: string) => {
    setMateriais((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Processo em Conferência</h1>
        <p className="text-muted-foreground text-sm mt-1">Bipe os códigos do arquivo e acompanhe lado a lado</p>
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
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Remessa</p>
                <p className="font-bold text-lg">{remessaAtual.numero}</p>
                <p className="text-xs text-muted-foreground">{fmtNum(progresso.conferidos)}/{fmtNum(progresso.totalItens)} itens</p>
              </div>
              <div className="sm:col-span-2 flex flex-col justify-center">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Progresso</span><span>{progresso.pct}%</span>
                </div>
                <Progress value={progresso.pct} className="h-3" />
                <p className="text-xs text-muted-foreground mt-2">Recebendo: <span className="text-foreground font-medium">{user?.email}</span></p>
              </div>
            </div>

            {/* Início / Término / Turnos */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded-md border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">Início</p>
                <p className="font-medium">{remessaAtual.conferencia_inicio ? new Date(remessaAtual.conferencia_inicio).toLocaleString("pt-BR") : "—"}</p>
              </div>
              <div className="rounded-md border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">Turno de Início</p>
                <p className="font-medium">{remessaAtual.conferencia_turno_inicio ?? "—"}</p>
              </div>
              <div className="rounded-md border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">Término</p>
                <p className="font-medium">{remessaAtual.conferencia_termino ? new Date(remessaAtual.conferencia_termino).toLocaleString("pt-BR") : "—"}</p>
              </div>
              <div className="rounded-md border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">Turno de Fim</p>
                <p className="font-medium">{remessaAtual.conferencia_turno_fim ?? "—"}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 items-end">
              {!remessaAtual.conferencia_inicio && (
                <Button onClick={iniciarConferencia} variant="secondary">
                  <Play className="h-4 w-4 mr-2" /> Iniciar Conferência
                </Button>
              )}

              <div className="flex-1 min-w-[260px]">
                <Label>Divergência</Label>
                <RadioGroup value={confDivergencia} onValueChange={(v: any) => setConfDivergencia(v)} className="flex gap-4 mt-2">
                  <div className="flex items-center gap-2"><RadioGroupItem value="nao" id="cdn" /><Label htmlFor="cdn" className="cursor-pointer">Não</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="sim" id="cds" /><Label htmlFor="cds" className="cursor-pointer">Sim</Label></div>
                </RadioGroup>
              </div>
              <Button onClick={salvarMetaConferencia} disabled={savingMeta} variant="outline">
                {savingMeta ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </div>

            {confDivergencia === "sim" && (
              <div className="mt-3">
                <Label>Comentários para divergências</Label>
                <Textarea className="mt-2" rows={3} value={confDivergenciaComentario} onChange={(e) => setConfDivergenciaComentario(e.target.value)} placeholder="Descreva a divergência..." />
              </div>
            )}
          </>
        )}
      </Card>

      {/* Bipagem */}
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

      {/* Lado-a-lado: Arquivo (esquerda) + Bipagens (direita) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0 overflow-hidden border-border/50 shadow-card">
          <div className="p-4 border-b border-border bg-card flex items-center justify-between">
            <h2 className="font-semibold">Arquivo da Remessa</h2>
            <Badge variant="secondary">{fmtNum(itens.length)} itens</Badge>
          </div>
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Dif.</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Selecione uma remessa</TableCell></TableRow>
                ) : itens.map((i) => {
                  const ok = Number(i.qtd_conferida) === Number(i.qtd_esperada) && Number(i.qtd_esperada) > 0;
                  const div = Number(i.qtd_conferida) !== Number(i.qtd_esperada) && Number(i.qtd_conferida) > 0;
                  const dif = Number(i.qtd_conferida) - Number(i.qtd_esperada);
                  return (
                    <TableRow key={i.id} className={div ? "bg-destructive/10" : ok ? "bg-success/5" : ""}>
                      <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                      <TableCell className="text-xs">{i.descricao}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(i.qtd_esperada)}</TableCell>
                      <TableCell className="text-right">
                        <CountCell value={Number(i.qtd_conferida)} highlight={ok ? "ok" : Number(i.qtd_conferida) > Number(i.qtd_esperada) ? "over" : div ? "danger" : "none"} />
                      </TableCell>
                      <TableCell className="text-right"><DiffBadge value={dif} /></TableCell>
                      <TableCell>
                        {ok ? <Badge className="bg-success text-success-foreground">OK</Badge>
                          : div ? <Badge variant="destructive">Div.</Badge>
                          : <Badge variant="secondary">—</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-0 overflow-hidden border-border/50 shadow-card">
          <div className="p-4 border-b border-border bg-card flex items-center justify-between">
            <h2 className="font-semibold">Bipagens</h2>
            <Badge variant="secondary">{fmtNum(bipagens.length)} {bipagens.length === 1 ? "registro" : "registros"}</Badge>
          </div>
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-right">Qtde</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bipagens.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">Nenhuma bipagem ainda</TableCell></TableRow>
                ) : bipagens.map((b) => {
                  const naoConsta = !codigosRemessa.has(b.codigo);
                  return (
                    <TableRow key={b.id} className={naoConsta ? "bg-warning/10 hover:bg-warning/20" : ""}>
                      <TableCell className="text-xs">{new Date(b.created_at).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="font-mono text-xs">{b.codigo}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmtNum(b.quantidade)}</TableCell>
                      <TableCell className="text-xs">{usuarios[b.user_id] ?? "—"}</TableCell>
                      <TableCell>
                        {naoConsta ? (
                          <Badge className="bg-warning text-warning-foreground gap-1 text-[10px]">
                            <AlertOctagon className="h-3 w-3" /> NÃO CONSTA
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
      </div>

      {/* Materiais de Amostras */}
      <Card className="p-5 border-border/50 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Materiais de Amostras</h2>
            <span className="text-xs text-muted-foreground">Até 5 itens</span>
          </div>
          <Button onClick={salvarMateriais} disabled={savingMateriais || !selected} variant="outline" size="sm">
            {savingMateriais ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
        <div className="space-y-2">
          {materiais.map((m, idx) => (
            <div key={idx} className="grid grid-cols-[40px_1fr_140px] gap-2 items-center">
              <span className="text-xs text-muted-foreground text-center">#{m.ordem}</span>
              <Input placeholder="Código" value={m.codigo} onChange={(e) => updateMaterial(idx, "codigo", e.target.value)} disabled={!selected} className="font-mono" />
              <Input type="number" min={0} placeholder="Qtde" value={m.quantidade} onChange={(e) => updateMaterial(idx, "quantidade", e.target.value)} disabled={!selected} />
            </div>
          ))}
        </div>
      </Card>

      {selected && progresso.totalItens > 0 && (
        <div className="flex flex-wrap justify-end gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" variant="secondary" disabled={closingBip}>
                {closingBip ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck2 className="h-4 w-4 mr-2" />}
                Finalizar Bipagem
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Finalizar bipagem?</AlertDialogTitle>
                <AlertDialogDescription>
                  Será gerado um snapshot dos itens divergentes na aba <strong>Gestão de Divergências</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={finalizarBipagem}>Confirmar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button size="lg" onClick={finalizarConferencia} disabled={finishing} className="bg-success text-success-foreground hover:bg-success/90">
            {finishing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            <Square className="h-4 w-4 mr-2" />
            Conferência Finalizada
          </Button>
        </div>
      )}
    </div>
  );
}
