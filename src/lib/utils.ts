import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata número com separador de milhar pt-BR (sem casas decimais por padrão). */
export function fmtNum(value: number | string | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || value === "") return "0";
  const n = typeof value === "number" ? value : Number(value);
  if (!isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
