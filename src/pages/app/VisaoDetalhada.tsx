import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart3, Clock, Search, FileText, Calendar, User, PlayCircle, ArrowLeft,
  Copy, CheckCircle2, Mail, Sparkles,
} from "lucide-react";
import forkliftImg from "@/assets/timeline-forklift.png";
import scannerImg from "@/assets/timeline-scanner.png";
import gridBoxesImg from "@/assets/timeline-grid-boxes.png";
import shelfImg from "@/assets/timeline-shelf.png";
import warehouseBg from "@/assets/warehouse-bg.jpg";

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
    <main
      className="min-h-screen overflow-hidden text-[11px] text-foreground animate-fade-in"
      style={{
        background:
          `radial-gradient(circle at 52% 23%, hsl(var(--primary) / 0.13), transparent 24%), linear-gradient(180deg, hsl(var(--background) / 0.96), hsl(248 65% 4% / 0.98)), url(${warehouseBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="h-screen min-h-[640px] max-h-[900px] p-[4px_8px_6px] grid grid-rows-[118px_194px_minmax(218px,1fr)] gap-[6px]">
        <HeaderPanel
          row={row}
          totalLabel={totalLabel}
          copyNumero={copyNumero}
        />

        <TimelinePanel
          row={row}
          ateInicioLabel={ateInicioLabel}
          conferenciaLabel={conferenciaLabel}
          conferenciaIniciada={conferenciaIniciada}
          concluido={concluido}
          emConferencia={emConferencia}
        />

        <section className="grid grid-cols-[30.5%_46.5%_1fr] gap-[8px] min-h-0">
          <TimeDetailsCard
            row={row}
            ateInicioLabel={ateInicioLabel}
            conferenciaLabel={conferenciaLabel}
            onBack={onBack}
          />

          <div className="grid grid-rows-[58px_minmax(0,1fr)] gap-[7px] min-h-0">
            <div className="grid grid-cols-[20%_30%_30%_20%] gap-[7px] min-h-0">
              <DonutMini value={Math.round(taxaSucesso)} />
              <BarsMini label="Quantidade conferida:" />
              <SkusMini label="SKUs conferidos:" value={`${row.skus_conferidos || 7}/${row.total_itens || 7}`} />
              <DivergenciaMini value={row.divergencias} />
            </div>
            <Panel className="p-2 min-h-0">
              <h3 className="text-center text-[10px] font-black leading-none mb-1">
                <span className="text-muted-foreground">COMPARATIVO DE DESEMPENHO: </span>
                <span className="text-success">ATUAL</span>
                <span className="text-muted-foreground"> vs. ANTERIOR </span>
                <span className="text-primary">PROCESSO ANTERIOR (#{(parseInt(row.numero) - 1) || row.numero})</span>
              </h3>
              <ComparativoChart numero={row.numero} />
            </Panel>
          </div>

          <LogPanel row={row} />
        </section>
      </div>
    </main>
  );
}

function HeaderPanel({ row, totalLabel, copyNumero }: { row: Row; totalLabel: string; copyNumero: () => void }) {
  return (
    <Panel className="relative overflow-hidden px-4 py-3">
      <div className="absolute inset-0 opacity-25 bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.18),transparent)]" />
      <div className="relative z-10 grid h-full grid-cols-[275px_170px_1fr_170px] items-center gap-4">
        <div className="flex gap-3 min-w-0">
          <div className="h-9 w-9 rounded-md border border-primary/40 bg-primary/15 text-primary flex items-center justify-center shadow-[0_0_13px_hsl(var(--primary)/0.48)] shrink-0">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-base font-black truncate">Processo #{row.numero}</h1>
              <button onClick={copyNumero} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Copiar número">
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Tipo: {row.categoria}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Origem: {row.origem ?? "—"}</p>
            <div className="mt-2 inline-flex rounded-md border border-warning/70 px-3 py-1 text-[10px] font-semibold text-foreground shadow-[0_0_12px_hsl(var(--warning)/0.48)]" style={{ background: "linear-gradient(180deg, hsl(var(--warning) / 0.44), hsl(var(--warning) / 0.16))" }}>
              Prioridade&nbsp; Normal
            </div>
          </div>
        </div>

        <div className="space-y-2 leading-tight">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted-foreground">Status:</span>
            <Badge variant="outline" className={cn("h-5 px-2 text-[9px] font-black", statusBadgeClass(row.status))}>{statusLabel(row.status)}</Badge>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-[9px] text-muted-foreground">Recebido em:</p>
              <p className="text-[10px] font-semibold">{fmtDateTime(row.recebida_em)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-[9px] text-muted-foreground">Responsável:</p>
              <p className="text-[10px] font-semibold">{row.responsavel ?? "Janis Maciel"}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <CircularDial value={totalLabel} />
        </div>

        <div className="justify-self-end w-[154px] rounded-lg border border-primary/30 p-3 shadow-[0_0_22px_hsl(var(--primary)/0.34)]" style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.20), hsl(var(--card) / 0.82))" }}>
          <div className="flex justify-between gap-2">
            <p className="text-[8px] font-black uppercase tracking-wide text-primary-glow leading-tight">Tempo total do processo</p>
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-1 text-[28px] leading-none font-black text-foreground tabular-nums drop-shadow-[0_0_9px_hsl(var(--primary)/0.8)]">{totalLabel}</p>
          <p className="mt-2 text-[8px] leading-tight text-muted-foreground">De {fmtDateTime(row.recebida_em)}</p>
          <p className="text-[8px] leading-tight text-muted-foreground">até {fmtDateTime(row.finalizada_em)}</p>
        </div>
      </div>
    </Panel>
  );
}

function TimelinePanel({
  row, ateInicioLabel, conferenciaLabel, conferenciaIniciada, concluido, emConferencia,
}: {
  row: Row;
  ateInicioLabel: string;
  conferenciaLabel: string;
  conferenciaIniciada: boolean;
  concluido: boolean;
  emConferencia: boolean;
}) {
  return (
    <section className="relative overflow-hidden px-3 py-2">
      <div className="absolute inset-0 opacity-35" style={{ background: "linear-gradient(180deg, hsl(var(--card) / 0.18), hsl(var(--background) / 0.22))" }} />
      <div className="absolute inset-x-[25%] top-0 bottom-0 opacity-35" style={{ backgroundImage: "linear-gradient(hsl(var(--success)/0.14) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--success)/0.12) 1px, transparent 1px)", backgroundSize: "32px 32px", transform: "skewX(-20deg)" }} />
      <h2 className="relative z-10 text-[13px] font-black leading-none mb-3">Linha do Tempo do Processo</h2>
      <div className="absolute left-[35px] right-[34px] top-[75px] h-[2px] rounded-full bg-warning shadow-[0_0_9px_hsl(var(--warning)/0.78)]" />
      <div className="relative z-10 grid grid-cols-[105px_178px_170px_185px_150px_220px_110px] items-start h-[160px]">
        <TimelineStep icon="mail" title="RECEBIMENTO" date={fmtDateTime(row.recebida_em)} description="Ao recebido no sistema" status="Concluído" tone="warning" done={!!row.recebida_em} />
        <TimelineAsset img={forkliftImg} alt="Empilhadeira" pillLabel="Tempo até início" pillValue={ateInicioLabel} info="Volume Total Recebido: 10 Pallets" size="forklift" />
        <TimelineStep icon="play" title="INÍCIO DA CONFERÊNCIA" date={fmtDateTime(row.conferencia_inicio)} description="Conferência iniciada" status={conferenciaIniciada ? "Concluído" : "Pendente"} tone="primary" done={conferenciaIniciada} pulsing={emConferencia} />
        <TimelineAsset img={scannerImg} alt="Scanner" info={`Volume Total Recebido: ${Math.max(row.skus_conferidos, 1)} Pallets`} size="scanner" />
        <img src={gridBoxesImg} alt="Mapa de caixas" loading="lazy" className="mt-5 h-[103px] w-full object-contain drop-shadow-[0_0_16px_hsl(var(--success)/0.38)]" />
        <TimelineAsset img={shelfImg} alt="Prateleira" pillLabel="Tempo de conferência" pillValue={conferenciaLabel} info="Volume Total Recebido: 12 Pallets" size="shelf" />
        <TimelineStep icon="check" title="CONFERÊNCIA FINALIZADA" date={fmtDateTime(row.finalizada_em)} description={concluido ? "Conferência finalizada com sucesso" : "Aguardando finalização"} status={concluido ? "Concluído" : "Pendente"} tone="warning" done={concluido} />
      </div>
    </section>
  );
}

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("rounded-md border border-border/70 shadow-[0_0_18px_hsl(var(--primary)/0.12),inset_0_0_28px_hsl(var(--primary)/0.06)]", className)}
      style={{ background: "linear-gradient(180deg, hsl(var(--card) / 0.91), hsl(var(--muted) / 0.82))" }}
    >
      {children}
    </div>
  );
}

function CircularDial({ value }: { value: string }) {
  const ticks = Array.from({ length: 58 });
  return (
    <div className="relative h-[112px] w-[112px]">
      <div className="absolute inset-[-8px] rounded-full border border-primary/20 shadow-[0_0_24px_hsl(var(--primary)/0.42),inset_0_0_20px_hsl(var(--primary)/0.22)]" />
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r="87" fill="none" stroke="hsl(var(--primary) / 0.25)" strokeWidth="14" />
        <circle cx="100" cy="100" r="70" fill="hsl(var(--card) / 0.35)" stroke="hsl(var(--primary) / 0.28)" strokeWidth="10" />
        <circle cx="100" cy="100" r="70" fill="none" stroke="hsl(var(--warning))" strokeWidth="7" strokeDasharray="440" strokeDashoffset="92" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 7px hsl(var(--warning)))" }} />
        <circle cx="100" cy="100" r="86" fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeDasharray="540" strokeDashoffset="350" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 7px hsl(var(--primary)))" }} />
        {ticks.map((_, i) => {
          const angle = (i / ticks.length) * 360;
          const major = i % 5 === 0;
          return <line key={i} x1="100" y1="9" x2="100" y2={major ? 21 : 16} stroke={major ? "hsl(var(--warning))" : "hsl(var(--primary) / 0.58)"} strokeWidth={major ? 1.8 : 0.9} transform={`rotate(${angle} 100 100)`} />;
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[23px] font-black tabular-nums text-foreground drop-shadow-[0_0_10px_hsl(var(--primary)/0.9)]">{value}</span>
      </div>
    </div>
  );
}

function TimelineStep({
  icon, title, date, description, status, tone, done, pulsing,
}: {
  icon: "mail" | "play" | "check";
  title: string;
  date: string;
  description: string;
  status: string;
  tone: "primary" | "success" | "warning";
  done: boolean;
  pulsing?: boolean;
}) {
  const toneVar = tone === "success" ? "--success" : tone === "warning" ? "--warning" : "--primary";
  const iconNode = icon === "mail" ? <Mail className="h-4 w-4" /> : icon === "play" ? <PlayCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />;
  return (
    <div className="pt-[28px] flex flex-col items-center text-center min-w-0">
      <div
        className={cn("h-39px h-[39px] w-[39px] rounded-full border-2 flex items-center justify-center mb-2 bg-warning/15", pulsing && "animate-pulse")}
        style={{
          color: `hsl(var(${toneVar}))`,
          borderColor: `hsl(var(${toneVar}) / 0.65)`,
          boxShadow: done ? `0 0 12px hsl(var(${toneVar}) / 0.72), inset 0 0 12px hsl(var(${toneVar}) / 0.23)` : undefined,
          background: `hsl(var(${toneVar}) / 0.18)`,
        }}
      >
        {iconNode}
      </div>
      <p className="text-[10px] font-black leading-tight uppercase" style={{ color: `hsl(var(${toneVar}))` }}>{title}</p>
      <p className="mt-1 text-[8px] leading-tight text-muted-foreground max-w-[95px]">{date}</p>
      <p className="text-[8px] leading-tight text-muted-foreground max-w-[95px] truncate">{description}</p>
      <span className="mt-1.5 rounded-full border px-2 py-0.5 text-[8px] font-bold" style={{ color: `hsl(var(${toneVar}))`, borderColor: `hsl(var(${toneVar}) / 0.4)`, background: `hsl(var(${toneVar}) / 0.13)` }}>{status}</span>
    </div>
  );
}

function TimelineAsset({
  img, alt, pillLabel, pillValue, info, size,
}: {
  img: string;
  alt: string;
  pillLabel?: string;
  pillValue?: string;
  info: string;
  size: "forklift" | "scanner" | "shelf";
}) {
  const imgClass = size === "shelf" ? "h-[142px] -mt-5" : size === "forklift" ? "h-[96px] mt-8" : "h-[100px] mt-8";
  return (
    <div className="relative flex flex-col items-center min-w-0">
      {pillLabel && pillValue && (
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 min-w-[96px] rounded-md border border-warning/60 px-3 py-1 text-center shadow-[0_0_13px_hsl(var(--warning)/0.62)]" style={{ background: "linear-gradient(180deg, hsl(var(--warning)), hsl(var(--warning) / 0.72))" }}>
          <p className="text-[8px] leading-tight text-foreground/80">{pillLabel}</p>
          <p className="text-[13px] font-black leading-tight text-foreground tabular-nums">{pillValue}</p>
        </div>
      )}
      <img src={img} alt={alt} loading="lazy" className={cn("w-auto object-contain mix-blend-screen brightness-110 contrast-110 drop-shadow-[0_0_16px_hsl(var(--primary)/0.45)]", imgClass)} />
      <div className="-mt-2 rounded-md border border-border/70 px-2 py-1 text-[9px] font-semibold leading-tight whitespace-nowrap shadow-[0_0_9px_hsl(var(--primary)/0.2)]" style={{ background: "hsl(var(--card) / 0.86)" }}>
        {info.split(":")[0]}: <span className="text-foreground">{info.split(":").slice(1).join(":").trim()}</span>
      </div>
    </div>
  );
}

function TimeDetailsCard({ row, ateInicioLabel, conferenciaLabel, onBack }: { row: Row; ateInicioLabel: string; conferenciaLabel: string; onBack: () => void }) {
  return (
    <Panel className="p-3 min-h-0 overflow-hidden">
      <h3 className="text-[14px] font-black mb-2">Detalhes do Tempo</h3>
      <div className="space-y-0.5 text-[10px]">
        <Kv label="Recebido em:" value={fmtDateTime(row.recebida_em)} />
        <Kv label="Início da conferência:" value={fmtDateTime(row.conferencia_inicio)} />
        <Kv label="Finalização da conferência:" value={fmtDateTime(row.finalizada_em)} />
        <Kv label="Duração de Recebimento:" value={ateInicioLabel} valueClass="text-primary" />
        <Kv label="Duração de Conferência:" value={conferenciaLabel} valueClass="text-primary" />
      </div>
      <div className="mt-3 pt-2 border-t border-border/50">
        <h4 className="text-[12px] font-black mb-1.5">Micro-log:</h4>
        <ul className="text-[9px] text-muted-foreground space-y-1 list-disc pl-4 leading-tight">
          <li>Recebido em processo início → Concluído</li>
          <li>Conferencia da conferência → <span className="text-foreground font-bold">Início da Conferência</span></li>
          <li>Conferencia da conferência → status de Confirmação</li>
        </ul>
      </div>
      <button onClick={onBack} className="mt-2 inline-flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Voltar
      </button>
    </Panel>
  );
}

function Kv({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/30 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums font-semibold truncate", valueClass)}>{value}</span>
    </div>
  );
}

function DonutMini({ value }: { value: number }) {
  const c = 2 * Math.PI * 21;
  const offset = c - (value / 100) * c;
  return (
    <Panel className="flex items-center justify-center p-1">
      <div className="relative h-[48px] w-[48px]">
        <svg viewBox="0 0 58 58" className="h-full w-full -rotate-90">
          <circle cx="29" cy="29" r="21" fill="none" stroke="hsl(var(--primary) / 0.20)" strokeWidth="7" />
          <circle cx="29" cy="29" r="21" fill="none" stroke="hsl(var(--primary))" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ filter: "drop-shadow(0 0 5px hsl(var(--primary)))" }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-primary-glow">{value}%</span>
      </div>
    </Panel>
  );
}

function BarsMini({ label }: { label: string }) {
  const bars = [35, 55, 72, 91];
  const colors = ["--muted-foreground", "--success", "--warning", "--primary"];
  return (
    <Panel className="p-2 min-h-0">
      <p className="text-[9px] font-bold leading-none mb-1">{label}</p>
      <div className="flex items-end justify-center gap-2 h-[37px]">
        {bars.map((h, i) => <div key={i} className="w-4 rounded-sm" style={{ height: `${h}%`, background: `hsl(var(${colors[i]}))`, boxShadow: `0 0 7px hsl(var(${colors[i]}) / 0.7)` }} />)}
      </div>
    </Panel>
  );
}

function SkusMini({ label, value }: { label: string; value: string }) {
  const bars = [24, 38, 48, 56, 62, 69, 75, 86, 93, 97];
  return (
    <Panel className="p-2 min-h-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[9px] font-bold leading-none">{label}</p>
        <p className="text-[10px] font-black text-primary leading-none">{value}</p>
      </div>
      <div className="mt-2 flex items-end gap-1 h-[35px]">
        {bars.map((h, i) => <div key={i} className="flex-1 rounded-sm bg-primary" style={{ height: `${h}%`, opacity: 0.45 + i * 0.055, boxShadow: "0 0 6px hsl(var(--primary) / 0.65)" }} />)}
      </div>
    </Panel>
  );
}

function DivergenciaMini({ value }: { value: number }) {
  return (
    <Panel className="p-2 min-h-0">
      <p className="text-[9px] font-bold leading-none">Divergência</p>
      <p className={cn("mt-2 text-[18px] font-black leading-none tabular-nums", value > 0 ? "text-destructive" : "text-primary")}>
        ({value})
      </p>
    </Panel>
  );
}

function ComparativoChart({ numero }: { numero: string }) {
  const w = 600, h = 160;
  const padL = 35, padB = 25, padT = 7, padR = 8;
  const innerW = w - padL - padR;
  const innerH = h - padB - padT;
  const atual = [2, 54, 87, 96, 98, 98, 99, 99, 100, 100, 100, 100];
  const anterior = [3, 46, 48, 32, 17, 74, 33, 38, 37, 47, 75, 65, 8];
  const xs = (i: number, len: number) => padL + (i / (len - 1)) * innerW;
  const ys = (v: number) => padT + innerH - (v / 100) * innerH;
  const buildPath = (data: number[]) => {
    const pts = data.map((v, i) => ({ x: xs(i, data.length), y: ys(v) }));
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const t = 0.32;
      d += ` C ${p1.x + (p2.x - p0.x) * t},${p1.y + (p2.y - p0.y) * t} ${p2.x - (p3.x - p1.x) * t},${p2.y - (p3.y - p1.y) * t} ${p2.x},${p2.y}`;
    }
    return d;
  };
  const dAtual = buildPath(atual);
  const dAnterior = buildPath(anterior);
  const xTicks = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  return (
    <div className="relative h-[calc(100%-14px)] min-h-0">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="hsl(var(--success) / 0.26)" />
            <stop offset="1" stopColor="hsl(var(--success) / 0)" />
          </linearGradient>
          <linearGradient id="chartPink" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="hsl(var(--primary) / 0.28)" />
            <stop offset="1" stopColor="hsl(var(--primary) / 0)" />
          </linearGradient>
        </defs>
        {[0, 20, 40, 60, 80, 100].map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={ys(t)} y2={ys(t)} stroke="hsl(var(--border) / 0.38)" strokeDasharray="2 3" />
            <text x={padL - 5} y={ys(t) + 3} fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="end">{t}%</text>
          </g>
        ))}
        {xTicks.map((t, i) => <text key={t} x={xs(i, xTicks.length)} y={h - 8} fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="middle">{t}{i ? "min" : ""}</text>)}
        <path d={`${dAtual} L ${w - padR},${h - padB} L ${padL},${h - padB} Z`} fill="url(#chartGlow)" />
        <path d={`${dAnterior} L ${w - padR},${h - padB} L ${padL},${h - padB} Z`} fill="url(#chartPink)" />
        <path d={dAnterior} fill="none" stroke="hsl(var(--primary-glow))" strokeWidth="2.7" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px hsl(var(--primary))) drop-shadow(0 0 12px hsl(var(--primary)))" }} />
        <path d={dAtual} fill="none" stroke="hsl(var(--success))" strokeWidth="2.8" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px hsl(var(--success))) drop-shadow(0 0 12px hsl(var(--success)))" }} />
        {atual.map((v, i) => <circle key={i} cx={xs(i, atual.length)} cy={ys(v)} r="2.2" fill="hsl(var(--success))" />)}
        <text x={xs(6.4, atual.length)} y={ys(92)} fontSize="9" fill="hsl(var(--success))" textAnchor="middle" fontWeight="900">PROCESSO ATUAL</text>
        <text x={xs(6.4, atual.length)} y={ys(83)} fontSize="8" fill="hsl(var(--success))" textAnchor="middle">(#{numero})</text>
        <text x={xs(6.3, anterior.length)} y={ys(31)} fontSize="9" fill="hsl(var(--primary-glow))" textAnchor="middle" fontWeight="900">PROCESSO ANTERIOR</text>
        <text x={xs(6.3, anterior.length)} y={ys(22)} fontSize="8" fill="hsl(var(--primary-glow))" textAnchor="middle">(#{(parseInt(numero) - 1) || numero})</text>
        <text x="10" y={padT + innerH / 2} fontSize="8" fill="hsl(var(--muted-foreground))" transform={`rotate(-90 10 ${padT + innerH / 2})`} textAnchor="middle">Eficiência (%)</text>
      </svg>
      <p className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-semibold text-muted-foreground">Tempo de Execução (min)</p>
    </div>
  );
}

function LogPanel({ row }: { row: Row }) {
  return (
    <Panel className="p-3 min-h-0 overflow-hidden relative">
      <div className="absolute right-0 top-0 h-full w-[42%] opacity-30" style={{ backgroundImage: "linear-gradient(90deg, transparent, hsl(var(--success)/0.2)), linear-gradient(hsl(var(--success)/0.18) 1px, transparent 1px)", backgroundSize: "100% 100%, 18px 18px" }} />
      <div className="relative z-10">
        <h3 className="text-[13px] font-black mb-2">Observações &amp; Log Recente:</h3>
        <div className="min-h-[42px] rounded-md border border-border/45 p-2 text-[9px] text-muted-foreground" style={{ background: "hsl(var(--background) / 0.22)" }}>
          {row.observacao || "Nenhuma observação registrada."}
        </div>
        <h3 className="text-[13px] font-black mt-3 mb-2">Log Recente:</h3>
        <LogList numero={row.numero} />
      </div>
      <Sparkles className="absolute bottom-4 right-5 h-12 w-12 text-muted-foreground/45 drop-shadow-[0_0_10px_hsl(var(--foreground)/0.35)]" />
    </Panel>
  );
}

function LogList({ numero }: { numero: string }) {
  const items = [
    { time: "01:06:13", title: "Scanning SKU123", desc: `Scanning Set SKU123` },
    { time: "01:06:23", title: "Batch Approval", desc: "Divergence onset complete" },
    { time: "01:05:23", title: "Scanning SKU8123", desc: "Scanning batch update" },
    { time: "01:05:23", title: "Batch Approval", desc: `Scanning ${numero}` },
    { time: "01:05:24", title: "Divergence Check complete", desc: "Screening E1128" },
  ];
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-[9px] leading-tight">
          <span className="text-muted-foreground tabular-nums shrink-0 w-12">{it.time}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1 shrink-0 shadow-[0_0_6px_hsl(var(--primary))]" />
          <div className="min-w-0">
            <p className="font-black text-foreground truncate">{it.title}</p>
            <p className="text-muted-foreground truncate">{it.desc}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
