import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtNum, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart3, Clock, Search, FileText, Calendar, User, Inbox, PlayCircle, CheckCircle2, ArrowLeft, Loader2,
  Copy, Activity, Box, AlertTriangle, Trophy, Printer, Plus, Download, TrendingUp, TrendingDown, FileSearch, Zap, ChevronRight,
} from "lucide-react";

const fmtDateTime = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

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
  skus_conferidos: number;
  divergencias: number;
  created_at: string;
  recebida_em: string | null;
  conferencia_inicio: string | null;
  finalizada_em: string | null;
  responsavel: string | null;
  observacao: string | null;
  duracaoTotalMs: number | null;
  duracaoAteInicioMs: number | null;
  duracaoConferenciaMs: number | null;
};

const statusLabel = (s: string) =>
  s === "finalizada" ? "CONCLUÍDO" : s === "em_conferencia" ? "EM CONFERÊNCIA" : s === "recebida" ? "RECEBIDO" : s.toUpperCase();

const statusBadgeClass = (s: string) =>
  s === "finalizada"
    ? "bg-success/15 text-success border-success/30"
    : s === "em_conferencia"
    ? "bg-primary/15 text-primary border-primary/30"
    : "bg-warning/15 text-warning border-warning/30";

export default function VisaoDetalhada() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: rem } = await supabase
      .from("remessas")
      .select("id, numero, categoria, status, origem, total_itens, total_qtd_esperada, created_at, recebida_em, conferencia_inicio, finalizada_em, criado_por, recebido_por, conferencia_divergencia_comentario")
      .order("created_at", { ascending: false });

    const { data: confs } = await supabase.from("conferencias").select("remessa_id, quantidade, user_id, codigo");
    const conferidoMap = new Map<string, number>();
    const userMap = new Map<string, string>();
    const skuSetMap = new Map<string, Set<string>>();
    (confs ?? []).forEach((c: any) => {
      conferidoMap.set(c.remessa_id, (conferidoMap.get(c.remessa_id) ?? 0) + Number(c.quantidade || 0));
      if (c.user_id) userMap.set(c.remessa_id, c.user_id);
      if (c.codigo) {
        if (!skuSetMap.has(c.remessa_id)) skuSetMap.set(c.remessa_id, new Set());
        skuSetMap.get(c.remessa_id)!.add(String(c.codigo));
      }
    });

    const { data: divs } = await supabase.from("divergencias").select("remessa_id");
    const divMap = new Map<string, number>();
    (divs ?? []).forEach((d: any) => divMap.set(d.remessa_id, (divMap.get(d.remessa_id) ?? 0) + 1));

    const userIds = Array.from(new Set([
      ...(rem ?? []).map((r: any) => r.recebido_por).filter(Boolean),
      ...Array.from(userMap.values()),
    ]));
    let profileMap = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name, email").in("user_id", userIds);
      (profs ?? []).forEach((p: any) => profileMap.set(p.user_id, p.display_name || p.email));
    }

    const list: Row[] = (rem ?? []).map((r: any) => {
      const recebido = r.recebida_em ?? r.created_at;
      const ini = r.conferencia_inicio ? new Date(r.conferencia_inicio).getTime() : null;
      const fim = r.finalizada_em ? new Date(r.finalizada_em).getTime() : null;
      const recMs = recebido ? new Date(recebido).getTime() : null;
      const responsavelId = userMap.get(r.id) ?? r.recebido_por ?? r.criado_por;
      return {
        id: r.id,
        numero: r.numero,
        categoria: r.categoria,
        status: r.status,
        origem: r.origem,
        total_itens: r.total_itens,
        total_qtd_esperada: r.total_qtd_esperada,
        conferido: conferidoMap.get(r.id) ?? 0,
        skus_conferidos: skuSetMap.get(r.id)?.size ?? 0,
        divergencias: divMap.get(r.id) ?? 0,
        created_at: r.created_at,
        recebida_em: recebido,
        conferencia_inicio: r.conferencia_inicio,
        finalizada_em: r.finalizada_em,
        responsavel: responsavelId ? profileMap.get(responsavelId) ?? null : null,
        observacao: r.conferencia_divergencia_comentario,
        duracaoTotalMs: recMs && fim ? fim - recMs : null,
        duracaoAteInicioMs: recMs && ini ? ini - recMs : null,
        duracaoConferenciaMs: ini && fim ? fim - ini : null,
      };
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
      .on("postgres_changes", { event: "*", schema: "public", table: "divergencias" }, load)
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

  const current = selected ? rows.find((r) => r.id === selected) ?? null : null;

  if (current) return <DetalheProcesso row={current} onBack={() => setSelected(null)} />;

  const finalizadas = rows.filter((r) => r.duracaoConferenciaMs && r.duracaoConferenciaMs > 0);
  const tempoMedioGeralMs = finalizadas.length
    ? finalizadas.reduce((s, r) => s + (r.duracaoConferenciaMs ?? 0), 0) / finalizadas.length
    : 0;
  const emAndamento = rows.filter((r) => r.status === "em_conferencia").length;

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
          <p className="text-xs text-muted-foreground mt-1">Baseado em {finalizadas.length} processo(s) finalizado(s)</p>
        </Card>
        <Card className="p-5 border-border/50 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><PlayCircle className="h-4 w-4" /> EM ANDAMENTO</div>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Processo</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recebido em</TableHead>
              <TableHead className="text-right">Tempo total</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Nenhum processo encontrado</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r.id)}>
                <TableCell className="font-medium">{r.categoria}</TableCell>
                <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                <TableCell className="text-xs">{r.origem ?? "—"}</TableCell>
                <TableCell><Badge variant="outline" className={statusBadgeClass(r.status)}>{statusLabel(r.status)}</Badge></TableCell>
                <TableCell className="text-xs">{fmtDateTime(r.recebida_em)}</TableCell>
                <TableCell className="text-right tabular-nums text-xs font-semibold">{fmtDuration(r.duracaoTotalMs ?? 0)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelected(r.id); }}>Ver detalhes</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function DetalheProcesso({ row, onBack }: { row: Row; onBack: () => void }) {
  const concluido = row.status === "finalizada";
  const conferenciaIniciada = !!row.conferencia_inicio;
  const emConferencia = row.status === "em_conferencia" && conferenciaIniciada && !concluido;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!emConferencia) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [emConferencia]);

  const tempoAndamentoMs = emConferencia && row.conferencia_inicio
    ? now - new Date(row.conferencia_inicio).getTime()
    : 0;

  const taxaSucesso = row.total_qtd_esperada > 0
    ? Math.max(0, Math.min(100, ((row.conferido - row.divergencias) / row.total_qtd_esperada) * 100))
    : 100;

  // SLA: 92% se concluído sem divergências, ou conforme taxa
  const slaPct = concluido ? Math.round(taxaSucesso) : Math.round(taxaSucesso);
  const slaCircumference = 2 * Math.PI * 32;
  const slaOffset = slaCircumference - (slaPct / 100) * slaCircumference;

  const copyNumero = () => navigator.clipboard?.writeText(row.numero);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
        <button onClick={onBack} className="text-primary hover:underline">Processos</button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>Detalhes do Processo</span>
      </nav>

      {/* Cabeçalho - 3 colunas + tempo total */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        <Card className="p-5 border-border/50 shadow-card">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-6 items-start">
            {/* Identificação */}
            <div className="flex gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold truncate">Processo #{row.numero}</p>
                  <button onClick={copyNumero} className="text-muted-foreground hover:text-foreground shrink-0">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">Tipo: {row.categoria}</p>
                <p className="text-sm text-muted-foreground">Origem: {row.origem ?? "—"}</p>
                <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30 mt-1">Prioridade: Normal</Badge>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="outline" className={cn("gap-1.5", statusBadgeClass(row.status))}>
                {statusLabel(row.status)}
                <span className={cn("h-2 w-2 rounded-full",
                  row.status === "finalizada" ? "bg-success" :
                  row.status === "em_conferencia" ? "bg-primary animate-pulse" : "bg-warning"
                )} />
              </Badge>
            </div>

            {/* Recebido em */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Recebido em</p>
              <div className="flex items-center gap-1.5 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{fmtDateTime(row.recebida_em)}</span>
              </div>
            </div>

            {/* Responsável */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Responsável</p>
              <div className="flex items-center gap-1.5 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{row.responsavel ?? "—"}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Tempo total card destacado */}
        <Card className="p-5 border-primary/30 bg-primary/5 shadow-card min-w-[320px]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-widest text-primary">TEMPO TOTAL DO PROCESSO</p>
              <p className="text-4xl font-bold tabular-nums mt-1">
                {row.duracaoTotalMs ? fmtDuration(row.duracaoTotalMs).replace(/\s/g, " ") : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">De {fmtDateTime(row.recebida_em)}</p>
              <p className="text-[11px] text-muted-foreground">até {fmtDateTime(row.finalizada_em)}</p>
            </div>
            {/* Donut SLA */}
            <div className="relative h-20 w-20 shrink-0">
              <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
                <circle cx="40" cy="40" r="32" stroke="hsl(var(--border))" strokeWidth="6" fill="none" />
                <circle
                  cx="40" cy="40" r="32"
                  stroke="hsl(var(--success))"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={slaCircumference}
                  strokeDashoffset={slaOffset}
                  className="transition-all"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-bold text-success">{slaPct}%</span>
              </div>
              <p className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap">Dentro do SLA</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Linha do Tempo */}
      <Card className="p-5 border-border/50 shadow-card">
        <h2 className="font-semibold mb-6 flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-primary" /> Linha do Tempo do Processo
        </h2>
        {(() => {
          const nodes = [
            {
              icon: <Inbox className="h-7 w-7" />,
              tone: "success" as const,
              title: "RECEBIMENTO",
              date: fmtDateTime(row.recebida_em),
              description: "Processo recebido no sistema",
              done: !!row.recebida_em,
            },
            {
              icon: <PlayCircle className="h-7 w-7" />,
              tone: "primary" as const,
              title: "INÍCIO DA CONFERÊNCIA",
              date: fmtDateTime(row.conferencia_inicio),
              description: "Conferência iniciada",
              done: conferenciaIniciada,
              pulsing: emConferencia,
            },
            {
              icon: <CheckCircle2 className="h-7 w-7" />,
              tone: "success" as const,
              title: "CONFERÊNCIA FINALIZADA",
              date: fmtDateTime(row.finalizada_em),
              description: concluido ? "Conferência finalizada com sucesso" : "Aguardando finalização",
              done: concluido,
            },
          ];
          const segments = [
            {
              label: "Tempo até início",
              value: row.duracaoAteInicioMs ? fmtDuration(row.duracaoAteInicioMs) : "—",
              color: "success" as const,
              active: conferenciaIniciada,
            },
            {
              label: emConferencia ? "Tempo decorrido" : "Tempo de conferência",
              value: emConferencia
                ? fmtDuration(tempoAndamentoMs)
                : (row.duracaoConferenciaMs ? fmtDuration(row.duracaoConferenciaMs) : "—"),
              color: "primary" as const,
              active: concluido || emConferencia,
              pulsing: emConferencia,
            },
          ];

          return (
            <div className="flex items-start w-full pb-2 pt-8">
              {nodes.map((n, i) => (
                <div key={i} className={cn("flex items-start", i < nodes.length - 1 ? "flex-1" : "")}>
                  <TimelineNode {...n} />
                  {i < nodes.length - 1 && (
                    <div className="flex-1 flex flex-col items-center min-w-0 px-1 relative" style={{ height: 64, marginLeft: -58, marginRight: -58 }}>
                      {/* Label acima da linha */}
                      <div className="absolute left-0 right-0 -top-7 flex flex-col items-center">
                        <p className="text-[11px] text-muted-foreground">{segments[i].label}</p>
                        <p className={cn("text-sm font-semibold tabular-nums leading-tight",
                          segments[i].color === "success" ? "text-success" : "text-primary"
                        )}>
                          {segments[i].value}
                        </p>
                      </div>
                      {/* Linha neon centralizada nos círculos (h=64, centro=32) */}
                      <div
                        className={cn(
                          "absolute left-0 right-0 h-[2px] rounded-full",
                          segments[i].active
                            ? segments[i].color === "success"
                              ? "bg-success shadow-[0_0_8px_hsl(var(--success)),0_0_16px_hsl(var(--success)/0.6)]"
                              : "bg-primary shadow-[0_0_8px_hsl(var(--primary)),0_0_16px_hsl(var(--primary)/0.6)]"
                            : "bg-border",
                          segments[i].pulsing && "animate-pulse"
                        )}
                        style={{ top: 31 }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </Card>

      {/* 3 colunas: Detalhes do Tempo | Resumo + Desempenho | Atividade */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr_1fr] gap-4">
        {/* COLUNA 1: Detalhes do Tempo */}
        <Card className="p-5 border-border/50 shadow-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" /> Detalhes do Tempo
          </h3>
          <div className="space-y-3 text-sm">
            <RowKV icon={<Calendar className="h-3.5 w-3.5" />} label="Recebido em:" value={fmtDateTime(row.recebida_em)} />
            <RowKV icon={<PlayCircle className="h-3.5 w-3.5" />} label="Início da conferência:" value={fmtDateTime(row.conferencia_inicio)} />
            <RowKV icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Finalização da conferência:" value={fmtDateTime(row.finalizada_em)} />
            <div className="border-t border-border/60 my-3" />
            <Row2 label="Tempo total do processo:" value={fmtDuration(row.duracaoTotalMs ?? 0)} highlight="primary" />
            <Row2 label="Tempo até início:" value={fmtDuration(row.duracaoAteInicioMs ?? 0)} highlight="success" />
            <Row2 label="Tempo de conferência:" value={fmtDuration(row.duracaoConferenciaMs ?? 0)} highlight="primary" />
          </div>
        </Card>

        {/* COLUNA 2: Resumo do Processo + Desempenho */}
        <div className="space-y-4">
          <Card className="p-5 border-border/50 shadow-card">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-primary" /> Resumo do Processo
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricBox
                label="SKUs conferidos"
                current={row.skus_conferidos}
                total={row.total_itens}
                icon={<Box className="h-4 w-4" />}
                color="primary"
              />
              <MetricBox
                label="Quantidade conferida"
                current={row.conferido}
                total={row.total_qtd_esperada}
                icon={<Activity className="h-4 w-4" />}
                color="success"
              />
              <MetricBox
                label="Itens com divergência"
                current={row.divergencias}
                icon={<AlertTriangle className="h-4 w-4" />}
                color={row.divergencias > 0 ? "destructive" : "warning"}
              />
              <MetricBox
                label="Taxa de sucesso"
                value={`${taxaSucesso.toFixed(0)}%`}
                icon={<Trophy className="h-4 w-4" />}
                color="purple"
              />
            </div>
            {concluido && row.divergencias === 0 && (
              <div className="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-center text-success font-medium flex items-center justify-center gap-2">
                <span>Processo concluído com sucesso!</span>
                <span>🎉</span>
              </div>
            )}
          </Card>

          <Card className="p-5 border-border/50 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-primary" /> Desempenho dos Processos
              </h3>
              <Badge variant="outline" className="text-xs">Últimos 7 dias</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <PerfCard
                label="Tempo médio"
                value="48 min"
                trend={-12}
                trendLabel="vs. período anterior"
                color="hsl(var(--primary))"
                data={[55, 52, 50, 53, 49, 47, 48]}
              />
              <PerfCard
                label="Taxa de sucesso"
                value="98,6%"
                trend={2.4}
                trendLabel="vs. período anterior"
                color="hsl(var(--success))"
                data={[96, 97, 98, 97.5, 98, 98.5, 98.6]}
              />
              <PerfCard
                label="Processos concluídos"
                value="24"
                trend={6}
                trendLabel="vs. período anterior"
                color="hsl(var(--primary))"
                data={[18, 19, 20, 22, 21, 23, 24]}
                trendIsAbsolute
              />
            </div>
          </Card>
        </div>

        {/* COLUNA 3: Atividade do Processo */}
        <Card className="p-5 border-border/50 shadow-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-primary" /> Atividade do Processo
          </h3>
          <div className="space-y-4">
            <ActivityItem
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
              title="Processo recebido"
              description="Processo importado com sucesso"
              time={row.recebida_em ? new Date(row.recebida_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
              show={!!row.recebida_em}
            />
            <ActivityItem
              icon={<PlayCircle className="h-4 w-4" />}
              tone="primary"
              title="Conferência iniciada"
              description="Início da conferência dos itens"
              time={row.conferencia_inicio ? new Date(row.conferencia_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
              show={!!row.conferencia_inicio}
            />
            <ActivityItem
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
              title="Verificações concluídas"
              description="Todos os itens conferidos"
              time={row.finalizada_em ? new Date(row.finalizada_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
              show={concluido}
            />
            <ActivityItem
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
              title="Processo finalizado"
              description="Conferência finalizada com sucesso"
              time={row.finalizada_em ? new Date(row.finalizada_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
              show={concluido}
            />
            <ActivityItem
              icon={<FileSearch className="h-4 w-4" />}
              tone="muted"
              title="Resultado"
              description={row.divergencias > 0 ? `${row.divergencias} divergência(s)` : "Nenhuma divergência encontrada"}
              time={row.finalizada_em ? new Date(row.finalizada_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
              show={concluido}
            />
          </div>
          <Button variant="outline" className="w-full mt-4 gap-2 border-primary/30 text-primary hover:bg-primary/10">
            Ver todas as atividades <ChevronRight className="h-4 w-4" />
          </Button>
        </Card>
      </div>

      {/* Rodapé: Ações rápidas + Observações */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        <Card className="p-5 border-border/50 shadow-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4 text-primary" /> Ações rápidas
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2"><Download className="h-4 w-4" /> Exportar relatório</Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={onBack}><Plus className="h-4 w-4" /> Novo processo</Button>
          </div>
        </Card>
        <Card className="p-5 border-border/50 shadow-card">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" /> Observações
          </h3>
          <p className="text-sm text-muted-foreground">{row.observacao || "Nenhuma observação registrada."}</p>
        </Card>
      </div>

      <div className="flex justify-start">
        <Button variant="ghost" onClick={onBack} className="gap-2 text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar para lista</Button>
      </div>
    </div>
  );
}

function Row2({ label, value, highlight }: { label: string; value: string; highlight?: "success" | "primary" | "destructive" }) {
  const cls =
    highlight === "success" ? "text-success font-semibold"
    : highlight === "primary" ? "text-primary font-semibold"
    : highlight === "destructive" ? "text-destructive font-semibold"
    : "font-medium";
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

function RowKV({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground flex items-center gap-1.5">{icon} {label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function MetricBox({
  label, current, total, value, icon, color,
}: {
  label: string;
  current?: number;
  total?: number;
  value?: string;
  icon: React.ReactNode;
  color: "primary" | "success" | "warning" | "destructive" | "purple";
}) {
  const palette: Record<string, { text: string; bar: string; glow: string; iconBg: string }> = {
    primary: {
      text: "text-primary",
      bar: "bg-primary",
      glow: "shadow-[0_0_20px_hsl(var(--primary)/0.5)]",
      iconBg: "bg-primary/10 text-primary",
    },
    success: {
      text: "text-success",
      bar: "bg-success",
      glow: "shadow-[0_0_20px_hsl(var(--success)/0.5)]",
      iconBg: "bg-success/10 text-success",
    },
    warning: {
      text: "text-warning",
      bar: "bg-warning",
      glow: "shadow-[0_0_20px_hsl(var(--warning)/0.5)]",
      iconBg: "bg-warning/10 text-warning",
    },
    destructive: {
      text: "text-destructive",
      bar: "bg-destructive",
      glow: "shadow-[0_0_20px_hsl(var(--destructive)/0.5)]",
      iconBg: "bg-destructive/10 text-destructive",
    },
    purple: {
      text: "text-[hsl(270_95%_70%)]",
      bar: "bg-[hsl(270_95%_65%)]",
      glow: "shadow-[0_0_20px_hsl(270_95%_65%/0.5)]",
      iconBg: "bg-[hsl(270_95%_65%/0.12)] text-[hsl(270_95%_75%)]",
    },
  };
  const p = palette[color];
  const complete = total !== undefined && current !== undefined && current >= total && total > 0;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/50 bg-card/40 p-3 pb-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
        <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md", p.iconBg)}>{icon}</span>
      </div>
      {value !== undefined ? (
        <p className={cn("text-2xl font-bold tabular-nums", p.text)}>{value}</p>
      ) : total !== undefined ? (
        <p className="text-2xl font-bold tabular-nums flex items-center gap-1.5">
          <span className={complete ? "text-success" : "text-warning"}>{fmtNum(current ?? 0)}</span>
          <span className="text-muted-foreground text-base">/{fmtNum(total)}</span>
          {complete && <CheckCircle2 className="h-4 w-4 text-success" />}
        </p>
      ) : (
        <p className={cn("text-2xl font-bold tabular-nums", p.text)}>{fmtNum(current ?? 0)}</p>
      )}
      <div className={cn("absolute left-0 right-0 bottom-0 h-[3px]", p.bar, p.glow)} />
    </div>
  );
}

function PerfCard({
  label, value, trend, trendLabel, color, data, trendIsAbsolute,
}: {
  label: string;
  value: string;
  trend: number;
  trendLabel: string;
  color: string;
  data: number[];
  trendIsAbsolute?: boolean;
}) {
  const positive = trend >= 0;
  // Build sparkline path
  const w = 100, h = 30;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3 flex flex-col">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1">{value}</p>
      <p className={cn("text-[11px] mt-0.5 flex items-center gap-1", positive ? "text-success" : "text-destructive")}>
        {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {positive ? "+" : ""}{trendIsAbsolute ? trend : `${trend}%`} <span className="text-muted-foreground">{trendLabel}</span>
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 mt-2" preserveAspectRatio="none">
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      </svg>
    </div>
  );
}

function ActivityItem({
  icon, tone, title, description, time, show,
}: {
  icon: React.ReactNode;
  tone: "success" | "primary" | "muted";
  title: string;
  description: string;
  time: string;
  show: boolean;
}) {
  const toneClass = {
    success: "bg-success/15 text-success border-success/30",
    primary: "bg-primary/15 text-primary border-primary/30",
    muted: "bg-muted text-muted-foreground border-border",
  }[tone];

  return (
    <div className={cn("flex items-start gap-3", !show && "opacity-40")}>
      <div className={cn("h-8 w-8 rounded-full border flex items-center justify-center shrink-0", toneClass)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{time}</span>
    </div>
  );
}

function TimelineNode({
  icon, tone, title, date, description, done, pulsing,
}: {
  icon: React.ReactNode;
  tone: "success" | "primary";
  title: string;
  date: string;
  description: string;
  done: boolean;
  pulsing?: boolean;
}) {
  const ring = tone === "success"
    ? "bg-success/15 text-success border-success"
    : "bg-primary/15 text-primary border-primary";
  const glow = tone === "success"
    ? "shadow-[0_0_12px_hsl(var(--success)/0.9),0_0_28px_hsl(var(--success)/0.5),inset_0_0_10px_hsl(var(--success)/0.25)]"
    : "shadow-[0_0_12px_hsl(var(--primary)/0.9),0_0_28px_hsl(var(--primary)/0.5),inset_0_0_10px_hsl(var(--primary)/0.25)]";
  const valueColor = tone === "success" ? "text-success" : "text-primary";
  return (
    <div className="flex flex-col items-center text-center w-[180px] shrink-0">
      <div className={cn(
        "h-16 w-16 rounded-full border-2 flex items-center justify-center bg-background",
        ring,
        done && glow,
        !done && "opacity-50",
        pulsing && "animate-pulse"
      )}>
        {icon}
      </div>
      <div className="mt-3 flex flex-col items-center w-full px-1 min-w-0">
        <p className={cn("text-xs font-bold tracking-wide truncate max-w-full", done ? valueColor : "text-muted-foreground")}>{title}</p>
        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums truncate max-w-full">{date}</p>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate max-w-full">{description}</p>
        <Badge variant="outline" className={cn("mt-2 text-[10px]",
          pulsing ? "bg-primary/15 text-primary border-primary/30 animate-pulse"
          : done ? "bg-success/15 text-success border-success/30"
          : "text-muted-foreground"
        )}>
          {pulsing ? "Em andamento" : done ? "Concluído" : "Pendente"}
        </Badge>
      </div>
    </div>
  );
}

