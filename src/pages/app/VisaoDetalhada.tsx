import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart3, Clock, Search, FileText, Calendar, User, Inbox, PlayCircle, CheckCircle2, ArrowLeft, Loader2,
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

  // Ticker em tempo real: atualiza a cada 1s enquanto estiver em conferência
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
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Detalhes do Processo</h1>
          <nav className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <button onClick={onBack} className="hover:text-foreground">Processos</button>
            <span>›</span>
            <span>Processo #{row.numero}</span>
          </nav>
        </div>
        <Button variant="outline" onClick={onBack} className="gap-2"><ArrowLeft className="h-4 w-4" /> Voltar para lista</Button>
      </div>

      {/* Cabeçalho */}
      <Card className="p-6 border-border/50 shadow-card">
        <div className="grid lg:grid-cols-[1fr_auto] gap-6">
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="flex gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xl font-bold">Processo #{row.numero}</p>
                <p className="text-sm text-muted-foreground">Tipo: {row.categoria}</p>
                <p className="text-sm text-muted-foreground">Origem: {row.origem ?? "—"}</p>
                <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">Prioridade: Normal</Badge>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline" className={statusBadgeClass(row.status)}>{statusLabel(row.status)}</Badge>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-muted-foreground text-xs">Recebido em:</p>
                  <p>{fmtDateTime(row.recebida_em)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-muted-foreground text-xs">Responsável:</p>
                  <p>{row.responsavel ?? "—"}</p>
                </div>
              </div>
            </div>
          </div>

          <Card className="bg-primary/10 border-primary/20 p-5 min-w-[260px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-primary">TEMPO TOTAL DO PROCESSO</p>
                <p className="text-4xl font-bold tabular-nums mt-2">
                  {row.duracaoTotalMs ? fmtDuration(row.duracaoTotalMs) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">De {fmtDateTime(row.recebida_em)}</p>
                <p className="text-xs text-muted-foreground">até {fmtDateTime(row.finalizada_em)}</p>
              </div>
              <Clock className="h-10 w-10 text-primary/40" />
            </div>
          </Card>
        </div>
      </Card>

      {/* Linha do tempo */}
      <Card className="p-6 border-border/50 shadow-card">
        <h2 className="font-semibold mb-6">Linha do Tempo do Processo</h2>
        {(() => {
          const nodes: Array<{
            icon: React.ReactNode;
            tone: "success" | "primary";
            title: string;
            date: string;
            description: string;
            done: boolean;
            pulsing?: boolean;
            statusLabel?: string;
          }> = [
            {
              icon: <Inbox className="h-7 w-7" />,
              tone: "success",
              title: "RECEBIMENTO",
              date: fmtDateTime(row.recebida_em),
              description: "Processo recebido no sistema",
              done: !!row.recebida_em,
            },
            {
              icon: <PlayCircle className="h-7 w-7" />,
              tone: "primary",
              title: "INÍCIO DA CONFERÊNCIA",
              date: fmtDateTime(row.conferencia_inicio),
              description: "Conferência iniciada",
              done: conferenciaIniciada,
            },
          ];
          if (emConferencia) {
            nodes.push({
              icon: <Loader2 className="h-7 w-7 animate-spin" />,
              tone: "primary",
              title: "CONFERÊNCIA EM ANDAMENTO",
              date: `Decorrido: ${fmtDuration(tempoAndamentoMs)}`,
              description: `${row.conferido}/${row.total_qtd_esperada} itens conferidos`,
              done: true,
              pulsing: true,
              statusLabel: "Em andamento",
            });
          }
          nodes.push({
            icon: <CheckCircle2 className="h-7 w-7" />,
            tone: "success",
            title: "CONFERÊNCIA FINALIZADA",
            date: fmtDateTime(row.finalizada_em),
            description: concluido ? "Conferência finalizada com sucesso" : "Aguardando finalização",
            done: concluido,
          });

          const segments: Array<{ label: string; value: string; color: "success" | "primary"; pulsing?: boolean; active: boolean }> = [];
          // segment 0: Recebimento -> Início
          segments.push({
            label: "Tempo até início",
            value: row.duracaoAteInicioMs ? fmtDuration(row.duracaoAteInicioMs) : "—",
            color: "success",
            active: conferenciaIniciada,
          });
          if (emConferencia) {
            // Início -> Em andamento
            segments.push({
              label: "Tempo decorrido",
              value: fmtDuration(tempoAndamentoMs),
              color: "primary",
              pulsing: true,
              active: true,
            });
            // Em andamento -> Finalizada
            segments.push({
              label: "",
              value: "",
              color: "primary",
              active: concluido,
            });
          } else {
            // Início -> Finalizada
            segments.push({
              label: "Tempo de conferência",
              value: row.duracaoConferenciaMs ? fmtDuration(row.duracaoConferenciaMs) : "—",
              color: "primary",
              active: concluido,
            });
          }

          return (
            <div className="flex items-start w-full">
              {nodes.map((n, i) => (
                <div key={i} className="flex items-start flex-1 last:flex-none">
                  <TimelineNode {...n} />
                  {i < nodes.length - 1 && (
                    <div className="flex-1 flex flex-col items-center min-w-0 px-2 relative" style={{ height: 64 }}>
                      <p className="text-xs text-muted-foreground">{segments[i].label}</p>
                      <p className={`text-sm font-semibold tabular-nums ${segments[i].color === "success" ? "text-success" : "text-primary"}`}>
                        {segments[i].value}
                      </p>
                      <div className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 ${
                        segments[i].active
                          ? segments[i].color === "success" ? "bg-success" : "bg-primary"
                          : "bg-border"
                      } ${segments[i].pulsing ? "animate-pulse" : ""}`} style={{ top: 32 }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </Card>

      {/* Cards inferiores */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 border-border/50 shadow-card">
          <h3 className="font-semibold mb-4">Detalhes do Tempo</h3>
          <div className="space-y-3 text-sm">
            <Row2 label="Recebido em:" value={fmtDateTime(row.recebida_em)} />
            <Row2 label="Início da conferência:" value={fmtDateTime(row.conferencia_inicio)} />
            <Row2 label="Finalização da conferência:" value={fmtDateTime(row.finalizada_em)} />
            <div className="border-t border-border/60 my-3" />
            <Row2 label="Tempo total do processo:" value={fmtDuration(row.duracaoTotalMs ?? 0)} highlight="primary" />
            <Row2 label="Tempo até início:" value={fmtDuration(row.duracaoAteInicioMs ?? 0)} highlight="success" />
            <Row2 label="Tempo de conferência:" value={fmtDuration(row.duracaoConferenciaMs ?? 0)} highlight="primary" />
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6 border-border/50 shadow-card">
            <h3 className="font-semibold mb-4">Resumo do Processo</h3>
            <div className="space-y-3 text-sm">
              <RowSplit
                label="SKUs conferidos:"
                current={row.skus_conferidos}
                total={row.total_itens}
              />
              <RowSplit
                label="Quantidade conferida:"
                current={row.conferido}
                total={row.total_qtd_esperada}
              />
              <Row2 label="Itens conferidos com sucesso:" value={fmtNum(Math.max(0, row.conferido - row.divergencias))} highlight="success" />
              <Row2 label="Itens com divergência:" value={fmtNum(row.divergencias)} highlight={row.divergencias > 0 ? "destructive" : undefined} />
              <Row2 label="Taxa de sucesso:" value={`${taxaSucesso.toFixed(0)}%`} highlight="success" />
            </div>
          </Card>

          <Card className="p-6 border-border/50 shadow-card">
            <h3 className="font-semibold mb-3">Observações</h3>
            <p className="text-sm text-muted-foreground">{row.observacao || "Nenhuma observação registrada."}</p>
          </Card>
        </div>
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

function TimelineNode({
  icon, tone, title, date, description, done, labelTop, valueTop, pulsing, statusLabel: customStatus,
}: {
  icon: React.ReactNode;
  tone: "success" | "primary";
  title: string;
  date: string;
  description: string;
  done: boolean;
  labelTop?: string;
  valueTop?: string;
  labelTopAlign?: "left" | "right";
  pulsing?: boolean;
  statusLabel?: string;
}) {
  const ring = tone === "success" ? "bg-success/15 text-success border-success/40" : "bg-primary/15 text-primary border-primary/40";
  const valueColor = tone === "success" ? "text-success" : "text-primary";
  return (
    <div className="flex flex-col items-center text-center w-[160px] shrink-0">
      <div className={`h-16 w-16 rounded-full border-2 flex items-center justify-center ${ring} ${done ? "" : "opacity-50"} ${pulsing ? "animate-pulse shadow-glow" : ""}`}>
        {icon}
      </div>
      <p className={`mt-3 text-sm font-bold tracking-wide ${done ? valueColor : "text-muted-foreground"}`}>{title}</p>
      <p className="text-xs text-muted-foreground mt-1 tabular-nums">{date}</p>
      <p className="text-xs text-muted-foreground/80 mt-0.5">{description}</p>
      <Badge variant="outline" className={`mt-2 ${pulsing ? "bg-primary/15 text-primary border-primary/30 animate-pulse" : done ? statusBadgeClass("finalizada") : "text-muted-foreground"}`}>
        {customStatus ?? (done ? "Concluído" : "Pendente")}
      </Badge>
    </div>
  );
}
