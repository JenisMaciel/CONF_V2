import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, ScanBarcode, AlertTriangle, CheckCircle2, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";

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

const categorias = ["TODAS", "HISENSE", "TOSHIBA", "MULTI", "OPPO", "ZTE"];

export default function Recebimento() {
  const { settings } = useAppSettings();
  const { isAdmin } = useAuth();
  const [remessas, setRemessas] = useState<Remessa[]>([]);
  const [selectedRemessa, setSelectedRemessa] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("TODAS");
  const [dateFilter, setDateFilter] = useState("");
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});

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
      .channel("recebimento")
      .on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessa_itens" }, () => selectedRemessa && loadItens(selectedRemessa))
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

  useEffect(() => {
    if (selectedRemessa) loadItens(selectedRemessa);
  }, [selectedRemessa]);

  const filteredRemessas = useMemo(() => {
    return remessas.filter((r) => {
      if (categoria !== "TODAS" && r.categoria !== categoria) return false;
      if (dateFilter && !r.created_at.startsWith(dateFilter)) return false;
      return true;
    });
  }, [remessas, categoria, dateFilter]);

  const filteredItens = useMemo(() => {
    if (!search) return itens;
    const q = search.toLowerCase();
    return itens.filter((i) => i.codigo.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q));
  }, [itens, search]);

  const stats = useMemo(() => {
    const totalItens = itens.length;
    const conferidos = itens.filter((i) => i.qtd_conferida >= i.qtd_esperada && i.qtd_esperada > 0).length;
    const divergentes = itens.filter((i) => i.qtd_conferida !== i.qtd_esperada && i.qtd_conferida > 0).length;
    const totalEsperado = itens.reduce((s, i) => s + Number(i.qtd_esperada), 0);
    const totalContado = itens.reduce((s, i) => s + Number(i.qtd_conferida), 0);
    return { totalItens, conferidos, divergentes, totalEsperado, totalContado };
  }, [itens]);

  const cardStyle = { backgroundColor: settings.card_bg_color, color: settings.card_text_color };

  const marcarRecebida = async (id: string) => {
    await supabase.from("remessas").update({ status: "recebida", recebida_em: new Date().toISOString() }).eq("id", id);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end gap-4 justify-between">
        <div>
          <h1 className="text-3xl font-bold">Recebimento</h1>
          <p className="text-muted-foreground text-sm mt-1">Acompanhe os dados das remessas importadas</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
          <p className="text-3xl font-bold mt-2">{stats.totalItens}</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card" style={cardStyle}>
          <div className="flex items-center gap-3"><ListChecks className="h-5 w-5 opacity-70" /><span className="text-sm opacity-80">Total Esperado</span></div>
          <p className="text-3xl font-bold mt-2">{stats.totalEsperado}</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card" style={cardStyle}>
          <div className="flex items-center gap-3"><ScanBarcode className="h-5 w-5 opacity-70" /><span className="text-sm opacity-80">Total Contados</span></div>
          <p className="text-3xl font-bold mt-2">{stats.totalContado}</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card" style={cardStyle}>
          <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 opacity-70" /><span className="text-sm opacity-80">Conferidos OK</span></div>
          <p className="text-3xl font-bold mt-2 text-success">{stats.conferidos}</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card" style={cardStyle}>
          <div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 opacity-70" /><span className="text-sm opacity-80">Divergentes</span></div>
          <p className="text-3xl font-bold mt-2 text-destructive">{stats.divergentes}</p>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden border-border/50 shadow-card">
        <div className="flex items-center justify-between p-4 border-b border-border bg-card">
          <div>
            <p className="text-sm text-muted-foreground">Remessa</p>
            <p className="font-semibold">{remessas.find((r) => r.id === selectedRemessa)?.numero ?? "—"}</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary"><Link to="/app/conferencia">Conferir</Link></Button>
            {isAdmin && selectedRemessa && (
              <Button onClick={() => marcarRecebida(selectedRemessa)}>Marcar como Recebida</Button>
            )}
          </div>
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
                  return (
                    <TableRow key={i.id} className={divergente ? "bg-destructive/10 hover:bg-destructive/15" : ""}>
                      <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                      <TableCell>{i.descricao}</TableCell>
                      <TableCell className="text-right">{i.qtd_esperada}</TableCell>
                      <TableCell className="text-right font-semibold">{i.qtd_conferida}</TableCell>
                      <TableCell className={`text-right font-semibold ${dif < 0 ? "text-destructive" : dif > 0 ? "text-warning" : ""}`}>
                        {dif > 0 ? `+${dif}` : dif}
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
