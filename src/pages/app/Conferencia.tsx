import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";
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
import { ScanBarcode, CheckCircle2, Loader2, AlertOctagon, Square, FlaskConical, Save, Trash2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/utils";
import { DiffBadge, CountCell } from "@/components/DiffBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  const [params] = useSearchParams();
  const remessaIdFromUrl = params.get("remessa");

  const [remessas, setRemessas] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [bipagens, setBipagens] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});

  const [codigo, setCodigo] = useState("");
  const [qtd, setQtd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [closingBip, setClosingBip] = useState(false);

  const [confDivergencia, setConfDivergencia] = useState<"sim" | "nao">("nao");
  const [confDivergenciaComentario, setConfDivergenciaComentario] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  const [materiais, setMateriais] = useState<Material[]>(emptyMateriais());
  const [savingMateriais, setSavingMateriais] = useState(false);

  // Buscas
  const [searchItens, setSearchItens] = useState("");
  const [searchHistorico, setSearchHistorico] = useState("");

  // Recontagem divergentes
  const [recontaCodigo, setRecontaCodigo] = useState("");
  const [recontaQtd, setRecontaQtd] = useState("");
  const [recontando, setRecontando] = useState(false);

  const selectedRef = useRef<string | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const load = async () => {
    const { data } = await supabase
      .from("remessas")
      .select("*")
      .eq("status", "em_conferencia")
      .order("prioridade", { ascending: true })
      .order("created_at", { ascending: true });
    setRemessas(data ?? []);

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

  useEffect(() => { load(); }, []);

  // Auto-selecionar remessa via URL ou primeira disponível
  useEffect(() => {
    if (!remessas.length) { setSelected(null); return; }
    if (remessaIdFromUrl && remessas.find((r) => r.id === remessaIdFromUrl)) {
      setSelected(remessaIdFromUrl);
    } else if (!selected || !remessas.find((r) => r.id === selected)) {
      setSelected(remessas[0].id);
    }
  }, [remessas, remessaIdFromUrl]);

  // Realtime — depende de "selected"
  useEffect(() => {
    const ch = supabase
      .channel(`conf_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load)
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
      .on("postgres_changes", { event: "*", schema: "public", table: "conferencias" }, (payload) => {
        const row: any = payload.new ?? payload.old;
        if (!row || row.remessa_id !== selectedRef.current) return;
        if (payload.eventType === "INSERT") {
          setBipagens((prev) => prev.some((b) => b.id === row.id) ? prev : [row, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setBipagens((prev) => prev.map((b) => (b.id === row.id ? { ...b, ...row } : b)));
        } else if (payload.eventType === "DELETE") {
          setBipagens((prev) => prev.filter((b) => b.id !== row.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "materiais_amostras" }, (payload) => {
        const row: any = payload.new ?? payload.old;
        if (!row || row.remessa_id !== selectedRef.current) return;
        loadMateriais(selectedRef.current);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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

  // Soma das bipagens por código (suporta multi-usuário)
  const conferidoPorCodigo = useMemo(() => {
    const map: Record<string, number> = {};
    bipagens.forEach((b) => { map[b.codigo] = (map[b.codigo] ?? 0) + Number(b.quantidade); });
    return map;
  }, [bipagens]);

  const itensComConferido = useMemo(() => itens.map((i) => ({
    ...i,
    conferido: conferidoPorCodigo[i.codigo] ?? 0,
  })), [itens, conferidoPorCodigo]);

  const codigosRemessa = useMemo(() => new Set(itens.map((i) => i.codigo)), [itens]);

  const progresso = useMemo(() => {
    const totalItens = itens.length;
    const conferidos = itensComConferido.filter((i) => i.conferido >= Number(i.qtd_esperada) && Number(i.qtd_esperada) > 0).length;
    const pct = totalItens ? Math.round((conferidos / totalItens) * 100) : 0;
    return { totalItens, conferidos, pct };
  }, [itens, itensComConferido]);

  const itensFiltrados = useMemo(() => {
    if (!searchItens.trim()) return itensComConferido;
    const q = searchItens.toLowerCase();
    return itensComConferido.filter((i) => i.codigo.toLowerCase().includes(q) || (i.descricao ?? "").toLowerCase().includes(q));
  }, [itensComConferido, searchItens]);

  const bipagensFiltradas = useMemo(() => {
    if (!searchHistorico.trim()) return bipagens;
    const q = searchHistorico.toLowerCase();
    return bipagens.filter((b) => b.codigo.toLowerCase().includes(q));
  }, [bipagens, searchHistorico]);

  // Prévia do item bipado
  const previa = useMemo(() => {
    const cod = codigo.trim();
    if (!cod) return null;
    const item = itens.find((i) => i.codigo === cod);
    if (!item) return { naoConsta: true as const, codigo: cod };
    const conferido = conferidoPorCodigo[cod] ?? 0;
    const esperado = Number(item.qtd_esperada);
    return {
      naoConsta: false as const,
      codigo: cod,
      descricao: item.descricao,
      esperado,
      conferido,
      faltante: Math.max(0, esperado - conferido),
    };
  }, [codigo, itens, conferidoPorCodigo]);

  const itensDivergentes = useMemo(() => itensComConferido.filter((i) => i.conferido !== Number(i.qtd_esperada)), [itensComConferido]);

  const bipar = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !user || !codigo.trim()) return;
    const quantidade = Number(qtd);
    if (!quantidade || quantidade <= 0) { toast.error("Quantidade inválida"); return; }
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

    if (item) toast.success(`+${quantidade} em ${item.codigo}`);
    else toast.warning(`Produto ${codigo.trim()} NÃO consta na remessa — bipagem registrada`);

    setCodigo("");
    setQtd("");
    setSubmitting(false);
  };

  const apagarBipagem = async (id: string) => {
    const { error } = await supabase.from("conferencias").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Bipagem removida");
  };

  const zerarItemParaRecontagem = async (codigoItem: string) => {
    if (!selected) return;
    const { error } = await supabase
      .from("conferencias")
      .delete()
      .eq("remessa_id", selected)
      .eq("codigo", codigoItem);
    if (error) { toast.error(error.message); return; }
    await supabase.from("remessa_itens")
      .update({ qtd_conferida: 0 })
      .eq("remessa_id", selected)
      .eq("codigo", codigoItem);
    toast.success(`Item ${codigoItem} zerado — pronto para recontagem`);
  };

  const zerarTodosDivergentes = async () => {
    if (!selected || !itensDivergentes.length) return;
    const codigos = itensDivergentes.map((i) => i.codigo);
    const { error } = await supabase
      .from("conferencias")
      .delete()
      .eq("remessa_id", selected)
      .in("codigo", codigos);
    if (error) { toast.error(error.message); return; }
    await supabase.from("remessa_itens")
      .update({ qtd_conferida: 0 })
      .eq("remessa_id", selected)
      .in("codigo", codigos);
    toast.success(`${codigos.length} itens zerados para recontagem`);
  };

  const recontarItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !user || !recontaCodigo.trim()) return;
    const quantidade = Number(recontaQtd);
    if (!quantidade || quantidade <= 0) { toast.error("Quantidade inválida"); return; }
    setRecontando(true);
    const item = itens.find((i) => i.codigo === recontaCodigo.trim());
    const { error } = await supabase.from("conferencias").insert({
      remessa_id: selected,
      item_id: item?.id ?? null,
      codigo: recontaCodigo.trim(),
      quantidade,
      user_id: user.id,
    });
    setRecontando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Recontagem registrada");
    setRecontaCodigo(""); setRecontaQtd("");
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
            remessa_id: selected, ordem: m.ordem,
            codigo: m.codigo.trim() || null, quantidade: Number(m.quantidade) || 0,
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
    // Sincroniza qtd_conferida com a soma real antes de finalizar
    for (const i of itensComConferido) {
      await supabase.from("remessa_itens").update({ qtd_conferida: i.conferido }).eq("id", i.id);
    }
    const divergentes = itensComConferido.filter((i) => i.conferido !== Number(i.qtd_esperada));
    if (divergentes.length) {
      await supabase.from("divergencias").insert(divergentes.map((i) => ({
        remessa_id: selected, item_id: i.id, codigo: i.codigo, descricao: i.descricao,
        qtd_esperada: i.qtd_esperada, qtd_conferida: i.conferido,
        diferenca: i.conferido - Number(i.qtd_esperada),
        remessa_numero: remessaAtual?.numero ?? null, remessa_categoria: remessaAtual?.categoria ?? null,
      })));
    }
    const now = new Date();
    await supabase.from("remessas").update({
      status: "finalizada", finalizada_em: now.toISOString(),
      conferencia_termino: now.toISOString(), conferencia_turno_fim: detectarTurno(now),
    } as any).eq("id", selected);
    toast.success("Conferência finalizada");
    setFinishing(false);
  };

  const finalizarBipagem = async () => {
    if (!selected || !user) return;
    setClosingBip(true);
    for (const i of itensComConferido) {
      await supabase.from("remessa_itens").update({ qtd_conferida: i.conferido }).eq("id", i.id);
    }
    const divergentes = itensComConferido.filter((i) => i.conferido !== Number(i.qtd_esperada));
    await supabase.from("divergencias").delete().eq("remessa_id", selected).eq("status", "pendente");

    if (divergentes.length) {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("divergencias").insert(divergentes.map((i) => ({
        remessa_id: selected, item_id: i.id, codigo: i.codigo, descricao: i.descricao,
        qtd_esperada: i.qtd_esperada, qtd_conferida: i.conferido,
        diferenca: i.conferido - Number(i.qtd_esperada),
        remessa_numero: remessaAtual?.numero ?? null, remessa_categoria: remessaAtual?.categoria ?? null,
        finalizado_por: user.id, finalizado_em: nowIso,
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
        <p className="text-muted-foreground text-sm mt-1">Múltiplos usuários podem conferir a mesma remessa — quantidades são somadas</p>
      </div>

      <Card className="p-5 border-border/50 shadow-card">
        <Label className="text-xs text-muted-foreground">Remessa em conferência</Label>
        <Select value={selected ?? ""} onValueChange={setSelected}>
          <SelectTrigger className="mt-2"><SelectValue placeholder="Nenhuma remessa em conferência" /></SelectTrigger>
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
                <p className="text-xs text-muted-foreground mt-2">Você: <span className="text-foreground font-medium">{user?.email}</span></p>
              </div>
            </div>

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
            <Input id="qtd" type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} disabled={!selected} className="mt-2" placeholder="" />
          </div>
          <Button type="submit" disabled={submitting || !selected} className="gradient-primary text-primary-foreground shadow-glow">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4 mr-2" />}
            Bipar
          </Button>
        </form>

        {/* Prévia do item */}
        {previa && (
          <div className={`mt-4 rounded-md border p-3 text-sm ${previa.naoConsta ? "bg-warning/10 border-warning/40" : "bg-muted/40 border-border"}`}>
            {previa.naoConsta ? (
              <div className="flex items-center gap-2"><AlertOctagon className="h-4 w-4 text-warning" /> <span><strong>{previa.codigo}</strong> não consta na remessa</span></div>
            ) : (
              <div className="grid sm:grid-cols-4 gap-3">
                <div><p className="text-xs text-muted-foreground">Código</p><p className="font-mono">{previa.codigo}</p></div>
                <div><p className="text-xs text-muted-foreground">Pedido (esperado)</p><p className="font-bold">{fmtNum(previa.esperado)}</p></div>
                <div><p className="text-xs text-muted-foreground">Conferido</p><p className="font-bold text-success">{fmtNum(previa.conferido)}</p></div>
                <div><p className="text-xs text-muted-foreground">Faltante</p>
                  <p className={`font-bold ${previa.faltante > 0 ? "text-destructive" : "text-success"}`}>{fmtNum(previa.faltante)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Tabela importada (com busca) */}
      <Card className="p-0 overflow-hidden border-border/50 shadow-card">
        <div className="p-4 border-b border-border bg-card flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Arquivo da Remessa</h2>
            <Badge variant="secondary">{fmtNum(itens.length)} itens</Badge>
          </div>
          <Input placeholder="Buscar produto..." value={searchItens} onChange={(e) => setSearchItens(e.target.value)} className="max-w-xs" />
        </div>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
                <TableHead className="text-right">Conferido (Σ)</TableHead>
                <TableHead className="text-right">Dif.</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensFiltrados.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">{itens.length ? "Nenhum item encontrado" : "Selecione uma remessa"}</TableCell></TableRow>
              ) : itensFiltrados.map((i) => {
                const ok = i.conferido === Number(i.qtd_esperada) && Number(i.qtd_esperada) > 0;
                const div = i.conferido !== Number(i.qtd_esperada) && i.conferido > 0;
                const dif = i.conferido - Number(i.qtd_esperada);
                return (
                  <TableRow key={i.id} className={div ? "bg-destructive/10" : ok ? "bg-success/5" : ""}>
                    <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                    <TableCell className="text-xs">{i.descricao}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(i.qtd_esperada)}</TableCell>
                    <TableCell className="text-right">
                      <CountCell value={i.conferido} highlight={ok ? "ok" : i.conferido > Number(i.qtd_esperada) ? "over" : div ? "danger" : "none"} />
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

      {/* Histórico de Conferência (com busca + apagar próprio) */}
      <Card className="p-0 overflow-hidden border-border/50 shadow-card">
        <div className="p-4 border-b border-border bg-card flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Histórico de Conferência</h2>
            <Badge variant="secondary">{fmtNum(bipagens.length)} {bipagens.length === 1 ? "registro" : "registros"}</Badge>
          </div>
          <Input placeholder="Buscar por código..." value={searchHistorico} onChange={(e) => setSearchHistorico(e.target.value)} className="max-w-xs" />
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Qtde</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bipagensFiltradas.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Nenhuma bipagem</TableCell></TableRow>
              ) : bipagensFiltradas.map((b) => {
                const naoConsta = !codigosRemessa.has(b.codigo);
                const isOwn = b.user_id === user?.id;
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
                    <TableCell className="text-right">
                      {isOwn && remessaAtual?.status === "em_conferencia" && (
                        <Button size="sm" variant="ghost" onClick={() => apagarBipagem(b.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

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
          {/* Recontar divergentes */}
          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg" variant="outline" disabled={!itensDivergentes.length}>
                <RefreshCcw className="h-4 w-4 mr-2" />
                Recontar Divergentes ({itensDivergentes.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Recontar itens divergentes</DialogTitle>
              </DialogHeader>
              <form onSubmit={recontarItem} className="grid sm:grid-cols-[1fr_120px_auto] gap-3 items-end">
                <div>
                  <Label>Código</Label>
                  <Input value={recontaCodigo} onChange={(e) => setRecontaCodigo(e.target.value)} className="mt-2 font-mono" placeholder="EAN / SKU" />
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" min={1} value={recontaQtd} onChange={(e) => setRecontaQtd(e.target.value)} className="mt-2" />
                </div>
                <Button type="submit" disabled={recontando}>
                  {recontando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
                </Button>
              </form>
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Conferido</TableHead>
                      <TableHead className="text-right">Dif.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itensDivergentes.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem divergências</TableCell></TableRow>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">
                  Ao zerar, as bipagens do item são apagadas para você conferir todo o material novamente.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={!itensDivergentes.length}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Zerar todos divergentes
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Zerar todos os itens divergentes?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Todas as bipagens dos {itensDivergentes.length} itens divergentes serão apagadas.
                        Você poderá conferir o material novamente do zero.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={zerarTodosDivergentes}>Zerar tudo</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Conferido</TableHead>
                      <TableHead className="text-right">Dif.</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itensDivergentes.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem divergências</TableCell></TableRow>
                    ) : itensDivergentes.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">
                          <button className="underline hover:text-primary" onClick={() => setRecontaCodigo(i.codigo)} type="button">{i.codigo}</button>
                        </TableCell>
                        <TableCell className="text-xs">{i.descricao}</TableCell>
                        <TableCell className="text-right">{fmtNum(i.qtd_esperada)}</TableCell>
                        <TableCell className="text-right">{fmtNum(i.conferido)}</TableCell>
                        <TableCell className="text-right"><DiffBadge value={i.conferido - Number(i.qtd_esperada)} /></TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => zerarItemParaRecontagem(i.codigo)}
                            className="text-destructive border-destructive/40 hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Zerar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>

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
