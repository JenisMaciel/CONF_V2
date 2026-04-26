import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Archive, Package, Search, Calendar, ScanBarcode } from "lucide-react";
import { fmtNum } from "@/lib/utils";
import { DiffBadge, CountCell } from "@/components/DiffBadge";

const CATEGORIAS = ["HISENSE", "TOSHIBA", "MULTI", "OPPO", "ZTE"] as const;

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

export default function HistoricoDevolucoes() {
  const { isAdmin } = useAuth();
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [bipagens, setBipagens] = useState<Bipagem[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeTab, setActiveTab] = useState<string>("TODAS");

  const load = async () => {
    const { data: rem } = await supabase
      .from("remessas")
      .select("*")
      .eq("status", "recebida")
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
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`historico_dev_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!isAdmin) return <p className="text-muted-foreground">Acesso restrito.</p>;

  // Filtra remessas por categoria + período + produto
  const filteredRemessas = useMemo(() => {
    return remessas.filter((r) => {
      if (activeTab !== "TODAS" && r.categoria !== activeTab) return false;
      if (dateFrom && (!r.recebida_em || r.recebida_em < dateFrom)) return false;
      if (dateTo && (!r.recebida_em || r.recebida_em > dateTo + "T23:59:59")) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        // busca no número da remessa OU em algum item OU no histórico de bipagem
        if (r.numero.toLowerCase().includes(q)) return true;
        const itensDaRemessa = itens.filter((i) => i.remessa_id === r.id);
        const matchItem = itensDaRemessa.some(
          (i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q)
        );
        if (matchItem) return true;
        const bipsDaRemessa = bipagens.filter((b) => b.remessa_id === r.id);
        return bipsDaRemessa.some((b) => b.codigo.toLowerCase().includes(q));
      }
      return true;
    });
  }, [remessas, itens, bipagens, activeTab, dateFrom, dateTo, search]);

  // Agrupa por categoria para os contadores das abas
  const countByCategoria = useMemo(() => {
    const m: Record<string, number> = { TODAS: remessas.length };
    CATEGORIAS.forEach((c) => (m[c] = remessas.filter((r) => r.categoria === c).length));
    return m;
  }, [remessas]);

  const totalItens = filteredRemessas.reduce((s, r) => s + (r.total_itens || 0), 0);
  const totalQtd = filteredRemessas.reduce((s, r) => s + Number(r.total_qtd_esperada || 0), 0);

  const itensFiltrados = (remessaId: string) => {
    const lista = itens.filter((i) => i.remessa_id === remessaId);
    if (!search.trim()) return lista;
    const q = search.toLowerCase();
    return lista.filter((i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q));
  };

  const bipagensFiltradas = (remessaId: string) => {
    const lista = bipagens.filter((b) => b.remessa_id === remessaId);
    if (!search.trim()) return lista;
    const q = search.toLowerCase();
    return lista.filter((b) => b.codigo.toLowerCase().includes(q));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg gradient-primary flex items-center justify-center shadow-glow">
          <Archive className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Histórico de Devoluções</h1>
          <p className="text-muted-foreground text-sm mt-1">Arquivo de todas as remessas recebidas, separadas por categoria</p>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4 border-border/50 shadow-card">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código, descrição ou nº da remessa..."
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
          <Button variant="outline" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}>
            Limpar
          </Button>
        </div>
      </Card>

      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5 border-border/50 shadow-card gradient-card">
          <p className="text-sm text-muted-foreground">Remessas arquivadas</p>
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

      {/* Tabs por categoria */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="TODAS" className="gap-2">
            TODAS <Badge variant="secondary">{fmtNum(countByCategoria.TODAS)}</Badge>
          </TabsTrigger>
          {CATEGORIAS.map((c) => (
            <TabsTrigger key={c} value={c} className="gap-2">
              {c} <Badge variant="secondary">{fmtNum(countByCategoria[c])}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredRemessas.length === 0 ? (
            <Card className="p-10 text-center border-border/50 shadow-card">
              <Archive className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="mt-3 text-muted-foreground">Nenhuma remessa arquivada encontrada</p>
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
                    <div className="overflow-x-auto border-t border-border/50">
                      <div className="px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/30 flex items-center gap-2">
                        <Package className="h-3.5 w-3.5" /> Itens da remessa
                        {search.trim() && itensFiltrados(r.id).length !== itens.filter((i) => i.remessa_id === r.id).length && (
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
