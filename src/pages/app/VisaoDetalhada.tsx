import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Activity, Archive, ArrowRight, BarChart3, Box, Calendar, Check, CheckCircle2, ChevronRight,
  Clock, Copy, Download, FileText, Mail, PlayCircle, PlusCircle, Printer, Search,
  Trophy, User, Zap,
} from "lucide-react";
import timelineForklift from "@/assets/timeline-forklift.png";
import timelineScanner from "@/assets/timeline-scanner.png";
import timelineShelf from "@/assets/timeline-shelf.png";
import timelineGridBoxes from "@/assets/timeline-grid-boxes.png";

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

/* ============================ DETALHE DO PROCESSO ============================ */

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

  const totalLabel = row.duracaoTotalMs ? fmtDuration(row.duracaoTotalMs) : (emConferencia ? fmtDuration(tempoAndamentoMs) : "—");
  const ateInicioLabel = row.duracaoAteInicioMs ? fmtDuration(row.duracaoAteInicioMs) : "—";
  const conferenciaLabel = row.duracaoConferenciaMs ? fmtDuration(row.duracaoConferenciaMs) : "—";
  const copyNumero = () => navigator.clipboard?.writeText(row.numero);

  return (
    <main className="min-h-screen w-full overflow-hidden bg-background text-foreground animate-fade-in">
      <div className="grid h-[100dvh] min-h-[720px] max-h-[960px] min-w-0 grid-rows-[183px_306px_minmax(0,1fr)] gap-[10px] p-[8px_8px_10px]">
        <HeroPanel row={row} totalLabel={totalLabel} taxaSucesso={taxaSucesso} copyNumero={copyNumero} />

        <TimelinePanel
          row={row}
          ateInicioLabel={ateInicioLabel}
          conferenciaLabel={conferenciaLabel}
          conferenciaIniciada={conferenciaIniciada}
          concluido={concluido}
        />

        <section className="grid min-h-0 min-w-0 grid-cols-[29%_44%_minmax(0,1fr)] gap-[12px]">
          <TimeDetailsCard
            row={row}
            totalLabel={totalLabel}
            ateInicioLabel={ateInicioLabel}
            conferenciaLabel={conferenciaLabel}
          />

          <CenterMetricsAndChart row={row} taxaSucesso={taxaSucesso} />

          <ObservationsAndLogPanel row={row} concluido={concluido} conferenciaIniciada={conferenciaIniciada} onBack={onBack} />
        </section>
      </div>
    </main>
  );
}

/* ============================ CENTRO INFERIOR (métricas + gráfico) ============================ */

function CenterMetricsAndChart({ row, taxaSucesso }: { row: Row; taxaSucesso: number }) {
  const taxa = Math.round(taxaSucesso || 100);
  const skus = row.skus_conferidos || row.total_itens || 7;
  const totalSkus = row.total_itens || 7;
  return (
    <Panel className="relative min-h-0 min-w-0 overflow-hidden p-[14px]">
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-[10px]">
        <div className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_90px] items-center gap-[14px]">
          <CircularPct value={taxa} />
          <MiniMetric label="Quantidade conferida" value="" bars />
          <MiniMetric label="SKUs conferidos" value={`${skus}/${totalSkus}`} bars2 />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-muted-foreground leading-none">Divergência</p>
            <p className="mt-[10px] text-[28px] font-black leading-none text-primary tabular-nums drop-shadow-[0_0_8px_hsl(var(--primary)/0.55)]">({row.divergencias || 0})</p>
          </div>
        </div>

        <ComparativoChart numeroAtual={row.numero} />
      </div>
    </Panel>
  );
}

function CircularPct({ value }: { value: number }) {
  const c = 2 * Math.PI * 38;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-[100px] w-[100px]">
      <div className="absolute inset-0 rounded-full bg-primary/15 blur-md" />
      <svg viewBox="0 0 100 100" className="relative h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="38" fill="none" stroke="hsl(var(--primary) / 0.18)" strokeWidth="9" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} style={{ filter: "drop-shadow(0 0 8px hsl(var(--primary) / 0.9))" }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[20px] font-black text-primary tabular-nums">{v}%</span>
    </div>
  );
}

function MiniMetric({ label, value, bars, bars2 }: { label: string; value: string; bars?: boolean; bars2?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-semibold text-muted-foreground leading-none truncate">{label}</p>
      {value && <p className="mt-[6px] text-[18px] font-black leading-none tabular-nums text-foreground">{value}</p>}
      {bars && (
        <div className="mt-[8px] flex items-end gap-[5px] h-[42px]">
          {[60, 80, 95, 70, 50].map((h, i) => {
            const colors = ["hsl(var(--muted-foreground)/0.55)", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--accent))", "hsl(var(--primary))"];
            return <div key={i} className="w-[10px] rounded-sm" style={{ height: `${h}%`, background: colors[i], boxShadow: `0 0 6px ${colors[i]}` }} />;
          })}
        </div>
      )}
      {bars2 && (
        <div className="mt-[8px] flex items-end gap-[3px] h-[36px]">
          {[20, 30, 25, 45, 40, 60, 55, 75, 70, 85, 80, 95].map((h, i) => (
            <div key={i} className="w-[5px] rounded-sm" style={{ height: `${h}%`, background: i < 4 ? "hsl(var(--primary)/0.7)" : "hsl(var(--accent))", boxShadow: "0 0 5px hsl(var(--accent)/0.7)" }} />
          ))}
        </div>
      )}
    </div>
  );
}

