import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Clock, Search, TrendingUp } from "lucide-react";

const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");

const fmtDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const min = Math.floor(ms / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
};

type Row = {
  id: string;
  numero: string;
  categoria: string;
  status: string;
  origem: string | null;
  total_itens: number;
  total_qtd_esperada: number;
  conferido: number;
  created_at: string;
  conferencia_inicio: string | null;
  finalizada_em: string | null;
  duracaoMs: number | null;
  progresso: number;
};

export default function VisaoDetalhada() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: rem } = await supabase
      .from("remessas")
      .select("id, numero, categoria, status, origem, total_itens, total_qtd_esperada, created_at, conferencia_inicio, finalizada_em")
      .order("created_at", { ascending: false });

    const { data: confs } = await supabase.from("conferencias").select("remessa_id, quantidade");
    const conferidoMap = new Map<string, number>();
    (confs ?? []).forEach((c: any) => {
      conferidoMap.set(c.remessa_id, (conferidoMap.get(c.remessa_id) ?? 0) + Number(c.quantidade || 0));
    });

    const list: Row[] = (rem ?? []).map((r: any) => {
      const conferido = conferidoMap.get(r.id) ?? 0;
      const esperado = Number(r.total_qtd_esperada || 0);
      const progresso = esperado > 0 ? Math.min(100, (conferido / esperado) * 100) : (r.status === "finalizada" ? 100 : 0);
      const ini = r.conferencia_inicio ? new Date(r.conferencia_inicio).getTime() : null;
      const fim = r.finalizada_em ? new Date(r.finalizada_em).getTime() : null;
      const duracaoMs = ini && fim ? fim - ini : null;
      return { ...r, conferido, progresso, duracaoMs };
    });

    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`vd_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "remessas" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "conferencias" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      r.numero?.toLowerCase().includes(t) ||
      r.categoria?.toLowerCase().includes(t) ||
      (r.origem ?? "").toLowerCase().includes(t)
    );
  }, [rows, busca]);

  const finalizadas = rows.filter((r) => r.duracaoMs && r.duracaoMs > 0);
  const tempoMedioGeralMs = finalizadas.length
    ? finalizadas.reduce((s, r) => s + (r.duracaoMs ?? 0), 0) / finalizadas.length
    : 0;

  const emAndamento = rows.filter((r) => r.status === "em_conferencia").length;
  const totalFinalizadas = finalizadas.length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><BarChart3 className="h-7 w-7" /> Visão Detalhada</h1>
        <p className="text-muted-foreground text-sm mt-1">Resumo de cada processo, andamento e tempo médio de conferência</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="p-5 border-border/50 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Clock className="h-4 w-4" /> TEMPO MÉDIO DE CONFERÊNCIA</div>
          <p className="text-3xl font-bold mt-2 tabular-nums">{fmtDuration(tempoMedioGeralMs)}</p>
          <p className="text-xs text-muted-foreground mt-1">Baseado em {totalFinalizadas} processo(s) finalizado(s)</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><TrendingUp className="h-4 w-4" /> EM ANDAMENTO</div>
          <p className="text-3xl font-bold mt-2 tabular-nums">{emAndamento}</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><BarChart3 className="h-4 w-4" /> TOTAL DE PROCESSOS</div>
          <p className="text-3xl font-bold mt-2 tabular-nums">{rows.length}</p>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por processo, número ou origem..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden border-border/50 shadow-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Processo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recebido em</TableHead>
                <TableHead>Início conf.</TableHead>
                <TableHead>Término conf.</TableHead>
                <TableHead className="min-w-[260px]">Progresso</TableHead>
                <TableHead className="text-right">Tempo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">Nenhum processo encontrado</TableCell></TableRow>
              ) : filtered.map((r) => {
                const statusColor =
                  r.status === "finalizada" ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30"
                  : r.status === "em_conferencia" ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
                  : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.categoria}</TableCell>
                    <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                    <TableCell className="text-xs">{r.origem ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={statusColor}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs">{fmtDateTime(r.created_at)}</TableCell>
                    <TableCell className="text-xs">{fmtDateTime(r.conferencia_inicio)}</TableCell>
                    <TableCell className="text-xs">{fmtDateTime(r.finalizada_em)}</TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        <Progress value={r.progresso} className="h-2.5" />
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{r.conferido}/{r.total_qtd_esperada} ({r.progresso.toFixed(0)}%)</span>
                          <span className="font-semibold text-foreground/80 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {r.duracaoMs ? fmtDuration(r.duracaoMs) : (r.status === "em_conferencia" && r.conferencia_inicio ? fmtDuration(Date.now() - new Date(r.conferencia_inicio).getTime()) + " (em curso)" : "—")}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs font-semibold">{fmtDuration(r.duracaoMs ?? 0)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
