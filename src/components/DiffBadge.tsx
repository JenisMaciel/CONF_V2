import { ArrowUp, ArrowDown, Check } from "lucide-react";
import { cn, fmtNum } from "@/lib/utils";

interface DiffBadgeProps {
  value: number;
  className?: string;
}

/**
 * Badge para coluna "Diferença":
 * - 0 → verde com ✓
 * - positivo → azul com ↑
 * - negativo → vermelho com ↓
 */
export function DiffBadge({ value, className }: DiffBadgeProps) {
  const v = Number(value) || 0;
  const isZero = v === 0;
  const isPos = v > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-1 min-w-[88px] px-3 py-1.5 rounded-full text-sm font-semibold",
        isZero && "bg-success text-success-foreground",
        isPos && "bg-primary text-primary-foreground",
        !isZero && !isPos && "bg-destructive text-destructive-foreground",
        className,
      )}
    >
      {isZero ? (
        <>
          0 <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </>
      ) : isPos ? (
        <>
          +{fmtNum(v)} <ArrowUp className="h-3.5 w-3.5" strokeWidth={3} />
        </>
      ) : (
        <>
          {fmtNum(v)} <ArrowDown className="h-3.5 w-3.5" strokeWidth={3} />
        </>
      )}
    </span>
  );
}