function ComparativoChart({ numeroAtual }: { numeroAtual: string }) {
  const w = 560;
  const h = 200;
  const padL = 40, padR = 16, padT = 22, padB = 30;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  // Curvas (% eficiência ao longo do tempo)
  const atual = [5, 60, 88, 96, 99, 100, 100, 100, 100, 100, 100, 100];
  const anterior = [4, 35, 55, 50, 70, 80, 60, 50, 45, 60, 35, 5];
  const xs = (i: number, len: number) => padL + (i / (len - 1)) * innerW;
  const ys = (v: number) => padT + (1 - v / 100) * innerH;
  const toPath = (arr: number[]) => {
    const pts = arr.map((v, i) => ({ x: xs(i, arr.length), y: ys(v) }));
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const t = 0.22;
      d += ` C ${p1.x + (p2.x - p0.x) * t},${p1.y + (p2.y - p0.y) * t} ${p2.x - (p3.x - p1.x) * t},${p2.y - (p3.y - p1.y) * t} ${p2.x},${p2.y}`;
    }
    return d;
  };
  const yLabels = [0, 20, 40, 60, 80, 100];
  const xLabels = ["0", "5min", "10min", "15min", "20min", "25min", "30min", "35min", "40min", "45min", "50min", "55min"];

  return (
    <div className="relative min-h-0 min-w-0 rounded-md border border-border/40 bg-background/30 p-[8px] overflow-hidden">
      <div className="text-center text-[11px] font-bold tracking-wide">
        <span className="text-muted-foreground">COMPARATIVO DE DESEMPENHO: </span>
        <span className="text-primary-glow drop-shadow-[0_0_6px_hsl(var(--primary-glow))]">ATUAL</span>
        <span className="text-muted-foreground"> vs. </span>
        <span className="text-accent drop-shadow-[0_0_6px_hsl(var(--accent))]">ANTERIOR</span>
        <span className="text-accent ml-1">PROCESSO ANTERIOR (#{Number(numeroAtual) - 1 || "15164946463"})</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[calc(100%-22px)]">
        <defs>
          <pattern id="grid" width={innerW / 11} height={innerH / 5} patternUnits="userSpaceOnUse" x={padL} y={padT}>
            <path d={`M ${innerW / 11} 0 L 0 0 0 ${innerH / 5}`} fill="none" stroke="hsl(var(--primary) / 0.12)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={padL} y={padT} width={innerW} height={innerH} fill="url(#grid)" />
        {/* Eixo Y */}
        {yLabels.map((v) => (
          <g key={v}>
            <line x1={padL} y1={ys(v)} x2={w - padR} y2={ys(v)} stroke="hsl(var(--border) / 0.3)" strokeWidth="0.5" />
            <text x={padL - 5} y={ys(v) + 3} fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="end">{v}%</text>
          </g>
        ))}
        {/* Eixo X */}
        {xLabels.map((label, i) => (
          <text key={i} x={xs(i, xLabels.length)} y={h - padB + 12} fontSize="7" fill="hsl(var(--muted-foreground))" textAnchor="middle">{label}</text>
        ))}
        <text x={6} y={h / 2} fontSize="8" fill="hsl(var(--muted-foreground))" transform={`rotate(-90 6 ${h / 2})`} textAnchor="middle">Eficiência (%)</text>
        <text x={w / 2} y={h - 4} fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="middle">Tempo de Execução (min)</text>

        {/* Linha ANTERIOR (rosa) */}
        <path d={toPath(anterior)} fill="none" stroke="hsl(var(--accent))" strokeWidth="2" style={{ filter: "drop-shadow(0 0 4px hsl(var(--accent) / 0.9))" }} />
        {anterior.map((v, i) => (
          <circle key={i} cx={xs(i, anterior.length)} cy={ys(v)} r="2" fill="hsl(var(--accent))" style={{ filter: "drop-shadow(0 0 3px hsl(var(--accent)))" }} />
        ))}
        {/* Linha ATUAL (cyan/azul neon) */}
        <path d={toPath(atual)} fill="none" stroke="hsl(var(--primary-glow))" strokeWidth="2.2" style={{ filter: "drop-shadow(0 0 5px hsl(var(--primary-glow) / 0.95))" }} />
        {atual.map((v, i) => (
          <circle key={i} cx={xs(i, atual.length)} cy={ys(v)} r="2.2" fill="hsl(var(--primary-glow))" style={{ filter: "drop-shadow(0 0 4px hsl(var(--primary-glow)))" }} />
        ))}

        {/* Labels nas curvas */}
        <text x={xs(6, atual.length)} y={ys(100) - 6} fontSize="9" fill="hsl(var(--primary-glow))" textAnchor="middle" fontWeight="bold">PROCESSO ATUAL</text>
        <text x={xs(6, atual.length)} y={ys(100) + 4} fontSize="7" fill="hsl(var(--primary-glow))" textAnchor="middle">(#{numeroAtual})</text>
        <text x={xs(7, anterior.length)} y={ys(50) + 14} fontSize="9" fill="hsl(var(--accent))" textAnchor="middle" fontWeight="bold">PROCESSO ANTERIOR</text>
        <text x={xs(7, anterior.length)} y={ys(50) + 24} fontSize="7" fill="hsl(var(--accent))" textAnchor="middle">(#{Number(numeroAtual) - 1 || "15164946463"})</text>
      </svg>
    </div>
  );
}

/* ============================ DIREITA INFERIOR (Observações + Log) ============================ */

function ObservationsAndLogPanel({ row, concluido, conferenciaIniciada, onBack }: { row: Row; concluido: boolean; conferenciaIniciada: boolean; onBack: () => void }) {
  const logs = [
    { time: "01:06:13", title: "Scanning SKUR123", desc: "Scanning Ser SKUK123" },
    { time: "01:06:23", title: "Batch Approval", desc: "Divergencz onhet complete complete" },
    { time: "01:05:23", title: "Scanning SKU8123", desc: "Secnning B-UK125" },
    { time: "01:05:23", title: "Batch Approval", desc: "Secnning B-UK125" },
  ];
  return (
    <Panel className="min-h-0 min-w-0 overflow-hidden p-[14px] flex flex-col">
      <SectionTitle icon={<FileText className="h-[16px] w-[16px] text-primary" />} title="Observações & Log Recente" />
      <div className="mt-[10px] rounded-md border border-border/40 bg-background/30 p-[10px] text-[12px] text-muted-foreground min-h-[48px]">
        {row.observacao || "Nenhuma observação registrada."}
      </div>

      <div className="mt-[12px] flex items-center gap-2">
        <h4 className="text-[14px] font-black text-foreground">Log Recente:</h4>
      </div>

      <div className="mt-[8px] flex-1 min-h-0 overflow-auto pr-1 space-y-[8px]">
        {logs.map((l, i) => (
          <div key={i} className="grid grid-cols-[60px_minmax(0,1fr)] gap-[8px] items-start">
            <span className="text-[10px] tabular-nums text-muted-foreground pt-[2px]">{l.time}</span>
            <div className="min-w-0">
              <p className="text-[12px] font-bold leading-tight text-primary-glow drop-shadow-[0_0_4px_hsl(var(--primary-glow)/0.7)] truncate">{l.title}</p>
              <p className="text-[10px] text-muted-foreground leading-tight truncate">{l.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-[10px] flex gap-[6px]">
        <button onClick={onBack} className="flex-1 h-[28px] rounded-md border border-border/60 bg-background/30 px-2 text-[11px] font-semibold text-foreground hover:bg-primary/10">Voltar</button>
        <button className="h-[28px] rounded-md border border-primary/45 bg-primary/10 px-3 text-[11px] font-semibold text-primary hover:bg-primary/20 inline-flex items-center gap-1">
          <Download className="h-3 w-3" /> Exportar
        </button>
      </div>
    </Panel>
  );
}

function HeroPanel({ row, totalLabel, taxaSucesso, copyNumero }: { row: Row; totalLabel: string; taxaSucesso: number; copyNumero: () => void }) {
  return (
    <Panel className="relative min-w-0 overflow-hidden p-[18px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_32%,hsl(var(--primary)/0.20),transparent_34%),radial-gradient(circle_at_92%_70%,hsl(var(--success)/0.14),transparent_24%)]" />
      <div className="relative z-10 grid h-full min-w-0 grid-cols-[minmax(320px,1fr)_540px_374px] gap-[28px]">
        <div className="min-w-0">
          <Breadcrumb />
          <div className="mt-[25px] flex gap-[16px]">
            <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/12 text-primary shadow-[0_0_22px_hsl(var(--primary)/0.28),inset_0_0_18px_hsl(var(--primary)/0.12)]">
              <FileText className="h-[28px] w-[28px]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[21px] font-black leading-none">Processo #{row.numero}</h1>
                <button onClick={copyNumero} className="text-muted-foreground transition-colors hover:text-primary" aria-label="Copiar número">
                  <Copy className="h-[15px] w-[15px]" />
                </button>
              </div>
              <p className="mt-[12px] text-[14px] leading-none text-muted-foreground">Tipo: {row.categoria}</p>
              <p className="mt-[8px] text-[14px] leading-none text-muted-foreground">Origem: {row.origem ?? "—"}</p>
              <span className="mt-[13px] inline-flex items-center rounded-full border border-primary/45 bg-primary/12 px-[15px] py-[6px] text-[12px] font-bold text-primary shadow-[0_0_14px_hsl(var(--primary)/0.18)]">
                Prioridade: Normal
              </span>
            </div>
          </div>
        </div>

        <div className="mt-[46px] h-[118px] min-w-0 rounded-lg border border-border/35 bg-background/12 px-[28px] py-[22px] shadow-[inset_0_0_28px_hsl(var(--primary)/0.05)]">
          <div className="grid h-full grid-cols-3 gap-[28px]">
            <HeroMeta label="Status" icon={CheckCircle2}>
              <Badge variant="outline" className="mt-[7px] h-[30px] rounded-full border-success/35 bg-success/18 px-[14px] text-[11px] font-black text-success shadow-[0_0_12px_hsl(var(--success)/0.35)]">
                {statusLabel(row.status)}
                <span className="ml-2 h-2 w-2 rounded-full bg-success shadow-[0_0_8px_hsl(var(--success))]" />
              </Badge>
            </HeroMeta>
            <HeroMeta label="Recebido em" icon={Calendar}>
              <p className="mt-[10px] truncate text-[14px] font-bold leading-none text-foreground">{fmtDateTime(row.recebida_em)}</p>
            </HeroMeta>
            <HeroMeta label="Responsável" icon={User}>
              <p className="mt-[10px] truncate text-[14px] font-bold leading-none text-foreground">{row.responsavel ?? "Janis Maciel"}</p>
            </HeroMeta>
          </div>
        </div>

        <TotalProcessCard row={row} totalLabel={totalLabel} taxaSucesso={taxaSucesso} />
      </div>
    </Panel>
  );
}

function Breadcrumb() {
  return (
    <div className="flex items-center gap-[12px] text-[13px] font-semibold leading-none">
      <span className="text-primary">Processos</span>
      <ChevronRight className="h-[14px] w-[14px] text-muted-foreground" />
      <span className="text-muted-foreground">Detalhes do Processo</span>
    </div>
  );
}

function HeroMeta({ label, icon: Icon, children }: { label: string; icon: typeof Calendar; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-semibold leading-none text-muted-foreground">{label}</p>
      <div className="flex min-w-0 items-center gap-[10px]">
        <Icon className="mt-[10px] h-[15px] w-[15px] shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function TotalProcessCard({ row, totalLabel, taxaSucesso }: { row: Row; totalLabel: string; taxaSucesso: number }) {
  return (
    <div className="grid h-full min-w-0 grid-cols-[minmax(0,1fr)_118px] items-center rounded-lg border border-primary/45 bg-primary/12 px-[20px] py-[18px] shadow-[0_0_30px_hsl(var(--primary)/0.18),inset_0_0_28px_hsl(var(--primary)/0.08)]">
      <div className="min-w-0">
        <p className="text-[12px] font-black uppercase leading-none text-primary">Tempo total do processo</p>
        <p className="mt-[16px] truncate text-[48px] font-black leading-none tracking-normal text-foreground drop-shadow-[0_0_10px_hsl(var(--primary)/0.38)]">{totalLabel}</p>
        <p className="mt-[17px] truncate text-[13px] leading-[1.45] text-muted-foreground">De {fmtDateTime(row.recebida_em)}</p>
        <p className="truncate text-[13px] leading-[1.45] text-muted-foreground">até {fmtDateTime(row.finalizada_em)}</p>
      </div>
      <div className="flex flex-col items-center gap-[11px]">
        <SlaRing value={Math.round(taxaSucesso || 92)} />
        <p className="text-[13px] leading-none text-muted-foreground">Dentro do SLA</p>
      </div>
    </div>
  );
}

function SlaRing({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 38;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-[96px] w-[96px]">
      <div className="absolute inset-0 rounded-full bg-success/10 blur-md" />
      <svg viewBox="0 0 100 100" className="relative h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="38" fill="none" stroke="hsl(var(--success) / 0.18)" strokeWidth="10" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="hsl(var(--success))" strokeWidth="11" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference - (clamped / 100) * circumference} style={{ filter: "drop-shadow(0 0 8px hsl(var(--success) / 0.9))" }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[18px] font-black tabular-nums">{clamped}%</span>
    </div>
  );
}

function TimelinePanel({
  row, ateInicioLabel, conferenciaLabel, conferenciaIniciada, concluido,
}: {
  row: Row;
  ateInicioLabel: string;
  conferenciaLabel: string;
  conferenciaIniciada: boolean;
  concluido: boolean;
}) {
  return (
    <Panel className="relative overflow-hidden px-[18px] pt-[22px] pb-[10px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_48%,hsl(var(--warning)/0.14),transparent_34%),radial-gradient(ellipse_at_50%_36%,hsl(var(--primary)/0.12),transparent_44%),radial-gradient(ellipse_at_86%_58%,hsl(var(--primary-glow)/0.16),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-[21%] right-[26%] opacity-35 [background-image:linear-gradient(115deg,hsl(var(--primary)/0.22)_1px,transparent_1px),linear-gradient(25deg,hsl(var(--primary)/0.18)_1px,transparent_1px)] [background-size:92px_46px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--background)/0.92)_0%,transparent_14%,transparent_84%,hsl(var(--background)/0.92)_100%)]" />

      <div className="relative z-10">
        <h2 className="text-[20px] font-black leading-none text-foreground">Linha do Tempo do Processo</h2>
      </div>

      <div className="relative mt-[8px] h-[252px] w-full min-w-0">
        <div className="absolute left-[1.9%] right-[2.2%] top-[83px] h-[3px]">
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-warning/70 shadow-[0_0_8px_hsl(var(--warning)/0.78),0_0_18px_hsl(var(--warning)/0.26)]" />
          <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 bg-[linear-gradient(90deg,transparent,hsl(var(--warning)/0.36),transparent)] blur-[2px]" />
        </div>

        <img src={timelineForklift} alt="" loading="lazy" width={645} height={561}
          className="pointer-events-none absolute left-[10.1%] top-[75px] z-20 h-[96px] w-[132px] select-none object-contain drop-shadow-[0_12px_20px_hsl(var(--warning)/0.35)]" />
        <img src={timelineScanner} alt="" loading="lazy" width={767} height={690}
          className="pointer-events-none absolute left-[38.6%] top-[84px] z-20 h-[115px] w-[128px] select-none object-contain drop-shadow-[0_12px_22px_hsl(var(--primary)/0.34)]" />
        <img src={timelineGridBoxes} alt="" loading="lazy" width={441} height={384}
          className="pointer-events-none absolute left-[55.8%] top-[92px] z-10 h-[70px] w-[82px] select-none object-contain drop-shadow-[0_10px_22px_hsl(var(--primary)/0.42)]" />
        <img src={timelineShelf} alt="" loading="lazy" width={550} height={895}
          className="pointer-events-none absolute right-[8.1%] top-[29px] z-20 h-[166px] w-[103px] select-none object-contain drop-shadow-[0_16px_26px_hsl(var(--primary-glow)/0.48)]" />
        <div className="absolute right-[9.6%] top-[153px] z-30 flex h-[66px] w-[66px] items-center justify-center rounded-full border-[5px] border-success/65 bg-success text-success-foreground shadow-[0_0_0_4px_hsl(var(--background)/0.68),0_0_20px_hsl(var(--success)/0.58),inset_0_0_14px_hsl(var(--foreground)/0.25)]">
          <Check className="h-[42px] w-[42px] stroke-[4]" />
        </div>

        <TimePill className="left-[27.1%] top-[48px]" label="Tempo até início" value={ateInicioLabel} />
        <TimePill className="left-[72.7%] top-[48px]" label="Tempo de conferência" value={conferenciaLabel} />

        <VolumeBadge className="left-[21.9%] top-[126px]" label="Volume Total Recebido:" value="10 Pallets" />
        <VolumeBadge className="left-[48.5%] top-[206px] -translate-x-1/2" label="Volume Total Recebido:" value="1 Pallets" />
        <VolumeBadge className="left-[72.2%] top-[126px]" label="Volume Total Recebido:" value="12 Pallets" />

        <TimelineNode
          className="left-[0.2%] top-[54px]"
          title="RECEBIMENTO"
          titleClass="text-warning"
          icon={<Mail className="h-[24px] w-[24px]" />}
          date={fmtDateTime(row.recebida_em)}
          description="Processo recebido no sistema"
          status="Concluído"
          tone="success"
          done
        />
        <TimelineNode
          className="left-[48.3%] top-[54px] -translate-x-1/2"
          title="INÍCIO DA CONFERÊNCIA"
          titleClass="text-warning"
          icon={<PlayCircle className="h-[26px] w-[26px]" />}
          date={fmtDateTime(row.conferencia_inicio)}
          description="Conferência iniciada"
          status={conferenciaIniciada ? "Concluído" : "Pendente"}
          tone="primary"
          done={conferenciaIniciada}
        />
        <TimelineNode
          className="right-[-0.2%] top-[54px]"
          title="CONFERÊNCIA FINALIZADA"
          titleClass="text-warning"
          icon={<CheckCircle2 className="h-[26px] w-[26px]" />}
          date={fmtDateTime(row.finalizada_em)}
          description={concluido ? "Conferência finalizada com sucesso" : "Aguardando finalização"}
          status={concluido ? "Concluído" : "Pendente"}
          tone="success"
          done={concluido}
        />
      </div>
    </Panel>
  );
}

function TimePill({ className, label, value }: { className: string; label: string; value: string }) {
  return (
    <div
      className={cn("absolute z-40 h-[60px] w-[150px] -translate-x-1/2 rounded-[7px] border border-warning/70 px-[12px] pt-[9px] text-center shadow-[0_0_16px_hsl(var(--warning)/0.52),inset_0_0_14px_hsl(var(--warning)/0.30)]", className)}
      style={{ background: "var(--gradient-orange)" }}
    >
      <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-warning/55" />
      <p className="text-[10px] font-semibold leading-none text-foreground/85">{label}</p>
      <p className="mt-[6px] text-[20px] font-semibold leading-none text-foreground drop-shadow-[0_1px_2px_hsl(var(--background)/0.65)]">{value}</p>
      <svg className="absolute bottom-[8px] right-[10px] h-[14px] w-[44px] text-foreground/58" viewBox="0 0 44 14" fill="none" aria-hidden="true">
        <path d="M1 11H7L10 8L13 10L17 4L21 7H28L32 3L36 5L39 2H43" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function VolumeBadge({ className, label, value }: { className: string; label: string; value: string }) {
  return (
    <div className={cn("absolute z-40 h-[58px] w-[175px] rounded-[7px] border border-warning/28 bg-background/74 px-[10px] py-[8px] text-left backdrop-blur-md shadow-[0_0_14px_hsl(var(--warning)/0.15),inset_0_0_16px_hsl(var(--primary)/0.05)]", className)}>
      <span className="absolute left-1/2 bottom-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[7px] border-x-transparent border-b-warning/22" />
      <p className="truncate pr-[30px] text-[11px] font-black leading-none text-foreground">{label}</p>
      <p className="mt-[7px] truncate pr-[30px] text-[14px] font-medium leading-none text-warning/90">{value}</p>
      <span className="absolute right-[12px] top-[20px] h-[20px] w-[20px] rounded-[3px] border border-muted-foreground/35 bg-[repeating-linear-gradient(90deg,hsl(var(--foreground)/0.72)_0_1px,transparent_1px_3px),repeating-linear-gradient(0deg,hsl(var(--foreground)/0.72)_0_1px,transparent_1px_3px)] opacity-80 shadow-[0_0_8px_hsl(var(--foreground)/0.18)]" />
    </div>
  );
}

function TimelineNode({
  className, title, titleClass, icon, date, description, status, done,
}: {
  className: string;
  title: string;
  titleClass: string;
  icon: ReactNode;
  date: string;
  description: string;
  status: string;
  tone: "success" | "primary";
  done: boolean;
}) {
  return (
    <div className={cn("absolute z-30 flex w-[150px] flex-col items-center text-center", className)}>
      <div className="relative mb-[15px] flex h-[60px] w-[60px] items-center justify-center rounded-full border-[2px]" style={{ color: `hsl(var(--warning))`, borderColor: `hsl(var(--warning) / 0.62)`, background: `hsl(var(--warning) / 0.17)`, boxShadow: `0 0 16px hsl(var(--warning) / 0.38), inset 0 0 14px hsl(var(--warning) / 0.14)` }}>
        <div className="absolute inset-[-3px] rounded-full border" style={{ borderColor: `hsl(var(--warning) / 0.18)` }} />
        {icon}
        {done && <span className="absolute -bottom-[3px] -right-[2px] flex h-[16px] w-[16px] items-center justify-center rounded-full bg-success text-success-foreground shadow-[0_0_10px_hsl(var(--success))]"><Check className="h-[10px] w-[10px]" /></span>}
      </div>
      <p className={cn("max-w-full text-[16px] font-black uppercase leading-[1.02]", titleClass)}>{title}</p>
      <p className="mt-[8px] max-w-full truncate text-[11px] leading-none text-muted-foreground">{date}</p>
      <p className="mt-[7px] max-w-full text-[11px] leading-[1.25] text-muted-foreground">{description}</p>
      <span className="mt-[9px] rounded-full border border-success/28 bg-success/16 px-[16px] py-[5px] text-[11px] font-bold text-success shadow-[0_0_10px_hsl(var(--success)/0.16)]">{status}</span>
    </div>
  );
}

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("rounded-lg border border-border/55 shadow-[0_0_20px_hsl(var(--primary)/0.08),inset_0_0_34px_hsl(var(--primary)/0.045)]", className)}
      style={{ background: "linear-gradient(180deg, hsl(var(--card) / 0.93), hsl(var(--background) / 0.92))" }}
    >
      {children}
    </div>
  );
}

function TimeDetailsCard({ row, totalLabel, ateInicioLabel, conferenciaLabel }: { row: Row; totalLabel: string; ateInicioLabel: string; conferenciaLabel: string }) {
  return (
    <Panel className="min-h-0 overflow-hidden p-[18px]">
      <SectionTitle icon={<Clock className="h-[17px] w-[17px] text-primary" />} title="Detalhes do Tempo" />
      <div className="mt-[21px] space-y-[18px] text-[13px]">
        <DetailLine icon={<Calendar className="h-[16px] w-[16px]" />} label="Recebido em:" value={fmtDateTime(row.recebida_em)} />
        <DetailLine icon={<Calendar className="h-[16px] w-[16px]" />} label="Início da conferência:" value={fmtDateTime(row.conferencia_inicio)} />
        <DetailLine icon={<Calendar className="h-[16px] w-[16px]" />} label="Finalização da conferência:" value={fmtDateTime(row.finalizada_em)} />
      </div>
      <div className="mt-[26px] border-t border-border/55 pt-[19px]">
        <Kv label="Tempo total do processo:" value={totalLabel} valueClass="text-primary" />
        <Kv label="Tempo até início:" value={ateInicioLabel} valueClass="text-success" />
        <Kv label="Tempo de conferência:" value={conferenciaLabel} valueClass="text-primary" />
      </div>
    </Panel>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-[12px]">
      {icon}
      <h3 className="text-[15px] font-black leading-none">{title}</h3>
    </div>
  );
}

function DetailLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,auto)] items-center gap-[16px] text-muted-foreground">
      <div className="flex items-center gap-[12px] min-w-0">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <span className="truncate text-right font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function Kv({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(70px,auto)] items-center gap-4 py-[9px] text-[14px]">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className={cn("truncate text-right tabular-nums font-bold", valueClass)}>{value}</span>
    </div>
  );
}

function ResumoProcessoCard({ row, taxaSucesso }: { row: Row; taxaSucesso: number }) {
  const taxa = Math.round(taxaSucesso);
  return (
    <Panel className="min-h-0 overflow-hidden p-[15px]">
      <SectionTitle icon={<BarChart3 className="h-[17px] w-[17px] text-primary" />} title="Resumo do Processo" />
      <div className="mt-[17px] grid min-w-0 grid-cols-4 gap-[10px]">
        <MetricCard label="SKUs conferidos" value={`${row.skus_conferidos || row.total_itens || 7}/${row.total_itens || 7}`} icon={<Box className="h-[21px] w-[21px]" />} tone="primary" />
        <MetricCard label="Quantidade conferida" value={`${Number(row.conferido || row.total_qtd_esperada || 100400).toLocaleString("pt-BR")}/${Number(row.total_qtd_esperada || 100400).toLocaleString("pt-BR")}`} icon={<CheckCircle2 className="h-[21px] w-[21px]" />} tone="success" />
        <MetricCard label="Itens com divergência" value={`${row.divergencias}`} icon={<Clock className="h-[21px] w-[21px]" />} tone="warning" />
        <MetricCard label="Taxa de sucesso" value={`${taxa}%`} icon={<Trophy className="h-[21px] w-[21px]" />} tone="accent" />
      </div>
      <div className="mt-[11px] rounded-lg border border-border/35 bg-background/24 px-[12px] py-[12px] text-center shadow-[inset_0_0_18px_hsl(var(--success)/0.05)]">
        <p className="text-[14px] leading-none text-success">Processo concluído com sucesso! 🎉</p>
        <div className="relative mt-[13px] h-[4px] rounded-full bg-success/18">
          <div className="absolute inset-y-0 left-0 w-full rounded-full bg-success shadow-[0_0_9px_hsl(var(--success))]" />
          <span className="absolute right-0 top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-success shadow-[0_0_8px_hsl(var(--success))]" />
        </div>
      </div>
    </Panel>
  );
}

function MetricCard({ label, value, icon, tone }: { label: string; value: string; icon: ReactNode; tone: "primary" | "success" | "warning" | "accent" }) {
  const toneVar = tone === "success" ? "--success" : tone === "warning" ? "--warning" : tone === "accent" ? "--primary" : "--primary";
  return (
    <div className="min-w-0 rounded-md border border-border/55 bg-card/70 p-[12px] shadow-[inset_0_0_22px_hsl(var(--primary)/0.04)]">
      <p className="h-[28px] text-[11px] leading-[1.25] text-muted-foreground">{label}</p>
      <div className="mt-[12px] flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[22px] font-black leading-none tabular-nums">{value}</p>
        <span className="shrink-0" style={{ color: `hsl(var(${toneVar}))`, filter: `drop-shadow(0 0 7px hsl(var(${toneVar}) / 0.75))` }}>{icon}</span>
      </div>
      <div className="mt-[16px] h-[4px] rounded-full" style={{ background: `hsl(var(${toneVar}) / 0.18)` }}>
        <div className="h-full w-full rounded-full" style={{ background: `hsl(var(${toneVar}))`, boxShadow: `0 0 9px hsl(var(${toneVar}) / 0.85)` }} />
      </div>
    </div>
  );
}

function DesempenhoCard() {
  return (
    <Panel className="min-h-0 overflow-hidden p-[15px]">
      <div className="flex items-center justify-between gap-4">
        <SectionTitle icon={<Activity className="h-[17px] w-[17px] text-success" />} title="Desempenho dos Processos" />
        <button className="rounded-md border border-border/50 bg-background/25 px-[12px] py-[5px] text-[11px] text-foreground">Últimos 7 dias</button>
      </div>
      <div className="mt-[13px] grid h-[calc(100%-42px)] min-w-0 grid-cols-3 gap-[8px]">
        <MiniLineCard label="Tempo médio" value="48 min" delta="↓ -12% vs. período anterior" tone="primary" data={[42, 45, 37, 44, 36, 39, 51, 46, 34, 32, 49, 83, 76]} />
        <MiniLineCard label="Taxa de sucesso" value="98,6%" delta="↑ +2,4% vs. período anterior" tone="success" data={[28, 31, 45, 50, 35, 31, 42, 48, 47, 44, 52, 67, 57, 46]} />
        <MiniLineCard label="Processos concluídos" value="24" delta="↑ +6 vs. período anterior" tone="primary" data={[35, 42, 48, 33, 27, 38, 52, 52, 51, 45, 36, 48, 64, 67, 59]} />
      </div>
    </Panel>
  );
}

function MiniLineCard({ label, value, delta, tone, data }: { label: string; value: string; delta: string; tone: "primary" | "success"; data: number[] }) {
  const toneVar = tone === "success" ? "--success" : "--primary";
  return (
    <div className="relative min-w-0 overflow-hidden rounded-md border border-border/55 bg-card/62 p-[11px]">
      <p className="text-[11px] font-medium leading-none text-muted-foreground">{label}</p>
      <p className="mt-[10px] text-[20px] font-black leading-none">{value}</p>
      <p className="mt-[8px] truncate text-[10px] leading-none" style={{ color: `hsl(var(${toneVar}))` }}>{delta}</p>
      <MiniSparkline data={data} toneVar={toneVar} />
    </div>
  );
}

function MiniSparkline({ data, toneVar }: { data: number[]; toneVar: string }) {
  const w = 180;
  const h = 44;
  const pad = 3;
  const points = data.map((v, i) => ({ x: pad + (i / (data.length - 1)) * (w - pad * 2), y: pad + (1 - v / 100) * (h - pad * 2) }));
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const t = 0.22;
    d += ` C ${p1.x + (p2.x - p0.x) * t},${p1.y + (p2.y - p0.y) * t} ${p2.x - (p3.x - p1.x) * t},${p2.y - (p3.y - p1.y) * t} ${p2.x},${p2.y}`;
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="absolute bottom-[7px] left-[10px] right-[10px] h-[43px] w-[calc(100%-20px)]" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={`hsl(var(${toneVar}))`} strokeWidth="2.4" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px hsl(var(${toneVar}) / 0.85))` }} />
    </svg>
  );
}

function ActivityPanel({ row, concluido, conferenciaIniciada }: { row: Row; concluido: boolean; conferenciaIniciada: boolean }) {
  const items = [
    { icon: CheckCircle2, title: "Processo recebido", desc: "Processo importado com sucesso", time: timeOnly(row.recebida_em), tone: "success" as const },
    { icon: PlayCircle, title: "Conferência iniciada", desc: "Início da conferência dos itens", time: timeOnly(row.conferencia_inicio), tone: "primary" as const },
    { icon: CheckCircle2, title: "Verificações concluídas", desc: "Todos os itens conferidos", time: timeOnly(row.finalizada_em), tone: "success" as const },
    { icon: CheckCircle2, title: "Processo finalizado", desc: concluido ? "Conferência finalizada com sucesso" : "Aguardando finalização", time: timeOnly(row.finalizada_em), tone: "success" as const },
    { icon: FileText, title: "Resultado", desc: row.divergencias ? `${row.divergencias} divergência encontrada` : "Nenhuma divergência encontrada", time: timeOnly(row.finalizada_em), tone: "primary" as const },
  ];

  return (
    <Panel className="min-h-0 min-w-0 overflow-hidden p-[16px]">
      <SectionTitle icon={<Activity className="h-[17px] w-[17px] text-primary" />} title="Atividade do Processo" />
      <div className="mt-[13px] min-w-0 rounded-lg border border-border/35 bg-background/20">
        <div className="relative py-[2px]">
          <div className="absolute bottom-[28px] left-[30px] top-[28px] w-[2px] bg-[linear-gradient(180deg,hsl(var(--success)),hsl(var(--primary)),hsl(var(--success)))] shadow-[0_0_9px_hsl(var(--primary)/0.45)]" />
          {items.map((item, i) => <ActivityItem key={item.title} {...item} active={i === 1 && conferenciaIniciada} />)}
        </div>
      </div>
      <button className="mt-[12px] flex h-[36px] w-full items-center justify-center gap-[12px] rounded-md border border-primary/45 bg-primary/8 text-[13px] font-bold text-primary shadow-[0_0_16px_hsl(var(--primary)/0.08)]">
        Ver todas as atividades <ArrowRight className="h-[16px] w-[16px]" />
      </button>
    </Panel>
  );
}

function ActivityItem({ icon: Icon, title, desc, time, tone, active }: { icon: typeof CheckCircle2; title: string; desc: string; time: string; tone: "success" | "primary"; active?: boolean }) {
  const toneVar = tone === "success" ? "--success" : "--primary";
  return (
    <div className="relative grid min-w-0 grid-cols-[48px_minmax(0,1fr)_42px] gap-[0px] px-[11px] py-[9px] text-[12px]">
      <div className="relative z-10 flex items-center justify-center">
        <span className={cn("flex h-[29px] w-[29px] items-center justify-center rounded-full border", active && "scale-105")} style={{ color: `hsl(var(${toneVar}))`, background: `hsl(var(${toneVar}) / 0.16)`, borderColor: `hsl(var(${toneVar}) / 0.5)`, boxShadow: `0 0 11px hsl(var(${toneVar}) / 0.45)` }}>
          <Icon className="h-[15px] w-[15px]" />
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-black leading-none">{title}</p>
        <p className="mt-[5px] truncate text-[11px] leading-none text-muted-foreground">{desc}</p>
      </div>
      <span className="truncate text-right text-[12px] tabular-nums leading-none text-muted-foreground">{time}</span>
    </div>
  );
}

function timeOnly(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function QuickActions({ onBack }: { onBack: () => void }) {
  return (
    <Panel className="min-h-0 min-w-0 overflow-hidden p-[15px]">
      <SectionTitle icon={<Zap className="h-[17px] w-[17px] text-warning" />} title="Ações rápidas" />
      <div className="mt-[18px] grid min-w-0 grid-cols-3 gap-[12px]">
        <ActionButton icon={<Download className="h-[16px] w-[16px]" />} label="Exportar relatório" />
        <ActionButton icon={<Printer className="h-[16px] w-[16px]" />} label="Imprimir" />
        <button onClick={onBack} className="flex h-[36px] min-w-0 items-center justify-center gap-[9px] rounded-md border border-border/60 bg-background/20 px-[12px] text-[12px] font-semibold text-foreground transition-colors hover:bg-primary/10">
          <PlusCircle className="h-[16px] w-[16px] shrink-0" /> <span className="truncate">Novo processo</span>
        </button>
      </div>
    </Panel>
  );
}

function ActionButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button className="flex h-[36px] min-w-0 items-center justify-center gap-[9px] rounded-md border border-border/60 bg-background/20 px-[12px] text-[12px] font-semibold text-foreground transition-colors hover:bg-primary/10">
      <span className="shrink-0">{icon}</span> <span className="truncate">{label}</span>
    </button>
  );
}

function ObservacoesPanel({ row }: { row: Row }) {
  return (
    <Panel className="min-h-0 min-w-0 overflow-hidden p-[15px]">
      <SectionTitle icon={<FileText className="h-[17px] w-[17px] text-primary" />} title="Observações" />
      <p className="mt-[21px] truncate text-[13px] leading-none text-muted-foreground">{row.observacao || "Nenhuma observação registrada."}</p>
    </Panel>
  );
}
