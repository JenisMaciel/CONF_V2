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
  Clock, Copy, Download, FileText, PlayCircle, PlusCircle, Printer, Search,
  Trophy, User, Zap,
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
    <main className="min-h-screen overflow-hidden bg-background text-foreground animate-fade-in">
      <div className="h-screen min-h-[720px] max-h-[920px] p-[8px_8px_10px] grid grid-rows-[183px_214px_minmax(300px,1fr)_90px] gap-[10px]">
        <HeroPanel row={row} totalLabel={totalLabel} taxaSucesso={taxaSucesso} copyNumero={copyNumero} />

        <TimelinePanel
          row={row}
          ateInicioLabel={ateInicioLabel}
          conferenciaLabel={conferenciaLabel}
          conferenciaIniciada={conferenciaIniciada}
          concluido={concluido}
        />

        <section className="grid min-h-0 grid-cols-[29%_43%_27%] gap-[12px]">
          <TimeDetailsCard
            row={row}
            totalLabel={totalLabel}
            ateInicioLabel={ateInicioLabel}
            conferenciaLabel={conferenciaLabel}
          />

          <div className="grid min-h-0 grid-rows-[215px_1fr] gap-[10px]">
            <ResumoProcessoCard row={row} taxaSucesso={taxaSucesso} />
            <DesempenhoCard />
          </div>

          <ActivityPanel row={row} concluido={concluido} conferenciaIniciada={conferenciaIniciada} />
        </section>

        <section className="grid min-h-0 grid-cols-[35%_37%_1fr] gap-[10px]">
          <QuickActions onBack={onBack} />
          <ObservacoesPanel row={row} />
          <div />
        </section>
      </div>
    </main>
  );
}

function HeroPanel({ row, totalLabel, taxaSucesso, copyNumero }: { row: Row; totalLabel: string; taxaSucesso: number; copyNumero: () => void }) {
  return (
    <Panel className="relative overflow-hidden p-[18px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_32%,hsl(var(--primary)/0.20),transparent_34%),radial-gradient(circle_at_92%_70%,hsl(var(--success)/0.14),transparent_24%)]" />
      <div className="relative z-10 flex h-full gap-[28px]">
        <div className="min-w-0 flex-1">
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

        <div className="mt-[46px] h-[118px] w-[540px] shrink-0 rounded-lg border border-border/35 bg-background/12 px-[28px] py-[22px] shadow-[inset_0_0_28px_hsl(var(--primary)/0.05)]">
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
    <div className="ml-auto grid h-full w-[374px] shrink-0 grid-cols-[1fr_118px] items-center rounded-lg border border-primary/45 bg-primary/12 px-[20px] py-[18px] shadow-[0_0_30px_hsl(var(--primary)/0.18),inset_0_0_28px_hsl(var(--primary)/0.08)]">
      <div>
        <p className="text-[12px] font-black uppercase leading-none text-primary">Tempo total do processo</p>
        <p className="mt-[16px] text-[48px] font-black leading-none tracking-normal text-foreground drop-shadow-[0_0_10px_hsl(var(--primary)/0.38)]">{totalLabel}</p>
        <p className="mt-[17px] text-[13px] leading-[1.45] text-muted-foreground">De {fmtDateTime(row.recebida_em)}</p>
        <p className="text-[13px] leading-[1.45] text-muted-foreground">até {fmtDateTime(row.finalizada_em)}</p>
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
    <Panel className="relative overflow-hidden px-[22px] py-[20px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.08),transparent_54%)]" />
      <div className="relative z-10 flex items-center gap-[12px]">
        <BarChart3 className="h-[16px] w-[16px] text-success drop-shadow-[0_0_8px_hsl(var(--success)/0.75)]" />
        <h2 className="text-[15px] font-black leading-none">Linha do Tempo do Processo</h2>
      </div>

      <div className="absolute left-[8.8%] right-[8.5%] top-[79px] h-[2px]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--success)),hsl(var(--success)),hsl(var(--primary)),hsl(var(--success)))] shadow-[0_0_12px_hsl(var(--success)/0.65)]" />
        <div className="absolute left-[25.5%] top-1/2 h-[5px] w-[9%] -translate-y-1/2 bg-[radial-gradient(circle,hsl(var(--success))_1.5px,transparent_2.4px)] [background-size:10px_5px]" />
        <div className="absolute left-[68.8%] top-1/2 h-[5px] w-[10%] -translate-y-1/2 bg-[radial-gradient(circle,hsl(var(--primary))_1.5px,transparent_2.4px)] [background-size:10px_5px]" />
      </div>

      <TimelineDuration className="left-[30.7%] top-[47px]" label="Tempo até início" value={ateInicioLabel} tone="success" />
      <TimelineDuration className="left-[69.1%] top-[47px]" label="Tempo de conferência" value={conferenciaLabel} tone="primary" />

      <TimelineNode
        className="left-[6.2%] top-[49px]"
        title="RECEBIMENTO"
        titleClass="text-success"
        icon={<Archive className="h-[25px] w-[25px]" />}
        date={fmtDateTime(row.recebida_em)}
        description="Processo recebido no sistema"
        status="Concluído"
        tone="success"
        done
      />
      <TimelineNode
        className="left-1/2 top-[49px] -translate-x-1/2"
        title="INÍCIO DA CONFERÊNCIA"
        titleClass="text-primary"
        icon={<PlayCircle className="h-[27px] w-[27px]" />}
        date={fmtDateTime(row.conferencia_inicio)}
        description="Conferência iniciada"
        status={conferenciaIniciada ? "Concluído" : "Pendente"}
        tone="primary"
        done={conferenciaIniciada}
      />
      <TimelineNode
        className="right-[3.8%] top-[49px]"
        title="CONFERÊNCIA FINALIZADA"
        titleClass="text-success"
        icon={<CheckCircle2 className="h-[27px] w-[27px]" />}
        date={fmtDateTime(row.finalizada_em)}
        description={concluido ? "Conferência finalizada com sucesso" : "Aguardando finalização"}
        status={concluido ? "Concluído" : "Pendente"}
        tone="success"
        done={concluido}
      />
    </Panel>
  );
}

