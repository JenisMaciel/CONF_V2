import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtNum, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart3, Clock, Search, FileText, Calendar, User, PlayCircle, ArrowLeft,
  Copy, ChevronRight,
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
    <div
      className="space-y-5 animate-fade-in -m-6 p-6 min-h-screen"
      style={{
        backgroundImage: `linear-gradient(180deg, hsl(245 60% 6% / 0.92), hsl(248 55% 8% / 0.96)), url(${warehouseBg})`,
        backgroundSize: "cover",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
        <button onClick={onBack} className="text-primary hover:underline">Processos</button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>Detalhes do Processo</span>
      </nav>

      {/* ============================ CABEÇALHO ============================ */}
      <Card
        className="p-6 border-primary/30 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, hsl(252 55% 10% / 0.95), hsl(265 50% 14% / 0.95))",
          boxShadow: "0 0 40px hsl(280 95% 50% / 0.25), inset 0 0 60px hsl(280 95% 30% / 0.15)",
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_1fr_1fr] gap-6 items-center">
          {/* Identificação */}
          <div className="flex gap-3">
            <div className="h-14 w-14 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0 border border-primary/40 shadow-[0_0_18px_hsl(var(--primary)/0.5)]">
              <FileText className="h-7 w-7" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold truncate">Processo #{row.numero}</p>
                <button onClick={copyNumero} className="text-muted-foreground hover:text-foreground shrink-0">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">Tipo: {row.categoria}</p>
              <p className="text-sm text-muted-foreground">Origem: {row.origem ?? "—"}</p>
              <div className="inline-flex items-center px-3 py-1 rounded-md text-xs font-bold text-amber-100 border border-amber-400/60"
                style={{
                  background: "linear-gradient(180deg, hsl(40 70% 35%), hsl(35 80% 22%))",
                  boxShadow: "0 0 10px hsl(40 90% 50% / 0.4), inset 0 1px 0 hsl(45 90% 70% / 0.4)",
                }}
              >
                Prioridade: Normal
              </div>
            </div>
          </div>

          {/* Status / Recebido / Responsável */}
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Status:</span>
              <Badge variant="outline" className={cn("font-bold", statusBadgeClass(row.status))}>{statusLabel(row.status)}</Badge>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Recebido em:</p>
                <p>{fmtDateTime(row.recebida_em)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Responsável:</p>
                <p>{row.responsavel ?? "—"}</p>
              </div>
            </div>
          </div>

          {/* Anel circular grande central */}
          <div className="flex items-center justify-center">
            <CircularDial value={totalLabel} />
          </div>

          {/* Card TEMPO TOTAL */}
          <div
            className="rounded-2xl p-5 border border-primary/40 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(265 60% 16% / 0.9), hsl(280 60% 12% / 0.9))",
              boxShadow: "0 0 25px hsl(280 95% 50% / 0.35), inset 0 0 30px hsl(280 95% 40% / 0.2)",
            }}
          >
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold tracking-widest text-primary-glow">TEMPO TOTAL DO PROCESSO</p>
              <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center border border-primary/40">
                <Clock className="h-4 w-4 text-primary" />
              </div>
            </div>
            <p className="text-4xl font-bold tabular-nums mt-2 text-primary-glow drop-shadow-[0_0_10px_hsl(var(--primary)/0.7)]">{totalLabel}</p>
            <p className="text-[11px] text-muted-foreground mt-2">De {fmtDateTime(row.recebida_em)}</p>
            <p className="text-[11px] text-muted-foreground">até {fmtDateTime(row.finalizada_em)}</p>
          </div>
        </div>
      </Card>

      {/* ============================ LINHA DO TEMPO ============================ */}
      <div className="space-y-2">
        <h2 className="font-bold text-lg flex items-center gap-2 px-1">
          <BarChart3 className="h-5 w-5 text-primary" /> Linha do Tempo do Processo
        </h2>

        <div className="relative pt-12 pb-4">
          {/* Linha horizontal de fundo - laranja suave */}
          <div
            className="absolute left-[7%] right-[7%] h-[2px] rounded-full"
            style={{
              top: "calc(3rem + 56px)",
              background: "linear-gradient(90deg, hsl(25 100% 60% / 0.8), hsl(25 100% 60% / 0.4), hsl(25 100% 60% / 0.8))",
              boxShadow: "0 0 8px hsl(25 100% 60% / 0.6)",
            }}
          />

          <div className="grid grid-cols-7 gap-2 items-start relative">
            {/* RECEBIMENTO */}
            <TimelineStep
              icon="mail"
              tone="warning"
              title="RECEBIMENTO"
              date={fmtDateTime(row.recebida_em)}
              description="Ao recebido no sistema"
              status="Concluído"
              done={!!row.recebida_em}
            />

            {/* Empilhadeira + pill tempo até início */}
            <TimelineIllustration
              img={forkliftImg}
              alt="Empilhadeira"
              pillLabel="Tempo até início"
              pillValue={ateInicioLabel}
              extraInfo={{ label: "Volume Total Recebido:", value: "10 Pallets" }}
            />

            {/* INÍCIO DA CONFERÊNCIA */}
            <TimelineStep
              icon="play"
              tone="primary"
              title="INÍCIO DA CONFERÊNCIA"
              date={fmtDateTime(row.conferencia_inicio)}
              description="Conferência iniciada"
              status={conferenciaIniciada ? "Concluído" : "Pendente"}
              done={conferenciaIniciada}
              pulsing={emConferencia}
            />

            {/* Scanner + grid boxes */}
            <TimelineIllustration
              img={scannerImg}
              alt="Scanner e caixas"
              extraInfo={{ label: "Volume Total Recebido:", value: `${row.skus_conferidos || 1} Pallets` }}
            />

            {/* GRID INTERMEDIÁRIO (caixas no chão) */}
            <div className="flex flex-col items-center pt-2">
              <img src={gridBoxesImg} alt="Layout" loading="lazy" className="h-28 w-auto object-contain drop-shadow-[0_0_15px_hsl(var(--primary)/0.4)]" />
            </div>

            {/* CONFERÊNCIA + pill tempo de conferência */}
            <TimelineIllustration
              img={shelfImg}
              alt="Prateleira finalizada"
              pillLabel="Tempo de conferência"
              pillValue={conferenciaLabel}
              extraInfo={{ label: "Volume Total Recebido:", value: "12 Pallets" }}
            />

            {/* CONFERÊNCIA FINALIZADA */}
            <TimelineStep
              icon="check"
              tone="success"
              title="CONFERÊNCIA FINALIZADA"
              date={fmtDateTime(row.finalizada_em)}
              description={concluido ? "Conferência finalizada com sucesso" : "Aguardando finalização"}
              status={concluido ? "Concluído" : "Pendente"}
              done={concluido}
            />
          </div>
        </div>
      </div>

      {/* ============================ 3 COLUNAS INFERIORES ============================ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr_1fr] gap-4">
        {/* COL 1: Detalhes do Tempo */}
        <Card className="p-5 border-border/50 shadow-card">
          <h3 className="font-bold mb-4 text-base">Detalhes do Tempo</h3>
          <div className="space-y-3 text-sm">
            <Kv label="Recebido em:" value={fmtDateTime(row.recebida_em)} />
            <Kv label="Início da conferência:" value={fmtDateTime(row.conferencia_inicio)} />
            <Kv label="Finalização da conferência:" value={fmtDateTime(row.finalizada_em)} />
            <div className="border-t border-border/60 my-3" />
            <Kv label="Duração de Recebimento:" value={ateInicioLabel} valueClass="text-primary font-semibold" />
            <Kv label="Duração de Conferência:" value={conferenciaLabel} valueClass="text-primary font-semibold" />
          </div>

          <div className="mt-5">
            <h4 className="font-bold text-sm mb-2">Micro-log:</h4>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
              <li>Recebido em processo início → Concluído</li>
              <li>Conferencia da conferência → <span className="text-foreground font-semibold">Início de Conferência</span></li>
              <li>Conferencia da conferência → status de Confirmação</li>
            </ul>
          </div>
        </Card>

        {/* COL 2: Mini cards + Gráfico Comparativo */}
        <div className="space-y-4">
          {/* 4 mini cards: 100% donut, Quantidade barras, SKUs barras, Divergência */}
          <Card className="p-5 border-border/50 shadow-card">
            <div className="grid grid-cols-4 gap-3">
              <DonutMini value={Math.round(taxaSucesso)} />
              <BarsMini
                label="Quantidade conferida:"
                colors={["hsl(220 30% 70%)", "hsl(150 70% 55%)", "hsl(25 100% 60%)", "hsl(280 95% 65%)"]}
                heights={[40, 60, 75, 95]}
              />
              <SkusMini
                label="SKUs conferidos:"
                value={`${row.skus_conferidos}/${row.total_itens || 7}`}
              />
              <DivergenciaMini value={row.divergencias} />
            </div>
          </Card>

          {/* Gráfico Comparativo */}
          <Card className="p-5 border-border/50 shadow-card">
            <h3 className="text-center text-sm font-bold mb-3">
              <span className="text-muted-foreground">COMPARATIVO DE DESEMPENHO: </span>
              <span className="text-success">ATUAL</span>
              <span className="text-muted-foreground"> vs. ANTERIOR </span>
              <span className="text-primary">PROCESSO ANTERIOR (#{(parseInt(row.numero) - 1) || row.numero})</span>
            </h3>
            <ComparativoChart numero={row.numero} />
          </Card>
        </div>

        {/* COL 3: Observações & Log Recente */}
        <div className="space-y-4">
          <Card className="p-5 border-border/50 shadow-card">
            <h3 className="font-bold mb-3 text-base">Observações &amp; Log Recente:</h3>
            <p className="text-sm text-muted-foreground">{row.observacao || "Nenhuma observação registrada."}</p>
          </Card>
          <Card className="p-5 border-border/50 shadow-card">
            <h3 className="font-bold mb-3 text-base">Log Recente:</h3>
            <LogList numero={row.numero} />
          </Card>
        </div>
      </div>

      <div className="flex justify-start pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar para lista
        </Button>
      </div>
    </div>
  );
}

