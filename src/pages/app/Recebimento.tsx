import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, ScanBarcode, AlertTriangle, CheckCircle2, ListChecks, AlertOctagon, CheckCheck, Loader2, Upload, FileSpreadsheet } from "lucide-react";
import { Link } from "react-router-dom";
import { fmtNum } from "@/lib/utils";
import { DiffBadge, CountCell } from "@/components/DiffBadge";
import { toast } from "sonner";

const ORIGENS = ["SUPER TERMINAIS", "EAD", "TORQUARTO", "TECA II", "CHIABTÃO", "OUTROS"] as const;

interface Remessa {
  id: string;
  numero: string;
  categoria: string;
  status: string;
  total_itens: number;
  total_qtd_esperada: number;
  created_at: string;
  recebido_por: string | null;
}

interface Item {
  id: string;
  codigo: string;
  descricao: string;
  qtd_esperada: number;
  qtd_conferida: number;
  recebido_por: string | null;
  recebido_em: string | null;
}



type StatusFiltro = "todos" | "ok" | "divergente" | "pendente" | "nao_consta";

export default function Recebimento() {
  const { settings } = useAppSettings();
  const { isAdmin, user } = useAuth();
  const [confirmandoTudo, setConfirmandoTudo] = useState(false);
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [selectedRemessa, setSelectedRemessa] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [processo, setProcesso] = useState("TODOS");
  const [dateFilter, setDateFilter] = useState("");
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});
  const [bipagens, setBipagens] = useState<any[]>([]);
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const selectedRef = useRef<string | null>(null);
  useEffect(() => { selectedRef.current = selectedRemessa; }, [selectedRemessa]);

  // ---- Estado da NOVA REMESSA (importação) ----
  const [novaProcesso, setNovaProcesso] = useState("");
  const [novaNumero, setNovaNumero] = useState("");
  const [novaQtdProcesso, setNovaQtdProcesso] = useState("");
  const [novaOrigem, setNovaOrigem] = useState<string>("");
  const [novaOrigemOutros, setNovaOrigemOutros] = useState("");
  const [novaDivergencia, setNovaDivergencia] = useState<"sim" | "nao">("nao");
  const [novaDivergenciaComentario, setNovaDivergenciaComentario] = useState("");
  const [novaFile, setNovaFile] = useState<File | null>(null);
  const [novaLoading, setNovaLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCriarRemessa = async () => {
    if (!novaProcesso.trim()) { toast.error("Informe o processo"); return; }
    if (!novaNumero.trim()) { toast.error("Informe o número da remessa"); return; }
    if (!novaOrigem) { toast.error("Selecione a origem"); return; }
    if (novaOrigem === "OUTROS" && !novaOrigemOutros.trim()) { toast.error("Informe a origem (Outros)"); return; }
    if (!novaFile) { toast.error("Selecione um arquivo XLSX"); return; }
    if (novaDivergencia === "sim" && !novaDivergenciaComentario.trim()) {
      toast.error("Informe o comentário da divergência"); return;
    }

    setNovaLoading(true);
    try {
      const buf = await novaFile.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
      const itensImp = rows.map((r) => {
        const codigo = String(r["CÓDIGO"] ?? r["CODIGO"] ?? r["Código"] ?? r["codigo"] ?? "").trim();
        const descricao = String(r["DESCRIÇÃO"] ?? r["DESCRICAO"] ?? r["Descrição"] ?? r["descricao"] ?? "").trim();
        const qtd = Number(r["QTDE"] ?? r["QTD"] ?? r["Qtde"] ?? r["qtd"] ?? 0);
        return { codigo, descricao, qtd };
      }).filter((i) => i.codigo);

      if (!itensImp.length) { toast.error("Planilha sem itens (cabeçalho: CÓDIGO, DESCRIÇÃO, QTDE)"); setNovaLoading(false); return; }

      const totalQtd = itensImp.reduce((s, i) => s + Number(i.qtd), 0);
      const { data: remessa, error } = await supabase.from("remessas").insert({
        numero: novaNumero.trim(),
        categoria: novaProcesso.trim().toUpperCase() as any,
        status: "aberta",
        total_itens: itensImp.length,
        total_qtd_esperada: totalQtd,
        criado_por: user?.id,
        qtd_processo: Number(novaQtdProcesso) || 0,
        origem: novaOrigem,
        origem_outros: novaOrigem === "OUTROS" ? novaOrigemOutros.trim() : null,
        divergencia_recebimento: novaDivergencia === "sim",
        divergencia_recebimento_comentario: novaDivergencia === "sim" ? novaDivergenciaComentario.trim() : null,
      } as any).select().single();
      if (error) throw error;

      const { error: e2 } = await supabase.from("remessa_itens").insert(
        itensImp.map((i) => ({ remessa_id: remessa.id, codigo: i.codigo, descricao: i.descricao, qtd_esperada: i.qtd }))
      );
      if (e2) throw e2;

      toast.success(`Remessa criada com ${itensImp.length} itens`);
      setNovaProcesso(""); setNovaNumero(""); setNovaQtdProcesso(""); setNovaOrigem("");
      setNovaOrigemOutros(""); setNovaDivergencia("nao"); setNovaDivergenciaComentario("");
      setNovaFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
      setSelectedRemessa(remessa.id);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar remessa");
    } finally {
      setNovaLoading(false);
    }
  };

  const load = async () => {
    const { data } = await supabase
      .from("remessas")
      .select("*")
      .in("status", ["aberta", "em_conferencia", "finalizada"])
      .order("created_at", { ascending: false });
    setRemessas(data ?? []);
    if (data && data.length && !selectedRemessa) setSelectedRemessa(data[0].id);

    const { data: profs } = await supabase.from("profiles").select("user_id, display_name, email");
    const map: Record<string, string> = {};
    profs?.forEach((p) => (map[p.user_id] = p.display_name || p.email));
    setUsuarios(map);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`recebimento_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessa_itens" }, (payload) => {
        const row: any = payload.new ?? payload.old;
        if (!row || row.remessa_id !== selectedRef.current) return;
        // Atualização otimista local — sem refetch
        if (payload.eventType === "INSERT") {
          setItens((prev) => prev.some((i) => i.id === row.id) ? prev : [...prev, row].sort((a, b) => a.codigo.localeCompare(b.codigo)));
        } else if (payload.eventType === "UPDATE") {
          setItens((prev) => prev.map((i) => (i.id === row.id ? { ...i, ...row } : i)));
        } else if (payload.eventType === "DELETE") {
          setItens((prev) => prev.filter((i) => i.id !== row.id));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conferencias" }, (payload) => {
        const row: any = payload.new;
        if (!row || row.remessa_id !== selectedRef.current) return;
        setBipagens((prev) => prev.some((b) => b.id === row.id) ? prev : [row, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  const loadItens = async (remessaId: string) => {
    const { data } = await supabase
      .from("remessa_itens")
      .select("*")
      .eq("remessa_id", remessaId)
      .order("codigo");
    setItens(data ?? []);
  };

  const loadBipagens = async (remessaId: string) => {
    const { data } = await supabase
      .from("conferencias")
      .select("*")
      .eq("remessa_id", remessaId)
      .order("created_at", { ascending: false });
    setBipagens(data ?? []);
  };

  useEffect(() => {
    if (selectedRemessa) { loadItens(selectedRemessa); loadBipagens(selectedRemessa); }
  }, [selectedRemessa]);

  const processosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    remessas.forEach((r) => r.categoria && set.add(r.categoria));
    return ["TODOS", ...Array.from(set).sort()];
  }, [remessas]);

  const filteredRemessas = useMemo(() => {
    return remessas.filter((r) => {
      if (processo !== "TODOS" && r.categoria !== processo) return false;
      if (dateFilter && !r.created_at.startsWith(dateFilter)) return false;
      return true;
    });
  }, [remessas, processo, dateFilter]);

  // Soma todas as bipagens por produto
  const bipagensPorCodigo = useMemo(() => {
    const map: Record<string, number> = {};
    bipagens.forEach((b) => {
      map[b.codigo] = (map[b.codigo] ?? 0) + Number(b.quantidade);
    });
    return map;
  }, [bipagens]);

  const codigosRemessa = useMemo(() => new Set(itens.map((i) => i.codigo)), [itens]);

  // Itens da remessa + bipagens "extras" (códigos que não constam)
  const itensComExtras = useMemo(() => {
    const base = itens.map((i) => ({
      ...i,
      qtd_conferida: bipagensPorCodigo[i.codigo] ?? Number(i.qtd_conferida),
      _naoConsta: false as const,
    }));
    const extras = Object.keys(bipagensPorCodigo)
      .filter((cod) => !codigosRemessa.has(cod))
      .map((cod) => ({
        id: `extra-${cod}`,
        codigo: cod,
        descricao: "PRODUTO NÃO CONSTA NA REMESSA",
        qtd_esperada: 0,
        qtd_conferida: bipagensPorCodigo[cod],
        recebido_por: null as string | null,
        recebido_em: null as string | null,
        _naoConsta: true as const,
      }));
    return [...base, ...extras];
  }, [itens, bipagensPorCodigo, codigosRemessa]);

  const filteredItens = useMemo(() => {
    let arr = itensComExtras;
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter((i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q));
    }
    if (statusFiltro !== "todos") {
      arr = arr.filter((i) => {
        if (i._naoConsta) return statusFiltro === "nao_consta";
        const ok = Number(i.qtd_conferida) === Number(i.qtd_esperada) && Number(i.qtd_esperada) > 0;
        const div = Number(i.qtd_conferida) !== Number(i.qtd_esperada) && Number(i.qtd_conferida) > 0;
        if (statusFiltro === "ok") return ok;
        if (statusFiltro === "divergente") return div;
        if (statusFiltro === "pendente") return !ok && !div;
        return true;
      });
    }
    return arr;
  }, [itensComExtras, search, statusFiltro]);

  const stats = useMemo(() => {
    const totalItens = itens.length;
    const conferidos = itensComExtras.filter((i) => !i._naoConsta && Number(i.qtd_conferida) === Number(i.qtd_esperada) && Number(i.qtd_esperada) > 0).length;
    const divergentes = itensComExtras.filter((i) => !i._naoConsta && Number(i.qtd_conferida) !== Number(i.qtd_esperada) && Number(i.qtd_conferida) > 0).length;
    const naoConsta = itensComExtras.filter((i) => i._naoConsta).length;
    const totalEsperado = itens.reduce((s, i) => s + Number(i.qtd_esperada), 0);
    const totalContado = Object.values(bipagensPorCodigo).reduce((s, n) => s + n, 0);
    return { totalItens, conferidos, divergentes, totalEsperado, totalContado, naoConsta };
  }, [itens, itensComExtras, bipagensPorCodigo]);

  const cardStyle = { backgroundColor: settings.card_bg_color, color: settings.card_text_color };

  const marcarRecebida = async (id: string) => {
    await supabase.from("remessas").update({ status: "recebida", recebida_em: new Date().toISOString() }).eq("id", id);
    setSelectedRemessa(null);
    setItens([]);
    setBipagens([]);
  };

  const confirmarTudo = async () => {
    if (!selectedRemessa || !user) return;
    const pendentes = itens
      .map((i) => ({ item: i, faltam: Number(i.qtd_esperada) - (bipagensPorCodigo[i.codigo] ?? 0) }))
      .filter((p) => p.faltam > 0);
    if (!pendentes.length) { toast.info("Nada para confirmar — todos os itens já estão completos"); return; }
    if (!confirm(`Confirmar ${pendentes.length} ite${pendentes.length === 1 ? "m" : "ns"} pendente(s) com a quantidade esperada?`)) return;

    setConfirmandoTudo(true);
    try {
      const rows = pendentes.map((p) => ({
        remessa_id: selectedRemessa,
        item_id: p.item.id,
        codigo: p.item.codigo,
        quantidade: p.faltam,
        user_id: user.id,
      }));
      const { error } = await supabase.from("conferencias").insert(rows);
      if (error) throw error;
      toast.success(`${pendentes.length} ite${pendentes.length === 1 ? "m confirmado" : "ns confirmados"} em massa`);
      await loadBipagens(selectedRemessa);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao confirmar em massa");
    } finally {
      setConfirmandoTudo(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div>
          <h1 className="text-3xl font-bold">Recebimento</h1>
          <p className="text-muted-foreground text-sm mt-1">Acompanhe os dados das remessas importadas</p>
        </div>
      </div>

      {/* NOVA REMESSA — admin */}
      {isAdmin && (
        <Card className="p-6 border-border/50 shadow-card space-y-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Nova Remessa</h2>
            <span className="text-xs text-muted-foreground">Preencha os dados antes de anexar a planilha</span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>Processo <span className="text-destructive">*</span></Label>
              <Input className="mt-2" value={novaProcesso} onChange={(e) => setNovaProcesso(e.target.value)} placeholder="Ex: HISENSE-2025-04" />
            </div>
            <div>
              <Label>Número da Remessa <span className="text-destructive">*</span></Label>
              <Input className="mt-2" value={novaNumero} onChange={(e) => setNovaNumero(e.target.value)} placeholder="Ex: 1971131351" />
            </div>
            <div>
              <Label>Qtde do Processo</Label>
              <Input className="mt-2" type="number" min={0} value={novaQtdProcesso} onChange={(e) => setNovaQtdProcesso(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Origem <span className="text-destructive">*</span></Label>
              <Select value={novaOrigem} onValueChange={setNovaOrigem}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                <SelectContent>
                  {ORIGENS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {novaOrigem === "OUTROS" && (
              <div>
                <Label>Origem (Outros) <span className="text-destructive">*</span></Label>
                <Input className="mt-2" value={novaOrigemOutros} onChange={(e) => setNovaOrigemOutros(e.target.value)} placeholder="Informe a origem" />
              </div>
            )}
            <div>
              <Label>Divergência</Label>
              <RadioGroup value={novaDivergencia} onValueChange={(v: any) => setNovaDivergencia(v)} className="flex gap-4 mt-3">
                <div className="flex items-center gap-2"><RadioGroupItem value="nao" id="div-nao" /><Label htmlFor="div-nao" className="cursor-pointer">Não</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="sim" id="div-sim" /><Label htmlFor="div-sim" className="cursor-pointer">Sim</Label></div>
              </RadioGroup>
            </div>
          </div>

          {novaDivergencia === "sim" && (
            <div>
              <Label>Comentários da divergência <span className="text-destructive">*</span></Label>
              <Textarea className="mt-2" rows={3} value={novaDivergenciaComentario} onChange={(e) => setNovaDivergenciaComentario(e.target.value)} placeholder="Descreva a divergência..." />
            </div>
          )}

          <div>
            <Label>Arquivo XLSX <span className="text-destructive">*</span></Label>
            <div className="mt-2 border-2 border-dashed border-border rounded-lg p-5 text-center hover:border-primary/50 transition-colors">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setNovaFile(e.target.files?.[0] ?? null)}
                className="hidden"
                id="nova-file-input"
              />
              <label htmlFor="nova-file-input" className="cursor-pointer block">
                <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">{novaFile ? novaFile.name : "Clique para selecionar planilha"}</p>
                <p className="text-xs text-muted-foreground mt-1">Colunas: CÓDIGO, DESCRIÇÃO, QTDE</p>
              </label>
            </div>
          </div>

          <Button onClick={handleCriarRemessa} disabled={novaLoading} className="gradient-primary text-primary-foreground shadow-glow">
            {novaLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Criar Remessa
          </Button>
        </Card>
      )}


      <div className="flex flex-wrap gap-3">
        <Select value={processo} onValueChange={setProcesso}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Processo" /></SelectTrigger>
          <SelectContent>
            {processosDisponiveis.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-[180px]" />
        <Select value={selectedRemessa ?? ""} onValueChange={setSelectedRemessa}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Selecione uma remessa" /></SelectTrigger>
          <SelectContent>
            {filteredRemessas.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.numero} • {r.categoria}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Buscar produto ou código..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 min-w-[220px]" />
      </div>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-5 border-border/50 shadow-card" style={cardStyle}>
          <div className="flex items-center gap-3"><Package className="h-5 w-5 opacity-70" /><span className="text-sm opacity-80">Total Itens</span></div>
          <p className="text-3xl font-bold mt-2 tabular-nums">
            <span>{fmtNum(stats.conferidos)}</span>
            <span className="opacity-60">/{fmtNum(stats.totalItens)}</span>
          </p>
          <div className="mt-3 h-2 w-full rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${stats.totalItens ? Math.min(100, (stats.conferidos / stats.totalItens) * 100) : 0}%`,
                background: "linear-gradient(90deg, hsl(217 91% 60%), hsl(199 89% 56%))",
              }}
            />
          </div>
        </Card>
        <Card className="p-5 border-border/50 shadow-card" style={cardStyle}>
          <div className="flex items-center gap-3"><ListChecks className="h-5 w-5 opacity-70" /><span className="text-sm opacity-80">Total Esperado</span></div>
          <p className="text-3xl font-bold mt-2">{fmtNum(stats.totalEsperado)}</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card" style={cardStyle}>
          <div className="flex items-center gap-3"><ScanBarcode className="h-5 w-5 opacity-70" /><span className="text-sm opacity-80">Total Contados</span></div>
          <p className="text-3xl font-bold mt-2">{fmtNum(stats.totalContado)}</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card" style={cardStyle}>
          <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 opacity-70" /><span className="text-sm opacity-80">Conferidos OK</span></div>
          <p className="text-3xl font-bold mt-2 text-success">{fmtNum(stats.conferidos)}</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card" style={cardStyle}>
          <div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 opacity-70" /><span className="text-sm opacity-80">Divergentes</span></div>
          <p className="text-3xl font-bold mt-2 text-destructive">{fmtNum(stats.divergentes)}</p>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden border-border/50 shadow-card">
        <div className="flex items-center justify-between p-4 border-b border-border bg-card">
          <div>
            <p className="text-sm text-muted-foreground">Remessa</p>
            <p className="font-semibold">{remessas.find((r) => r.id === selectedRemessa)?.numero ?? "—"}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button asChild variant="secondary"><Link to="/app/conferencia">Conferir</Link></Button>
            {selectedRemessa && itens.length > 0 && (
              <Button
                variant="outline"
                onClick={confirmarTudo}
                disabled={confirmandoTudo}
                className="border-success/50 text-success hover:bg-success hover:text-success-foreground"
              >
                {confirmandoTudo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-2" />}
                Confirmar Tudo
              </Button>
            )}
            {isAdmin && selectedRemessa && (
              <Button onClick={() => marcarRecebida(selectedRemessa)}>Marcar como Recebida</Button>
            )}
          </div>
        </div>

        {/* Filtros de status em botões */}
        <div className="flex flex-wrap gap-2 p-4 border-b border-border bg-card/50">
          <Button size="sm" variant={statusFiltro === "todos" ? "default" : "outline"} onClick={() => setStatusFiltro("todos")}>
            Todos ({fmtNum(itensComExtras.length)})
          </Button>
          <Button size="sm" variant={statusFiltro === "ok" ? "default" : "outline"}
            className={statusFiltro === "ok" ? "bg-success text-success-foreground hover:bg-success/90" : ""}
            onClick={() => setStatusFiltro("ok")}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> OK ({fmtNum(stats.conferidos)})
          </Button>
          <Button size="sm" variant={statusFiltro === "divergente" ? "default" : "outline"}
            className={statusFiltro === "divergente" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            onClick={() => setStatusFiltro("divergente")}>
            <AlertTriangle className="h-4 w-4 mr-1" /> Divergente ({fmtNum(stats.divergentes)})
          </Button>
          <Button size="sm" variant={statusFiltro === "pendente" ? "default" : "outline"} onClick={() => setStatusFiltro("pendente")}>
            Pendente
          </Button>
          <Button size="sm" variant={statusFiltro === "nao_consta" ? "default" : "outline"}
            className={statusFiltro === "nao_consta" ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}
            onClick={() => setStatusFiltro("nao_consta")}>
            <AlertOctagon className="h-4 w-4 mr-1" /> Não consta ({fmtNum(stats.naoConsta)})
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
                <TableHead className="text-right">Contado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead>Recebido por</TableHead>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItens.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Nenhum item</TableCell></TableRow>
              ) : (
                filteredItens.map((i) => {
                  const dif = Number(i.qtd_conferida) - Number(i.qtd_esperada);
                  const divergente = dif !== 0 && Number(i.qtd_conferida) > 0;
                  const ok = Number(i.qtd_conferida) === Number(i.qtd_esperada) && Number(i.qtd_esperada) > 0;
                  if (i._naoConsta) {
                    return (
                      <TableRow key={i.id} className="bg-warning/15 hover:bg-warning/25 border-l-4 border-warning">
                        <TableCell className="font-mono text-xs font-bold">{i.codigo}</TableCell>
                        <TableCell colSpan={2}>
                          <Badge className="bg-warning text-warning-foreground gap-1">
                            <AlertOctagon className="h-3 w-3" /> PRODUTO NÃO CONSTA NA REMESSA
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <CountCell value={Number(i.qtd_conferida)} highlight="warn" />
                        </TableCell>
                        <TableCell className="text-right">
                          <DiffBadge value={Number(i.qtd_conferida)} />
                        </TableCell>
                        <TableCell className="text-xs">—</TableCell>
                        <TableCell className="text-xs">—</TableCell>
                        <TableCell>
                          <Badge className="bg-warning text-warning-foreground">Extra</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <TableRow key={i.id} className={divergente ? "bg-destructive/10 hover:bg-destructive/15" : ""}>
                      <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                      <TableCell>{i.descricao}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(i.qtd_esperada)}</TableCell>
                      <TableCell className="text-right">
                        <CountCell
                          value={Number(i.qtd_conferida)}
                          highlight={
                            ok
                              ? "ok"
                              : Number(i.qtd_conferida) > Number(i.qtd_esperada)
                              ? "over"
                              : divergente
                              ? "danger"
                              : "none"
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <DiffBadge value={dif} />
                      </TableCell>
                      <TableCell className="text-xs">{i.recebido_por ? usuarios[i.recebido_por] ?? "—" : "—"}</TableCell>
                      <TableCell className="text-xs">{i.recebido_em ? new Date(i.recebido_em).toLocaleString("pt-BR") : "—"}</TableCell>
                      <TableCell>
                        {divergente ? <Badge variant="destructive">Divergente</Badge>
                          : ok ? <Badge className="bg-success text-success-foreground">OK</Badge>
                          : <Badge variant="secondary">Pendente</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
