import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AppSettings {
  app_name: string;
  logo_url: string | null;
  login_image_url: string | null;
  background_url: string | null;
  card_text_color: string;
  card_bg_color: string;
}

const DEFAULTS: AppSettings = {
  app_name: "Conferência de Devolução",
  logo_url: null,
  login_image_url: null,
  background_url: null,
  card_text_color: "#ffffff",
  card_bg_color: "#1e293b",
};

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
    if (data) setSettings({ ...DEFAULTS, ...data });
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`app_settings_changes_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return { settings, loading, refresh };
}