/* ============================ COMPONENTES VISUAIS ============================ */

function CircularDial({ value }: { value: string }) {
  // Tick marks around a ring with central value
  const ticks = Array.from({ length: 60 });
  return (
    <div className="relative h-[180px] w-[180px]">
      {/* outer glow ring */}
      <div className="absolute inset-0 rounded-full"
        style={{ boxShadow: "0 0 40px hsl(280 100% 55% / 0.55), inset 0 0 25px hsl(280 100% 55% / 0.4)" }}
      />
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r="88" fill="none" stroke="hsl(280 60% 30% / 0.4)" strokeWidth="2" />
        <circle cx="100" cy="100" r="78" fill="none" stroke="hsl(25 100% 60%)" strokeWidth="3"
          strokeDasharray="490" strokeDashoffset="98" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 6px hsl(25 100% 60%))" }}
        />
        <circle cx="100" cy="100" r="78" fill="none" stroke="hsl(280 95% 65%)" strokeWidth="3"
          strokeDasharray="490" strokeDashoffset="-340" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 6px hsl(280 95% 65%))" }}
        />
        {ticks.map((_, i) => {
          const angle = (i / 60) * 360;
          const isMajor = i % 5 === 0;
          return (
            <line
              key={i}
              x1="100" y1="14"
              x2="100" y2={isMajor ? 22 : 18}
              stroke={isMajor ? "hsl(280 95% 70%)" : "hsl(280 60% 50% / 0.6)"}
              strokeWidth={isMajor ? 1.6 : 0.8}
              transform={`rotate(${angle} 100 100)`}
              style={isMajor ? { filter: "drop-shadow(0 0 2px hsl(280 95% 70%))" } : undefined}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold text-primary-glow tabular-nums drop-shadow-[0_0_8px_hsl(var(--primary)/0.8)]">
          {value}
        </span>
      </div>
    </div>
  );
}

function TimelineStep({
  icon, tone, title, date, description, status, done, pulsing,
}: {
  icon: "mail" | "play" | "check";
  tone: "primary" | "success" | "warning";
  title: string;
  date: string;
  description: string;
  status: string;
  done: boolean;
  pulsing?: boolean;
}) {
  const toneVar = tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--primary)";
  const iconSvg = icon === "mail" ? (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  ) : icon === "play" ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7"><path d="M8 5v14l11-7z" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );

  return (
    <div className="flex flex-col items-center text-center px-1">
      <div
        className={cn(
          "h-14 w-14 rounded-full flex items-center justify-center border-2 mb-3",
          pulsing && "animate-pulse"
        )}
        style={{
          color: `hsl(${toneVar})`,
          borderColor: `hsl(${toneVar})`,
          background: `hsl(${toneVar} / 0.15)`,
          boxShadow: done
            ? `0 0 14px hsl(${toneVar} / 0.9), 0 0 28px hsl(${toneVar} / 0.5), inset 0 0 12px hsl(${toneVar} / 0.4)`
            : `0 0 8px hsl(${toneVar} / 0.4)`,
        }}
      >
        {iconSvg}
      </div>
      <p className="text-xs font-bold tracking-wide" style={{ color: `hsl(${toneVar})` }}>{title}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{date}</p>
      <p className="text-[10px] text-muted-foreground">{description}</p>
      <span
        className="mt-2 inline-flex px-3 py-0.5 rounded-full text-[10px] font-semibold border"
        style={{
          color: `hsl(${toneVar})`,
          borderColor: `hsl(${toneVar} / 0.5)`,
          background: `hsl(${toneVar} / 0.12)`,
        }}
      >
        {status}
      </span>
    </div>
  );
}

function TimelineIllustration({
  img, alt, pillLabel, pillValue, extraInfo,
}: {
  img: string;
  alt: string;
  pillLabel?: string;
  pillValue?: string;
  extraInfo?: { label: string; value: string };
}) {
  return (
    <div className="flex flex-col items-center relative">
      {/* Pill laranja acima da linha (se houver) */}
      {pillLabel && pillValue && (
        <div
          className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-lg text-center min-w-[130px]"
          style={{
            background: "linear-gradient(180deg, hsl(28 100% 62%), hsl(18 100% 48%))",
            boxShadow: "0 0 14px hsl(25 100% 55% / 0.7), inset 0 1px 0 hsl(35 100% 75% / 0.6)",
            border: "1px solid hsl(35 100% 70% / 0.5)",
          }}
        >
          <p className="text-[10px] text-white/90 font-medium leading-tight">{pillLabel}</p>
          <p className="text-base font-bold text-white tabular-nums leading-tight">{pillValue}</p>
        </div>
      )}
      <img src={img} alt={alt} loading="lazy" className="h-28 w-auto object-contain drop-shadow-[0_0_18px_hsl(var(--primary)/0.4)]" />
      {extraInfo && (
        <div
          className="mt-2 px-3 py-1.5 rounded-md text-xs whitespace-nowrap border border-primary/30"
          style={{ background: "hsl(248 50% 12% / 0.85)", boxShadow: "0 0 10px hsl(var(--primary) / 0.2)" }}
        >
          <span className="text-foreground/90">{extraInfo.label} </span>
          <span className="text-primary font-bold">{extraInfo.value}</span>
        </div>
      )}
    </div>
  );
}

function Kv({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", valueClass)}>{value}</span>
    </div>
  );
}

function DonutMini({ value }: { value: number }) {
  const c = 2 * Math.PI * 28;
  const offset = c - (value / 100) * c;
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-primary/30 p-2"
      style={{ background: "hsl(248 50% 10% / 0.7)" }}
    >
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 70 70" className="h-full w-full -rotate-90">
          <circle cx="35" cy="35" r="28" fill="none" stroke="hsl(280 40% 25% / 0.5)" strokeWidth="6" />
          <circle cx="35" cy="35" r="28" fill="none"
            stroke="hsl(280 95% 65%)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset}
            style={{ filter: "drop-shadow(0 0 4px hsl(280 95% 65%))" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-bold text-primary-glow">{value}%</span>
        </div>
      </div>
    </div>
  );
}

function BarsMini({ label, colors, heights }: { label: string; colors: string[]; heights: number[] }) {
  return (
    <div className="rounded-lg border border-border/50 p-2 flex flex-col" style={{ background: "hsl(248 50% 10% / 0.7)" }}>
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <div className="flex items-end gap-1.5 h-16 mt-auto">
        {heights.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-sm"
            style={{
              height: `${h}%`,
              background: colors[i],
              boxShadow: `0 0 8px ${colors[i]}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SkusMini({ label, value }: { label: string; value: string }) {
  // Many small bars in purple/magenta gradient
  const bars = [30, 45, 35, 55, 65, 75, 85, 70, 80, 90, 88, 95, 92];
  return (
    <div className="rounded-lg border border-border/50 p-2 flex flex-col" style={{ background: "hsl(248 50% 10% / 0.7)" }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-bold text-primary tabular-nums">{value}</p>
      </div>
      <div className="flex items-end gap-[2px] h-16 mt-auto">
        {bars.map((h, i) => {
          const hue = 280 + i * 3;
          return (
            <div key={i} className="flex-1 rounded-sm"
              style={{
                height: `${h}%`,
                background: `hsl(${hue} 90% 60%)`,
                boxShadow: `0 0 4px hsl(${hue} 90% 60%)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function DivergenciaMini({ value }: { value: number }) {
  return (
    <div className="rounded-lg border border-border/50 p-3 flex flex-col items-center justify-center"
      style={{ background: "hsl(248 50% 10% / 0.7)" }}
    >
      <p className="text-[10px] text-muted-foreground">Divergência</p>
      <p className={cn("text-3xl font-bold tabular-nums mt-2", value > 0 ? "text-destructive" : "text-success")}>
        ({value})
      </p>
    </div>
  );
}

function ComparativoChart({ numero }: { numero: string }) {
  const w = 600, h = 220;
  const padL = 40, padB = 30, padT = 10, padR = 10;
  const innerW = w - padL - padR;
  const innerH = h - padB - padT;

  // Atual: rapidly rises and stays high (~98-100%)
  const atual = [10, 75, 88, 94, 97, 98, 99, 99, 100, 100, 100, 100];
  // Anterior: oscillates wave-like
  const anterior = [5, 48, 45, 40, 60, 78, 55, 45, 50, 70, 75, 60];

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
      const t = 0.22;
      const c1x = p1.x + (p2.x - p0.x) * t;
      const c1y = p1.y + (p2.y - p0.y) * t;
      const c2x = p2.x - (p3.x - p1.x) * t;
      const c2y = p2.y - (p3.y - p1.y) * t;
      d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const dAtual = buildPath(atual);
  const dAnterior = buildPath(anterior);

  const yTicks = [0, 20, 40, 60, 80, 100];
  const xTicks = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[260px]" preserveAspectRatio="none">
        {/* Grid horizontal */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={ys(t)} y2={ys(t)} stroke="hsl(260 40% 25% / 0.4)" strokeDasharray="3 3" />
            <text x={padL - 6} y={ys(t) + 3} fontSize="9" fill="hsl(260 20% 70%)" textAnchor="end">{t}%</text>
          </g>
        ))}
        {/* X labels */}
        {xTicks.map((t, i) => (
          <text key={t} x={xs(i, xTicks.length)} y={h - 10} fontSize="9" fill="hsl(260 20% 70%)" textAnchor="middle">{t}min</text>
        ))}
        {/* Y axis label */}
        <text x="10" y={padT + innerH / 2} fontSize="9" fill="hsl(260 20% 70%)" transform={`rotate(-90 10 ${padT + innerH / 2})`} textAnchor="middle">Eficiência (%)</text>

        {/* Linha ANTERIOR (magenta) */}
        <path d={dAnterior} fill="none" stroke="hsl(310 100% 60%)" strokeWidth="2.5" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 4px hsl(310 100% 60%)) drop-shadow(0 0 8px hsl(310 100% 60%))" }}
        />
        {anterior.map((v, i) => (
          <circle key={i} cx={xs(i, anterior.length)} cy={ys(v)} r="3" fill="hsl(310 100% 60%)"
            style={{ filter: "drop-shadow(0 0 3px hsl(310 100% 60%))" }}
          />
        ))}

        {/* Linha ATUAL (ciano) */}
        <path d={dAtual} fill="none" stroke="hsl(175 100% 55%)" strokeWidth="2.5" strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 4px hsl(175 100% 55%)) drop-shadow(0 0 8px hsl(175 100% 55%))" }}
        />
        {atual.map((v, i) => (
          <circle key={i} cx={xs(i, atual.length)} cy={ys(v)} r="3" fill="hsl(175 100% 55%)"
            style={{ filter: "drop-shadow(0 0 3px hsl(175 100% 55%))" }}
          />
        ))}

        {/* Labels nas linhas */}
        <text x={xs(7, atual.length)} y={ys(atual[7]) - 8} fontSize="10" fill="hsl(175 100% 60%)" textAnchor="middle" fontWeight="bold">PROCESSO ATUAL</text>
        <text x={xs(7, atual.length)} y={ys(atual[7]) + 4} fontSize="9" fill="hsl(175 100% 60%)" textAnchor="middle">(#{numero})</text>

        <text x={xs(7, anterior.length)} y={ys(anterior[7]) + 16} fontSize="10" fill="hsl(310 100% 65%)" textAnchor="middle" fontWeight="bold">PROCESSO ANTERIOR</text>
        <text x={xs(7, anterior.length)} y={ys(anterior[7]) + 28} fontSize="9" fill="hsl(310 100% 65%)" textAnchor="middle">(#{(parseInt(numero) - 1) || numero})</text>
      </svg>
      <p className="text-center text-[11px] text-muted-foreground mt-1">Tempo de Execução (min)</p>
    </div>
  );
}

function LogList({ numero }: { numero: string }) {
  const items = [
    { time: "01:06:13", title: "Scanning SKU123", desc: `Scanning Set SKU123` },
    { time: "01:06:23", title: "Batch Approval", desc: "Divergence onset complete" },
    { time: "01:05:23", title: "Scanning SKU8123", desc: "Scanning batch update" },
    { time: "01:05:23", title: "Batch Approval", desc: "Scanning B-UK123" },
  ];
  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-xs">
          <span className="text-muted-foreground tabular-nums shrink-0 w-14">{it.time}</span>
          <span className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0 shadow-[0_0_6px_hsl(var(--primary))]" />
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{it.title}</p>
            <p className="text-muted-foreground truncate">{it.desc}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
