import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings } from "@/hooks/useAppSettings";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Share2, UserPlus, Upload, Loader2, Mail, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export default function Configuracoes() {
  const { isAdmin, isMaster } = useAuth();
  const { settings, refresh } = useAppSettings();
  const [users, setUsers] = useState<any[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, string[]>>({});
  const [appName, setAppName] = useState(settings.app_name);
  const [textColor, setTextColor] = useState(settings.card_text_color);
  const [bgColor, setBgColor] = useState(settings.card_bg_color);
  const [savingSettings, setSavingSettings] = useState(false);

  // Novo usuário
  const [newOpen, setNewOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin" | "master">("user");
  const [creating, setCreating] = useState(false);

  // Destinatários de e-mail
  const [destinatarios, setDestinatarios] = useState<any[]>([]);
  const [destNome, setDestNome] = useState("");
  const [destEmail, setDestEmail] = useState("");
  const [savingDest, setSavingDest] = useState(false);

  useEffect(() => {
    setAppName(settings.app_name);
    setTextColor(settings.card_text_color);
    setBgColor(settings.card_bg_color);
  }, [settings]);

  const loadUsers = async () => {
    const { data: profs } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const map: Record<string, string[]> = {};
    roles?.forEach((r) => {
      map[r.user_id] = [...(map[r.user_id] ?? []), r.role];
    });
    setUsers(profs ?? []);
    setRolesMap(map);
  };

  useEffect(() => { if (isAdmin) { loadUsers(); loadDestinatarios(); } }, [isAdmin]);

  const loadDestinatarios = async () => {
    const { data } = await supabase.from("email_destinatarios").select("*").order("nome");
    setDestinatarios(data ?? []);
  };

  const addDestinatario = async () => {
    if (!destNome.trim() || !destEmail.trim()) { toast.error("Preencha nome e e-mail"); return; }
    if (!destEmail.includes("@")) { toast.error("E-mail inválido"); return; }
    setSavingDest(true);
    const { error } = await supabase.from("email_destinatarios").insert({
      nome: destNome.trim(),
      email: destEmail.trim().toLowerCase(),
    });
    setSavingDest(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Destinatário cadastrado");
    setDestNome(""); setDestEmail("");
    loadDestinatarios();
  };

  const toggleDestAtivo = async (d: any) => {
    await supabase.from("email_destinatarios").update({ ativo: !d.ativo }).eq("id", d.id);
    loadDestinatarios();
  };

  const removerDestinatario = async (id: string) => {
    await supabase.from("email_destinatarios").delete().eq("id", id);
    loadDestinatarios();
  };

  if (!isAdmin) return <p className="text-muted-foreground">Acesso restrito.</p>;

  const saveAppSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase.from("app_settings").update({
      app_name: appName,
      card_text_color: textColor,
      card_bg_color: bgColor,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setSavingSettings(false);
    if (error) toast.error(error.message);
    else { toast.success("Personalização salva"); refresh(); }
  };

  const uploadAsset = async (file: File, field: "logo_url" | "login_image_url" | "background_url") => {
    const ext = file.name.split(".").pop();
    const path = `${field}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("app-assets").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("app-assets").getPublicUrl(path);
    const update: any = { [field]: data.publicUrl, updated_at: new Date().toISOString() };
    await supabase.from("app_settings").update(update).eq("id", 1);
    toast.success("Imagem atualizada");
    refresh();
  };

  const createUser = async () => {
    if (!newEmail || !newPass) { toast.error("Preencha email e senha"); return; }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { email: newEmail, password: newPass, display_name: newName, role: newRole },
    });
    setCreating(false);
    if (error || data?.error) {
      toast.error(error?.message || data?.error || "Erro ao criar usuário");
      return;
    }
    toast.success("Usuário criado!");
    setNewOpen(false);
    setNewEmail(""); setNewPass(""); setNewName(""); setNewRole("user");
    loadUsers();
  };

  const toggleAtivo = async (u: any) => {
    await supabase.from("profiles").update({ ativo: !u.ativo }).eq("id", u.id);
    loadUsers();
  };

  const share = async () => {
    const url = window.location.origin;
    if (navigator.share) {
      try { await navigator.share({ title: settings.app_name, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado!");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie usuários e personalização do app</p>
        </div>
        <Button variant="outline" onClick={share}><Share2 className="h-4 w-4 mr-2" /> Compartilhar</Button>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="emails">Destinatários de E-mail</TabsTrigger>
          <TabsTrigger value="cards">Estilo dos Cards</TabsTrigger>
          {isMaster && <TabsTrigger value="brand">Personalização Master</TabsTrigger>}
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground shadow-glow"><UserPlus className="h-4 w-4 mr-2" /> Novo Usuário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Cadastrar usuário</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-2" /></div>
                <div><Label>E-mail</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="mt-2" /></div>
                <div><Label>Senha</Label><Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} className="mt-2" /></div>
                <div>
                  <Label>Nível</Label>
                  <Select value={newRole} onValueChange={(v: any) => setNewRole(v)}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Usuário</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      {isMaster && <SelectItem value="master">Master</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createUser} disabled={creating}>{creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card className="p-0 overflow-hidden border-border/50 shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papéis</TableHead>
                  <TableHead>Ativo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.display_name || "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell className="flex gap-1 flex-wrap">
                      {(rolesMap[u.user_id] ?? []).map((r) => (
                        <Badge key={r} variant={r === "master" ? "default" : "secondary"}>{r}</Badge>
                      ))}
                    </TableCell>
                    <TableCell><Switch checked={u.ativo} onCheckedChange={() => toggleAtivo(u)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>


        <TabsContent value="emails" className="space-y-4">
          <Card className="p-5 border-border/50 shadow-card space-y-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Cadastrar destinatário</h3>
              <p className="text-xs text-muted-foreground mt-1">Esses e-mails aparecerão como opção ao enviar processos arquivados.</p>
            </div>
            <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <Label>Nome</Label>
                <Input className="mt-2" value={destNome} onChange={(e) => setDestNome(e.target.value)} placeholder="Ex: João Silva" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input className="mt-2" type="email" value={destEmail} onChange={(e) => setDestEmail(e.target.value)} placeholder="joao@empresa.com" />
              </div>
              <Button onClick={addDestinatario} disabled={savingDest} className="gradient-primary text-primary-foreground">
                {savingDest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Adicionar
              </Button>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden border-border/50 shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {destinatarios.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum destinatário cadastrado</TableCell></TableRow>
                ) : destinatarios.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.nome}</TableCell>
                    <TableCell className="font-mono text-xs">{d.email}</TableCell>
                    <TableCell><Switch checked={d.ativo} onCheckedChange={() => toggleDestAtivo(d)} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => removerDestinatario(d.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="cards">
          <Card className="p-6 border-border/50 shadow-card space-y-4 max-w-xl">
            <div>
              <Label>Cor do texto dos cards</Label>
              <div className="flex gap-3 mt-2">
                <Input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-20 h-10" />
                <Input value={textColor} onChange={(e) => setTextColor(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Cor de fundo dos cards</Label>
              <div className="flex gap-3 mt-2">
                <Input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-20 h-10" />
                <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
              </div>
            </div>
            <div className="p-5 rounded-lg" style={{ backgroundColor: bgColor, color: textColor }}>
              <p className="text-sm opacity-80">Pré-visualização</p>
              <p className="text-3xl font-bold mt-2">123</p>
            </div>
            <Button onClick={saveAppSettings} disabled={savingSettings}>
              {savingSettings && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar
            </Button>
          </Card>
        </TabsContent>

        {isMaster && (
          <TabsContent value="brand">
            <Card className="p-6 border-border/50 shadow-card space-y-5 max-w-xl">
              <div>
                <Label>Nome do App</Label>
                <Input value={appName} onChange={(e) => setAppName(e.target.value)} className="mt-2" />
                <Button onClick={saveAppSettings} disabled={savingSettings} className="mt-3">
                  {savingSettings && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar nome
                </Button>
              </div>

              <AssetUploader label="Logo" current={settings.logo_url} onUpload={(f) => uploadAsset(f, "logo_url")} />
              <AssetUploader label="Imagem da tela de login" current={settings.login_image_url} onUpload={(f) => uploadAsset(f, "login_image_url")} />
              <AssetUploader label="Imagem de fundo do app" current={settings.background_url} onUpload={(f) => uploadAsset(f, "background_url")} />
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function AssetUploader({ label, current, onUpload }: { label: string; current: string | null; onUpload: (f: File) => void }) {
  const [loading, setLoading] = useState(false);
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-2 flex items-center gap-3">
        {current && <img src={current} alt={label} className="h-16 w-16 rounded-lg object-cover border border-border" />}
        <label className="flex-1 cursor-pointer border-2 border-dashed border-border rounded-lg p-4 text-center text-sm hover:border-primary/50">
          <Upload className="h-4 w-4 inline mr-2" /> {loading ? "Enviando…" : "Selecionar imagem"}
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            setLoading(true); await onUpload(f); setLoading(false);
            e.target.value = "";
          }} />
        </label>
      </div>
    </div>
  );
}
