import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Eye, FileSpreadsheet, FileText, Search, Package, ScanBarcode, Archive } from "lucide-react";
import { fmtNum } from "@/lib/utils";
import { DiffBadge, CountCell } from "@/components/DiffBadge";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Remessa {
  id: string;
  numero: string;
  categoria: string;
  status: string;
  total_itens: number;
  total_qtd_esperada: number;
  recebida_em: string | null;
  created_at: string;
}

interface Item {
  id: string;
  remessa_id: string;
  codigo: string;
  descricao: string;
  qtd_esperada: number;
  qtd_conferida: number;
}

interface Bipagem {
  id: string;
  remessa_id: string;
  codigo: string;
  quantidade: number;
  user_id: string;
  created_at: string;
}

export default function Historico() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Remessa[]>([]);
  const [filtro, setFiltro] = useState("");
  const [data, setData] = useState("");
  const [verRemessa, setVerRemessa] = useState<Remessa | null>(null);
  const [verItens, setVerItens] = useState<Item[]>([]);
  const [verBipagens, setVerBipagens] = useState<Bipagem[]>([]);
  const [verSearch, setVerSearch] = useState("");
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("remessas")
      .select("*")
      .eq("status", "recebida")
      .order("recebida_em", { ascending: false });
    setItems((data ?? []) as Remessa[]);
    const { data: profs } = await supabase.from("profiles").select("user_id, display_name, email");
    const map: Record<string, string> = {};
    profs?.forEach((p) => (map[p.user_id] = p.display_name || p.email));
    setUsuarios(map);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("hist").on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!isAdmin) return <p className="text-muted-foreground">Acesso restrito.</p>;

  const abrirVer = async (r: Remessa) => {
    setVerRemessa(r);
    setVerSearch("");
    setLoadingDetalhes(true);
    const [{ data: its }, { data: bips }] = await Promise.all([
      supabase.from("remessa_itens").select("*").eq("remessa_id", r.id).order("codigo"),
      supabase.from("conferencias").select("*").eq("remessa_id", r.id).order("created_at", { ascending: false }),
    ]);
    setVerItens((its ?? []) as Item[]);
    setVerBipagens((bips ?? []) as Bipagem[]);
    setLoadingDetalhes(false);
  };

  const filtered = items.filter((r) => {
    if (filtro && !r.numero.toLowerCase().includes(filtro.toLowerCase())) return false;
    if (data && (!r.recebida_em || !r.recebida_em.startsWith(data))) return false;
    return true;
  });

  const itensFiltrados = useMemo(() => {
    if (!verSearch.trim()) return verItens;
    const q = verSearch.toLowerCase();
    return verItens.filter((i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q));
  }, [verItens, verSearch]);

  const bipagensFiltradas = useMemo(() => {
    if (!verSearch.trim()) return verBipagens;
    const q = verSearch.toLowerCase();
    return verBipagens.filter((b) => b.codigo.toLowerCase().includes(q));
  }, [verBipagens, verSearch]);

  const exportXLSX = () => {
    if (!verRemessa) return;
    const wb = XLSX.utils.book_new();

    // Resumo
    const resumo = [
      ["Remessa", verRemessa.numero],
      ["Categoria", verRemessa.categoria],
      ["Status", verRemessa.status],
      ["Recebida em", verRemessa.recebida_em ? new Date(verRemessa.recebida_em).toLocaleString("pt-BR") : "—"],
      ["Total de itens", verRemessa.total_itens],
      ["Qtd. esperada total", Number(verRemessa.total_qtd_esperada)],
    ];
    const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    // Itens
    const itensRows = [
      ["Código", "Descrição", "Qtd Esperada", "Qtd Conferida", "Diferença"],
      ...verItens.map((i) => [
        i.codigo,
        i.descricao,
        Number(i.qtd_esperada),
        Number(i.qtd_conferida),
        Number(i.qtd_conferida) - Number(i.qtd_esperada),
      ]),
    ];
    const wsItens = XLSX.utils.aoa_to_sheet(itensRows);
    XLSX.utils.book_append_sheet(wb, wsItens, "Itens da Remessa");

    // Bipagens
    const bipRows = [
      ["Data/Hora", "Código", "Quantidade", "Usuário"],
      ...verBipagens.map((b) => [
        new Date(b.created_at).toLocaleString("pt-BR"),
        b.codigo,
        Number(b.quantidade),
        usuarios[b.user_id] ?? "—",
      ]),
    ];
    const wsBip = XLSX.utils.aoa_to_sheet(bipRows);
    XLSX.utils.book_append_sheet(wb, wsBip, "Histórico de Bipagem");

    XLSX.writeFile(wb, `Remessa_${verRemessa.numero}_${verRemessa.categoria}.xlsx`);
  };

  const exportPDF = () => {
    if (!verRemessa) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Remessa ${verRemessa.numero}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Categoria: ${verRemessa.categoria}`, 14, 24);
    doc.text(`Recebida em: ${verRemessa.recebida_em ? new Date(verRemessa.recebida_em).toLocaleString("pt-BR") : "—"}`, 14, 30);
    doc.text(`Total de itens: ${verRemessa.total_itens} • Qtd esperada: ${fmtNum(Number(verRemessa.total_qtd_esperada))}`, 14, 36);

    autoTable(doc, {
      startY: 42,
      head: [["Código", "Descrição", "Esperado", "Conferido", "Dif."]],
      body: verItens.map((i) => [
        i.codigo,
        i.descricao,
        fmtNum(Number(i.qtd_esperada)),
        fmtNum(Number(i.qtd_conferida)),
        fmtNum(Number(i.qtd_conferida) - Number(i.qtd_esperada)),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
      didDrawPage: () => {
        doc.setFontSize(11);
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY ?? 60;
    doc.setFontSize(12);
    doc.text("Histórico de Bipagem", 14, finalY + 10);

    autoTable(doc, {
      startY: finalY + 14,
      head: [["Data/Hora", "Código", "Qtd", "Usuário"]],
      body: verBipagens.map((b) => [
        new Date(b.created_at).toLocaleString("pt-BR"),
        b.codigo,
        fmtNum(Number(b.quantidade)),
        usuarios[b.user_id] ?? "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`Remessa_${verRemessa.numero}_${verRemessa.categoria}.pdf`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg gradient-primary flex items-center justify-center shadow-glow">
          <Archive className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Histórico</h1>
          <p className="text-muted-foreground text-sm mt-1">Remessas arquivadas (recebidas)</p>
        </div>
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
                <TableHead className="text-right">Ações</TableHead>
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
                  <TableCell className="text-right tabular-nums">{fmtNum(Number(r.total_qtd_esperada))}</TableCell>
                  <TableCell className="text-xs">{r.recebida_em ? new Date(r.recebida_em).toLocaleString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => abrirVer(r)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!verRemessa} onOpenChange={(o) => !o && setVerRemessa(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Remessa {verRemessa?.numero}
              {verRemessa && <Badge variant="secondary">{verRemessa.categoria}</Badge>}
            </DialogTitle>
            <DialogDescription>
              Recebida em {verRemessa?.recebida_em ? new Date(verRemessa.recebida_em).toLocaleString("pt-BR") : "—"} •{" "}
              {fmtNum(verRemessa?.total_itens ?? 0)} itens • {fmtNum(Number(verRemessa?.total_qtd_esperada ?? 0))} und
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por código ou descrição..."
                value={verSearch}
                onChange={(e) => setVerSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportXLSX} disabled={loadingDetalhes}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> XLSX
              </Button>
              <Button size="sm" variant="outline" onClick={exportPDF} disabled={loadingDetalhes}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
            </div>
          </div>

          <Tabs defaultValue="itens" className="mt-2">
            <TabsList>
              <TabsTrigger value="itens" className="gap-2">
                <Package className="h-4 w-4" /> Itens da Remessa
                <Badge variant="secondary">{fmtNum(itensFiltrados.length)}</Badge>
              </TabsTrigger>
              <TabsTrigger value="bipagens" className="gap-2">
                <ScanBarcode className="h-4 w-4" /> Histórico de Bipagem
                <Badge variant="secondary">{fmtNum(bipagensFiltradas.length)}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="itens" className="mt-3">
              <div className="border border-border/50 rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Conferido</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itensFiltrados.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum item</TableCell></TableRow>
                    ) : itensFiltrados.map((i) => {
                      const dif = Number(i.qtd_conferida) - Number(i.qtd_esperada);
                      const ok = dif === 0 && Number(i.qtd_esperada) > 0;
                      const divergente = dif !== 0 && Number(i.qtd_conferida) > 0;
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                          <TableCell>{i.descricao}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(Number(i.qtd_esperada))}</TableCell>
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
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="bipagens" className="mt-3">
              <div className="border border-border/50 rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead>Usuário</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bipagensFiltradas.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhuma bipagem registrada</TableCell></TableRow>
                    ) : bipagensFiltradas.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs">{new Date(b.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="font-mono text-xs">{b.codigo}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">+{fmtNum(Number(b.quantidade))}</TableCell>
                        <TableCell className="text-xs">{usuarios[b.user_id] ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