function TimelineDuration({ className, label, value, tone }: { className: string; label: string; value: string; tone: "success" | "primary" }) {
  const toneVar = tone === "success" ? "--success" : "--primary";
  return (
    <div className={cn("absolute z-20 w-[120px] -translate-x-1/2 text-center", className)}>
      <p className="text-[10px] font-semibold leading-none text-muted-foreground">{label}</p>
      <p className="mt-[4px] text-[11px] font-black leading-none" style={{ color: `hsl(var(${toneVar}))`, textShadow: `0 0 8px hsl(var(${toneVar}) / 0.8)` }}>{value}</p>
    </div>
  );
}

function TimelineNode({
  className, title, titleClass, icon, date, description, status, tone, done,
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
  const toneVar = tone === "success" ? "--success" : "--primary";
  return (
    <div className={cn("absolute z-20 flex w-[245px] flex-col items-center text-center", className)}>
      <div className="relative mb-[14px] flex h-[62px] w-[62px] items-center justify-center rounded-full border-[3px]" style={{ color: `hsl(var(${toneVar}))`, borderColor: `hsl(var(${toneVar}))`, background: `hsl(var(${toneVar}) / 0.12)`, boxShadow: `0 0 23px hsl(var(${toneVar}) / 0.72), inset 0 0 20px hsl(var(${toneVar}) / 0.17)` }}>
        <div className="absolute inset-[-10px] rounded-full border" style={{ borderColor: `hsl(var(${toneVar}) / 0.18)`, boxShadow: `0 0 18px hsl(var(${toneVar}) / 0.25)` }} />
        {icon}
        {done && <span className="absolute -bottom-[3px] -right-[2px] flex h-[17px] w-[17px] items-center justify-center rounded-full bg-success text-success-foreground shadow-[0_0_10px_hsl(var(--success))]"><Check className="h-[11px] w-[11px]" /></span>}
      </div>
      <p className={cn("text-[15px] font-black leading-none", titleClass)}>{title}</p>
      <p className="mt-[10px] text-[11px] leading-none text-muted-foreground">{date}</p>
      <p className="mt-[7px] text-[11px] leading-none text-muted-foreground">{description}</p>
      <span className="mt-[11px] rounded-full border border-success/25 bg-success/15 px-[15px] py-[5px] text-[11px] font-bold text-success shadow-[0_0_10px_hsl(var(--success)/0.16)]">{status}</span>
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
    <div className="flex items-center justify-between gap-[16px] text-muted-foreground">
      <div className="flex items-center gap-[12px] min-w-0">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <span className="shrink-0 font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function Kv({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[9px] text-[14px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums font-bold", valueClass)}>{value}</span>
    </div>
  );
}

