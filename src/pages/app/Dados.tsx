import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIAS = ["HISENSE", "TOSHIBA", "MULTI", "OPPO", "ZTE"] as const;

export default function Dados() {
  const { user, isAdmin } = useAuth();
  const [categoria, setCategoria] = useState<string>("");
  const [numero, setNumero] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isAdmin) return <p className="text-muted-foreground">Acesso restrito.</p>;

  const handleUpload = async () => {
    if (!categoria) { toast.error("Selecione a categoria"); return; }
    if (!file) { toast.error("Selecione um arquivo XLSX"); return; }
    if (!numero.trim()) { toast.error("Informe o número da remessa"); return; }

    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

      // mapear colunas (aceita variações)
      const itens = rows.map((r) => {
        const codigo = String(r["CÓDIGO"] ?? r["CODIGO"] ?? r["Código"] ?? r["codigo"] ?? "").trim();
        const descricao = String(r["DESCRIÇÃO"] ?? r["DESCRICAO"] ?? r["Descrição"] ?? r["descricao"] ?? "").trim();
        const qtd = Number(r["QTDE"] ?? r["QTD"] ?? r["Qtde"] ?? r["qtd"] ?? 0);
        return { codigo, descricao, qtd };
      }).filter((i) => i.codigo);

      if (!itens.length) { toast.error("Planilha sem itens válidos. Cabeçalho esperado: CÓDIGO, DESCRIÇÃO, QTDE"); setLoading(false); return; }

      const totalQtd = itens.reduce((s, i) => s + Number(i.qtd), 0);

      const { data: remessa, error } = await supabase
        .from("remessas")
        .insert({
          numero: numero.trim(),
          categoria: categoria as any,
          status: "aberta",
          total_itens: itens.length,
          total_qtd_esperada: totalQtd,
          criado_por: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      const { error: e2 } = await supabase.from("remessa_itens").insert(
        itens.map((i) => ({
          remessa_id: remessa.id,
          codigo: i.codigo,
          descricao: i.descricao,
          qtd_esperada: i.qtd,
        }))
      );
      if (e2) throw e2;

      toast.success(`Remessa criada com ${itens.length} itens`);
      setFile(null);
      setNumero("");
      setCategoria("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao processar planilha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Dados</h1>
        <p className="text-muted-foreground text-sm mt-1">Importe planilhas XLSX para criar novas remessas</p>
      </div>

      <Card className="p-6 border-border/50 shadow-card space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Categoria <span className="text-destructive">*</span></Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="mt-2"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Número da Remessa <span className="text-destructive">*</span></Label>
            <Input className="mt-2" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 1971131351" />
          </div>
        </div>

        <div>
          <Label>Arquivo XLSX <span className="text-destructive">*</span></Label>
          <div className="mt-2 border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
              id="file-input"
              disabled={!categoria}
            />
            <label htmlFor="file-input" className={`cursor-pointer block ${!categoria ? "opacity-50 cursor-not-allowed" : ""}`}>
              <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">{file ? file.name : "Clique para selecionar planilha"}</p>
              <p className="text-xs text-muted-foreground mt-1">Colunas: CÓDIGO, DESCRIÇÃO, QTDE</p>
              {!categoria && <p className="text-xs text-warning mt-2">Selecione a categoria primeiro</p>}
            </label>
          </div>
        </div>

        <Button onClick={handleUpload} disabled={loading || !categoria || !file || !numero.trim()} className="w-full gradient-primary text-primary-foreground shadow-glow">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Criar Remessa
        </Button>
      </Card>
    </div>
  );
}
