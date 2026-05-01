import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Archive, Package, Search, Calendar, ScanBarcode, Mail, FileSpreadsheet, FileText } from "lucide-react";
import { fmtNum } from "@/lib/utils";
import { DiffBadge, CountCell } from "@/components/DiffBadge";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Remessa {
  id: string;
  numero: string;
  categoria: string;
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

interface Destinatario {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
}

export default function ProcessosConferidos() {
  const { isAdmin } = useAuth();
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [bipagens, setBipagens] = useState<Bipagem[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [produtoSearch, setProdutoSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [processoFilter, setProcessoFilter] = useState("TODOS");

  // Email
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [mailOpen, setMailOpen] = useState(false);
  const [mailRemessa, setMailRemessa] = useState<Remessa | null>(null);
  const [selectedMails, setSelectedMails] = useState<string[]>([]);
  const [extraMail, setExtraMail] = useState("");

  const load = async () => {
    const { data: rem } = await supabase
      .from("remessas")
      .select("*")
      .in("status", ["recebida", "finalizada"])
      .order("recebida_em", { ascending: false });
    setRemessas(rem ?? []);
    const ids = (rem ?? []).map((r) => r.id);
    if (ids.length) {
      const [{ data: its }, { data: bips }, { data: profs }] = await Promise.all([
        supabase.from("remessa_itens").select("*").in("remessa_id", ids),
        supabase.from("conferencias").select("*").in("remessa_id", ids).order("created_at", { ascending: false }),
        supabase.from("profiles").select("user_id, display_name, email"),
      ]);
      setItens(its ?? []);
      setBipagens(bips ?? []);
      const map: Record<string, string> = {};
      profs?.forEach((p) => (map[p.user_id] = p.display_name || p.email));
      setUsuarios(map);
    } else {
      setItens([]);
      setBipagens([]);
    }

    const { data: dests } = await supabase
      .from("email_destinatarios")
      .select("*")
      .eq("ativo", true)
      .order("nome");
    setDestinatarios((dests ?? []) as Destinatario[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`processos_conf_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  

  const processosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    remessas.forEach((r) => r.categoria && set.add(r.categoria));
    return Array.from(set).sort();
  }, [remessas]);

  const filteredRemessas = useMemo(() => {
    return remessas.filter((r) => {
      if (processoFilter !== "TODOS" && r.categoria !== processoFilter) return false;
      if (dateFrom && (!r.recebida_em || r.recebida_em < dateFrom)) return false;
      if (dateTo && (!r.recebida_em || r.recebida_em > dateTo + "T23:59:59")) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (r.numero.toLowerCase().includes(q)) return true;
        if (r.categoria?.toLowerCase().includes(q)) return true;
        const itensDaRemessa = itens.filter((i) => i.remessa_id === r.id);
        const matchItem = itensDaRemessa.some(
          (i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q)
        );
        if (matchItem) return true;
        const bipsDaRemessa = bipagens.filter((b) => b.remessa_id === r.id);
        return bipsDaRemessa.some((b) => b.codigo.toLowerCase().includes(q));
      }
      if (produtoSearch.trim()) {
        const q = produtoSearch.toLowerCase();
        const itensDaRemessa = itens.filter((i) => i.remessa_id === r.id);
        const matchItem = itensDaRemessa.some(
          (i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q)
        );
        if (matchItem) return true;
        const codigosMatch = new Set(itensDaRemessa.filter((i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q)).map((i) => i.codigo.toLowerCase()));
        const bipsDaRemessa = bipagens.filter((b) => b.remessa_id === r.id);
        return bipsDaRemessa.some((b) => b.codigo.toLowerCase().includes(q) || codigosMatch.has(b.codigo.toLowerCase()));
      }
      return true;
    });
  }, [remessas, itens, bipagens, processoFilter, dateFrom, dateTo, search, produtoSearch]);

  const totalItens = filteredRemessas.reduce((s, r) => s + (r.total_itens || 0), 0);
  const totalQtd = filteredRemessas.reduce((s, r) => s + Number(r.total_qtd_esperada || 0), 0);

  if (!isAdmin) return <p className="text-muted-foreground">Acesso restrito.</p>;

  // mapa código→descrição por remessa para casar bipagens com descrição do produto
  const itensFiltrados = (remessaId: string) => {
    const lista = itens.filter((i) => i.remessa_id === remessaId);
    const q = (produtoSearch || search).toLowerCase().trim();
    if (!q) return lista;
    return lista.filter((i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q));
  };

  const bipagensFiltradas = (remessaId: string) => {
    const lista = bipagens.filter((b) => b.remessa_id === remessaId);
    const q = (produtoSearch || search).toLowerCase().trim();
    if (!q) return lista;
    // casar por código diretamente OU por descrição do item correspondente
    const itensDaRemessa = itens.filter((i) => i.remessa_id === remessaId);
    const codigosCasados = new Set(
      itensDaRemessa
        .filter((i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q))
        .map((i) => i.codigo.toLowerCase())
    );
    return lista.filter((b) => b.codigo.toLowerCase().includes(q) || codigosCasados.has(b.codigo.toLowerCase()));
  };

  // ------ EXPORT XLSX / PDF ------
  const buildXLSX = (r: Remessa): Blob => {
    const its = itens.filter((i) => i.remessa_id === r.id);
    const bips = bipagens.filter((b) => b.remessa_id === r.id);
    const wb = XLSX.utils.book_new();
    const resumo = [
      ["Remessa", r.numero],
      ["Processo", r.categoria],
      ["Recebida em", r.recebida_em ? new Date(r.recebida_em).toLocaleString("pt-BR") : "—"],
      ["Total de itens", r.total_itens],
      ["Qtd. esperada total", Number(r.total_qtd_esperada)],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Código", "Descrição", "Qtd Esperada", "Qtd Conferida", "Diferença"],
      ...its.map((i) => [i.codigo, i.descricao, Number(i.qtd_esperada), Number(i.qtd_conferida), Number(i.qtd_conferida) - Number(i.qtd_esperada)]),
    ]), "Itens da Remessa");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Data/Hora", "Código", "Quantidade", "Usuário"],
      ...bips.map((b) => [new Date(b.created_at).toLocaleString("pt-BR"), b.codigo, Number(b.quantidade), usuarios[b.user_id] ?? "—"]),
    ]), "Histórico de Bipagem");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  };

  const downloadXLSX = (r: Remessa) => {
    const blob = buildXLSX(r);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Processo_${r.categoria}_Remessa_${r.numero}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  };

  const downloadPDF = (r: Remessa) => {
    const its = itens.filter((i) => i.remessa_id === r.id);
    const bips = bipagens.filter((b) => b.remessa_id === r.id);
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(`Remessa ${r.numero}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Processo: ${r.categoria}`, 14, 24);
    doc.text(`Recebida em: ${r.recebida_em ? new Date(r.recebida_em).toLocaleString("pt-BR") : "—"}`, 14, 30);
    doc.text(`Total de itens: ${r.total_itens} • Qtd esperada: ${fmtNum(Number(r.total_qtd_esperada))}`, 14, 36);
    autoTable(doc, {
      startY: 42,
      head: [["Código", "Descrição", "Esperado", "Conferido", "Dif."]],
      body: its.map((i) => [i.codigo, i.descricao, fmtNum(Number(i.qtd_esperada)), fmtNum(Number(i.qtd_conferida)), fmtNum(Number(i.qtd_conferida) - Number(i.qtd_esperada))]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [37, 99, 235] },
    });
    const finalY = (doc as any).lastAutoTable.finalY ?? 60;
    doc.setFontSize(12); doc.text("Histórico de Bipagem", 14, finalY + 10);
    autoTable(doc, {
      startY: finalY + 14,
      head: [["Data/Hora", "Código", "Qtd", "Usuário"]],
      body: bips.map((b) => [new Date(b.created_at).toLocaleString("pt-BR"), b.codigo, fmtNum(Number(b.quantidade)), usuarios[b.user_id] ?? "—"]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`Processo_${r.categoria}_Remessa_${r.numero}.pdf`);
  };

  // ------ EMAIL (mailto) ------
  const abrirEnvioEmail = (r: Remessa) => {
    setMailRemessa(r);
    setSelectedMails(destinatarios.map((d) => d.email));
    setExtraMail("");
    setMailOpen(true);
  };

  const enviarEmail = () => {
    if (!mailRemessa) return;
    const extras = extraMail.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes("@"));
    const todos = Array.from(new Set([...selectedMails, ...extras]));
    if (!todos.length) {
      toast.error("Selecione pelo menos um destinatário ou digite um e-mail");
      return;
    }
    const r = mailRemessa;
    const its = itens.filter((i) => i.remessa_id === r.id);
    const divergentes = its.filter((i) => Number(i.qtd_conferida) !== Number(i.qtd_esperada));
    const subject = `Processo Conferido — ${r.categoria} • Remessa ${r.numero}`;
    const linhas = [
      `Olá,`,
      ``,
      `Segue o resumo do processo conferido:`,
      ``,
      `• Processo: ${r.categoria}`,
      `• Remessa: ${r.numero}`,
      `• Recebida em: ${r.recebida_em ? new Date(r.recebida_em).toLocaleString("pt-BR") : "—"}`,
      `• Total de itens: ${r.total_itens}`,
      `• Qtd. esperada: ${fmtNum(Number(r.total_qtd_esperada))}`,
      `• Itens divergentes: ${divergentes.length}`,
      ``,
      `O arquivo completo (XLSX/PDF) deve ser anexado manualmente — clique em "Baixar XLSX" ou "Baixar PDF" antes de enviar.`,
      ``,
      `--`,
      `Sistema de Conferência de Devolução`,
    ];
    const body = encodeURIComponent(linhas.join("\n"));
    const to = encodeURIComponent(todos.join(","));
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${body}`;
    toast.success("Cliente de e-mail aberto. Lembre-se de anexar o arquivo.");
    setMailOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg gradient-primary flex items-center justify-center shadow-glow">
          <Archive className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Processos Conferidos</h1>
          <p className="text-muted-foreground text-sm mt-1">Arquivo de todos os processos finalizados e recebidos</p>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4 border-border/50 shadow-card space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código, descrição, processo ou nº da remessa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
            <span className="text-muted-foreground text-sm">até</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
          </div>
          <Button variant="outline" onClick={() => { setSearch(""); setProdutoSearch(""); setDateFrom(""); setDateTo(""); setProcessoFilter("TODOS"); }}>
            Limpar
          </Button>
        </div>
        <div className="relative">
          <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
          <Input
            placeholder="🔎 Pesquisar produto / descrição (filtra itens da remessa e do histórico de conferência)..."
            value={produtoSearch}
            onChange={(e) => setProdutoSearch(e.target.value)}
            className="pl-9 border-primary/40 focus-visible:ring-primary"
          />
        </div>
      </Card>

      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5 border-border/50 shadow-card gradient-card">
          <p className="text-sm text-muted-foreground">Processos arquivados</p>
          <p className="text-3xl font-bold mt-2">{fmtNum(filteredRemessas.length)}</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card gradient-card">
          <p className="text-sm text-muted-foreground">Total de itens</p>
          <p className="text-3xl font-bold mt-2">{fmtNum(totalItens)}</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card gradient-card">
          <p className="text-sm text-muted-foreground">Qtd. acumulada</p>
          <p className="text-3xl font-bold mt-2">{fmtNum(totalQtd)}</p>
        </Card>
      </div>

      {/* Filtro por processo (chips) */}
      {processosDisponiveis.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={processoFilter === "TODOS" ? "default" : "outline"}
            onClick={() => setProcessoFilter("TODOS")}
          >
            TODOS <Badge variant="secondary" className="ml-2">{remessas.length}</Badge>
          </Button>
          {processosDisponiveis.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={processoFilter === p ? "default" : "outline"}
              onClick={() => setProcessoFilter(p)}
            >
              {p} <Badge variant="secondary" className="ml-2">{remessas.filter((r) => r.categoria === p).length}</Badge>
            </Button>
          ))}
        </div>
      )}

      {filteredRemessas.length === 0 ? (
        <Card className="p-10 text-center border-border/50 shadow-card">
          <Archive className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">Nenhum processo arquivado encontrado</p>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {filteredRemessas.map((r) => (
            <AccordionItem key={r.id} value={r.id} className="border border-border/50 rounded-lg bg-card shadow-card overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
                <div className="flex flex-1 items-center gap-3 text-left">
                  <Package className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{r.numero}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.recebida_em ? new Date(r.recebida_em).toLocaleString("pt-BR") : "—"}
                    </p>
                  </div>
                  <Badge variant="secondary">{r.categoria}</Badge>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {fmtNum(r.total_itens)} itens • {fmtNum(r.total_qtd_esperada)} und
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0">
                {/* Ações */}
                <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-border/50 bg-muted/20">
                  <Button size="sm" variant="outline" onClick={() => downloadXLSX(r)}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" /> Baixar XLSX
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPDF(r)}>
                    <FileText className="h-4 w-4 mr-1" /> Baixar PDF
                  </Button>
                  <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => abrirEnvioEmail(r)}>
                    <Mail className="h-4 w-4 mr-1" /> Enviar por e-mail
                  </Button>
                </div>

                <div className="overflow-x-auto border-t border-border/50">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/30 flex items-center gap-2">
                    <Package className="h-3.5 w-3.5" /> Itens da remessa
                    {(search.trim() || produtoSearch.trim()) && itensFiltrados(r.id).length !== itens.filter((i) => i.remessa_id === r.id).length && (
                      <Badge variant="outline" className="ml-1">filtrado</Badge>
                    )}
                  </div>
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
                      {itensFiltrados(r.id).length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum item</TableCell></TableRow>
                      ) : itensFiltrados(r.id).map((i) => {
                        const dif = Number(i.qtd_conferida) - Number(i.qtd_esperada);
                        const ok = dif === 0 && Number(i.qtd_esperada) > 0;
                        const divergente = dif !== 0 && Number(i.qtd_conferida) > 0;
                        return (
                          <TableRow key={i.id}>
                            <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                            <TableCell>{i.descricao}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtNum(i.qtd_esperada)}</TableCell>
                            <TableCell className="text-right">
                              <CountCell
                                value={Number(i.qtd_conferida)}
                                highlight={
                                  ok ? "ok"
                                    : Number(i.qtd_conferida) > Number(i.qtd_esperada) ? "over"
                                    : divergente ? "danger" : "none"
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

                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/30 border-t border-border/50 flex items-center gap-2">
                    <ScanBarcode className="h-3.5 w-3.5" /> Histórico de bipagem
                    <Badge variant="outline" className="ml-1">{fmtNum(bipagensFiltradas(r.id).length)}</Badge>
                  </div>
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
                      {bipagensFiltradas(r.id).length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhuma bipagem registrada</TableCell></TableRow>
                      ) : bipagensFiltradas(r.id).map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="text-xs">{new Date(b.created_at).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="font-mono text-xs">{b.codigo}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">+{fmtNum(b.quantidade)}</TableCell>
                          <TableCell className="text-xs">{usuarios[b.user_id] ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Dialog de envio por e-mail */}
      <Dialog open={mailOpen} onOpenChange={setMailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> Enviar por e-mail</DialogTitle>
            <DialogDescription>
              Selecione os destinatários. O cliente de e-mail será aberto com o resumo já preenchido —
              <strong> baixe o XLSX/PDF antes e anexe ao e-mail.</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {destinatarios.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum destinatário cadastrado. Vá em <strong>Configurações → Destinatários de E-mail</strong> para cadastrar.
              </p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto border border-border rounded-md p-3">
                {destinatarios.map((d) => (
                  <label key={d.id} className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={selectedMails.includes(d.email)}
                      onCheckedChange={(v) => {
                        setSelectedMails((prev) => v ? Array.from(new Set([...prev, d.email])) : prev.filter((e) => e !== d.email));
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{d.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground mb-1">Adicionar outros e-mails (separe por vírgula)</p>
              <Input
                value={extraMail}
                onChange={(e) => setExtraMail(e.target.value)}
                placeholder="exemplo@empresa.com, outro@empresa.com"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-wrap gap-2">
            {mailRemessa && (
              <>
                <Button variant="outline" onClick={() => downloadXLSX(mailRemessa)}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" /> Baixar XLSX
                </Button>
                <Button variant="outline" onClick={() => downloadPDF(mailRemessa)}>
                  <FileText className="h-4 w-4 mr-1" /> Baixar PDF
                </Button>
              </>
            )}
            <Button onClick={enviarEmail} className="gradient-primary text-primary-foreground">
              <Mail className="h-4 w-4 mr-1" /> Abrir e-mail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