function ResumoProcessoCard({ row, taxaSucesso }: { row: Row; taxaSucesso: number }) {
  const taxa = Math.round(taxaSucesso);
  return (
    <Panel className="min-h-0 overflow-hidden p-[15px]">
      <SectionTitle icon={<BarChart3 className="h-[17px] w-[17px] text-primary" />} title="Resumo do Processo" />
      <div className="mt-[17px] grid grid-cols-4 gap-[10px]">
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
    <div className="rounded-md border border-border/55 bg-card/70 p-[12px] shadow-[inset_0_0_22px_hsl(var(--primary)/0.04)]">
      <p className="h-[28px] text-[11px] leading-[1.25] text-muted-foreground">{label}</p>
      <div className="mt-[12px] flex items-center justify-between gap-2">
        <p className="truncate text-[22px] font-black leading-none tabular-nums">{value}</p>
        <span style={{ color: `hsl(var(${toneVar}))`, filter: `drop-shadow(0 0 7px hsl(var(${toneVar}) / 0.75))` }}>{icon}</span>
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
      <div className="mt-[13px] grid h-[calc(100%-42px)] grid-cols-3 gap-[8px]">
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
    <div className="relative overflow-hidden rounded-md border border-border/55 bg-card/62 p-[11px]">
      <p className="text-[11px] font-medium leading-none text-muted-foreground">{label}</p>
      <p className="mt-[10px] text-[20px] font-black leading-none">{value}</p>
      <p className="mt-[8px] text-[10px] leading-none" style={{ color: `hsl(var(${toneVar}))` }}>{delta}</p>
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
    <Panel className="min-h-0 overflow-hidden p-[16px]">
      <SectionTitle icon={<Activity className="h-[17px] w-[17px] text-primary" />} title="Atividade do Processo" />
      <div className="mt-[13px] rounded-lg border border-border/35 bg-background/20">
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
    <div className="relative grid grid-cols-[48px_1fr_42px] gap-[0px] px-[11px] py-[9px] text-[12px]">
      <div className="relative z-10 flex items-center justify-center">
        <span className={cn("flex h-[29px] w-[29px] items-center justify-center rounded-full border", active && "scale-105")} style={{ color: `hsl(var(${toneVar}))`, background: `hsl(var(${toneVar}) / 0.16)`, borderColor: `hsl(var(${toneVar}) / 0.5)`, boxShadow: `0 0 11px hsl(var(${toneVar}) / 0.45)` }}>
          <Icon className="h-[15px] w-[15px]" />
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-black leading-none">{title}</p>
        <p className="mt-[5px] truncate text-[11px] leading-none text-muted-foreground">{desc}</p>
      </div>
      <span className="text-right text-[12px] tabular-nums leading-none text-muted-foreground">{time}</span>
    </div>
  );
}

function timeOnly(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function QuickActions({ onBack }: { onBack: () => void }) {
  return (
    <Panel className="min-h-0 p-[15px]">
      <SectionTitle icon={<Zap className="h-[17px] w-[17px] text-warning" />} title="Ações rápidas" />
      <div className="mt-[18px] grid grid-cols-3 gap-[12px]">
        <ActionButton icon={<Download className="h-[16px] w-[16px]" />} label="Exportar relatório" />
        <ActionButton icon={<Printer className="h-[16px] w-[16px]" />} label="Imprimir" />
        <button onClick={onBack} className="flex h-[36px] items-center justify-center gap-[9px] rounded-md border border-border/60 bg-background/20 px-[12px] text-[12px] font-semibold text-foreground transition-colors hover:bg-primary/10">
          <PlusCircle className="h-[16px] w-[16px]" /> Novo processo
        </button>
      </div>
    </Panel>
  );
}

function ActionButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button className="flex h-[36px] items-center justify-center gap-[9px] rounded-md border border-border/60 bg-background/20 px-[12px] text-[12px] font-semibold text-foreground transition-colors hover:bg-primary/10">
      {icon} {label}
    </button>
  );
}

function ObservacoesPanel({ row }: { row: Row }) {
  return (
    <Panel className="min-h-0 p-[15px]">
      <SectionTitle icon={<FileText className="h-[17px] w-[17px] text-primary" />} title="Observações" />
      <p className="mt-[21px] text-[13px] leading-none text-muted-foreground">{row.observacao || "Nenhuma observação registrada."}</p>
    </Panel>
  );
}
