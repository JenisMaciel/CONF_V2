import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
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
import { Loader2, Upload, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";

async function excluirRemessaCascata(id: string) {
  await supabase.from("conferencias").delete().eq("remessa_id", id);
  await supabase.from("materiais_amostras").delete().eq("remessa_id", id);
  await supabase.from("remessa_itens").delete().eq("remessa_id", id);
  return supabase.from("remessas").delete().eq("id", id);
}

const ORIGENS = ["SUPER TERMINAIS", "EAD", "TORQUARTO", "TECA II", "CHIABTÃO", "OUTROS"] as const;

export default function Recebimento() {
  const { isAdmin, user } = useAuth();
  const [remessas, setRemessas] = useState<any[]>([]);

  const [novaProcesso, setNovaProcesso] = useState("");
  const [novaNumero, setNovaNumero] = useState("");
  const [novaQtdProcesso, setNovaQtdProcesso] = useState("");
  const [novaVolume, setNovaVolume] = useState("");
  const [novaOrigem, setNovaOrigem] = useState<string>("");
  const [novaOrigemOutros, setNovaOrigemOutros] = useState("");
  const [novaDivergencia, setNovaDivergencia] = useState<"sim" | "nao">("nao");
  const [novaDivergenciaComentario, setNovaDivergenciaComentario] = useState("");
  const [novaFile, setNovaFile] = useState<File | null>(null);
  const [novaLoading, setNovaLoading] = useState(false);
  const [previewItens, setPreviewItens] = useState<{ codigo: string; descricao: string; qtd: number }[]>([]);
  const [previewError, setPreviewError] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (file: File | null) => {
    setNovaFile(file);
    setPreviewItens([]);
    setPreviewError("");
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
      const itens = rows.map((r) => {
        const codigo = String(r["CÓDIGO"] ?? r["CODIGO"] ?? r["Código"] ?? r["codigo"] ?? "").trim();
        const descricao = String(r["DESCRIÇÃO"] ?? r["DESCRICAO"] ?? r["Descrição"] ?? r["descricao"] ?? "").trim();
        const qtd = Number(r["QTDE"] ?? r["QTD"] ?? r["Qtde"] ?? r["qtd"] ?? 0);
        return { codigo, descricao, qtd };
      }).filter((i) => i.codigo);
      if (!itens.length) setPreviewError("Planilha sem itens válidos (cabeçalho: CÓDIGO, DESCRIÇÃO, QTDE)");
      setPreviewItens(itens);
    } catch (e: any) {
      setPreviewError(e.message ?? "Erro ao ler planilha");
    }
  };

  const load = async () => {
    const { data } = await supabase
      .from("remessas")
      .select("id, numero, categoria, status, total_itens, total_qtd_esperada, created_at, origem")
      .order("created_at", { ascending: false })
      .limit(50);
    setRemessas(data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`recebimento_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleCriarRemessa = async () => {
    if (!novaProcesso.trim()) return toast.error("Informe o processo");
    if (!novaNumero.trim()) return toast.error("Informe o número da remessa");
    if (!novaOrigem) return toast.error("Selecione a origem");
    if (novaOrigem === "OUTROS" && !novaOrigemOutros.trim()) return toast.error("Informe a origem (Outros)");
    if (!novaFile) return toast.error("Selecione um arquivo XLSX");
    if (novaDivergencia === "sim" && !novaDivergenciaComentario.trim()) return toast.error("Informe o comentário da divergência");

    setNovaLoading(true);
    try {
      const itensImp = previewItens;
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
        volume: Number(novaVolume) || 0,
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

      toast.success(`Remessa criada com ${itensImp.length} itens — enviada ao Workflow`);
      setNovaProcesso(""); setNovaNumero(""); setNovaQtdProcesso(""); setNovaVolume(""); setNovaOrigem("");
      setNovaOrigemOutros(""); setNovaDivergencia("nao"); setNovaDivergenciaComentario("");
      setNovaFile(null); setPreviewItens([]); setPreviewError("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar remessa");
    } finally {
      setNovaLoading(false);
    }
  };

  const previewTotalQtd = previewItens.reduce((s, i) => s + Number(i.qtd || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Recebimento</h1>
        <p className="text-muted-foreground text-sm mt-1">Anexe a planilha da remessa — ela entra no Workflow para conferência</p>
      </div>

      {isAdmin && (
        <Card className="p-6 border-border/50 shadow-card space-y-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Nova Remessa</h2>
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
              <Label>Volume</Label>
              <Input className="mt-2" type="number" min={0} step="0.01" value={novaVolume} onChange={(e) => setNovaVolume(e.target.value)} placeholder="Ex: 10 (pallets, caixas, m³...)" />
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
              <input ref={fileRef} type="file" accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                className="hidden" id="nova-file-input" />
              <label htmlFor="nova-file-input" className="cursor-pointer block">
                <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">{novaFile ? novaFile.name : "Clique para selecionar planilha"}</p>
                <p className="text-xs text-muted-foreground mt-1">Colunas: CÓDIGO, DESCRIÇÃO, QTDE</p>
              </label>
            </div>
            {previewError && <p className="text-xs text-destructive mt-2">{previewError}</p>}
          </div>

          {previewItens.length > 0 && (
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <div className="p-3 bg-muted/40 border-b border-border flex flex-wrap items-center gap-3 justify-between">
                <h3 className="font-semibold text-sm">Prévia da planilha</h3>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary">Total de itens: {previewItens.length}</Badge>
                  <Badge variant="secondary">Soma de quantidades: {previewTotalQtd}</Badge>
                </div>
              </div>
              <div className="max-h-72 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-xs">#</TableHead>
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs">Descrição</TableHead>
                      <TableHead className="text-right text-xs">Qtde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewItens.map((i, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                        <TableCell className="text-xs">{i.descricao}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{i.qtd}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <Button onClick={handleCriarRemessa} disabled={novaLoading || previewItens.length === 0} className="gradient-primary text-primary-foreground shadow-glow">
            {novaLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Confirmar e Criar Remessa
          </Button>
        </Card>
      )}

      <Card className="p-0 overflow-hidden border-border/50 shadow-card">
        <div className="p-4 border-b border-border bg-card flex items-center justify-between">
          <h2 className="font-semibold">Remessas anexadas (últimas 50)</h2>
          <Badge variant="secondary">{remessas.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora anexada</TableHead>
                <TableHead>Processo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {remessas.length === 0 ? (
                <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-10">Nenhuma remessa</TableCell></TableRow>
              ) : remessas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>{r.categoria}</TableCell>
                  <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                  <TableCell className="text-xs">{r.origem ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.total_itens}</TableCell>
                  <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {r.status !== "finalizada" ? (
                        <Button size="sm" variant="ghost" title="Excluir remessa"
                          onClick={async () => {
                            if (!confirm(`Excluir remessa ${r.numero}? Essa ação não pode ser desfeita.`)) return;
                            const { error } = await excluirRemessaCascata(r.id);
                            if (error) toast.error(error.message); else { toast.success("Remessa excluída"); load(); }
                          }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
