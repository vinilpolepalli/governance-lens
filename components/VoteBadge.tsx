import type { DecisionVote } from "@/lib/types";

const STYLES: Record<DecisionVote, string> = {
  FOR: "border-[#d8e9dc] bg-[#f2f9f4] text-[#15803d]",
  AGAINST: "border-[#f0d9d6] bg-[#fdf5f4] text-[#b91c1c]",
  FLAG: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  // Incomplete assessment: dashed, muted gray so it never reads as a clean verdict.
  REVIEW: "border-dashed border-ink-faint bg-white text-ink-muted",
};

export function VoteBadge({ vote, size = "md" }: { vote: DecisionVote; size?: "sm" | "md" }) {
  return (
    <span
      title={vote === "REVIEW" ? "Incomplete assessment: no enabled rule could evaluate this item" : undefined}
      className={`badge ${STYLES[vote]} ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}
    >
      {vote}
    </span>
  );
}
