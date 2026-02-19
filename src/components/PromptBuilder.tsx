import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, AlertTriangle, Eye, EyeOff, Copy, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

export interface PromptParams {
  preserveHead: boolean;
  preserveOtherGarments: boolean;
  view: "front" | "back" | "side";
  fitStrictness: number;
  shadowEnforcement: boolean;
  shadowLevel: "soft" | "medium" | "hard";
  framing: "preserve" | "waist-legs" | "full-body";
  resolution: "2k" | "4k" | "8k";
  variations: 1 | 2 | 3;
  quality: "fast" | "balanced" | "hd";
  customPrompt: string;
}

interface PromptBuilderProps {
  params: PromptParams;
  onChange: (params: PromptParams) => void;
}

function assemblePrompt(params: PromptParams): string {
  const lines: string[] = [];

  lines.push(`Professional fashion photography, ${params.view}-view, photorealistic clothing swap.`);

  const viewDesc = { front: "facing camera directly", back: "back-facing, rear view", side: "side-profile angle" }[params.view];
  lines.push(`Model is ${viewDesc}. Natural studio lighting with ${params.shadowLevel} shadows.`);

  if (params.fitStrictness < 33) {
    lines.push("Soft draping, relaxed fit interpretation.");
  } else if (params.fitStrictness < 66) {
    lines.push("True-to-garment fit, moderate draping.");
  } else {
    lines.push("Strict garment fit preservation. Exact silhouette match required.");
  }

  if (params.shadowEnforcement) {
    lines.push(`Enforce realistic ${params.shadowLevel} drop shadows and fabric micro-shadows.`);
  }

  const framingDesc = {
    "preserve": "Maintain original model framing exactly.",
    "waist-legs": "Crop to include waist and legs in frame.",
    "full-body": "Full-body composition head to toe.",
  }[params.framing];
  lines.push(framingDesc);

  if (params.preserveHead) lines.push("Preserve model's original head, hair, and face exactly.");
  if (params.preserveOtherGarments) lines.push("Preserve all other garments and accessories unchanged.");

  lines.push(`Do not alter the model's pose or body proportions.`);
  lines.push(`Do not add watermarks, logos, or text overlays.`);
  lines.push(`Do not change background or environment.`);
  lines.push(`Output resolution: ${params.resolution.toUpperCase()}, quality: ${params.quality}.`);

  return lines.join(" ");
}

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!value)}
    className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all",
      value
        ? "bg-primary/10 border-primary/40 text-primary"
        : "bg-surface-2 border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
    )}
  >
    <div className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors",
      value ? "bg-primary border-primary" : "border-muted-foreground"
    )}>
      {value && <div className="w-1.5 h-1.5 rounded-sm bg-primary-foreground" />}
    </div>
    {label}
  </button>
);

const SelectChips = <T extends string>({
  label, options, value, onChange
}: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 rounded-lg border text-sm transition-all",
            value === opt.value
              ? "bg-primary/10 border-primary/50 text-primary font-medium"
              : "bg-surface-2 border-border text-muted-foreground hover:text-foreground hover:border-border/80"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

export function PromptBuilder({ params, onChange }: PromptBuilderProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [rawPrompt, setRawPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  const assembled = assemblePrompt(params);

  useEffect(() => {
    if (!showRaw) setRawPrompt(assembled);
  }, [assembled, showRaw]);

  const handleRawChange = (val: string) => {
    setRawPrompt(val);
    onChange({ ...params, customPrompt: val });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(showRaw ? rawPrompt : assembled);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const set = <K extends keyof PromptParams>(key: K, val: PromptParams[K]) =>
    onChange({ ...params, [key]: val });

  return (
    <div className="flex flex-col gap-6">
      {/* Structured controls */}
      <div className="grid gap-5">
        {/* Preserve toggles */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Preserve</span>
          <div className="flex flex-wrap gap-2">
            <Toggle label="Head & Face" value={params.preserveHead} onChange={(v) => set("preserveHead", v)} />
            <Toggle label="Other Garments" value={params.preserveOtherGarments} onChange={(v) => set("preserveOtherGarments", v)} />
          </div>
        </div>

        {/* View */}
        <SelectChips
          label="View"
          options={[
            { value: "front", label: "Front" },
            { value: "back", label: "Back" },
            { value: "side", label: "Side" },
          ]}
          value={params.view}
          onChange={(v) => set("view", v)}
        />

        {/* Fit strictness */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Fit Strictness</span>
            <span className="text-xs font-mono text-primary">
              {params.fitStrictness < 33 ? "Soft" : params.fitStrictness < 66 ? "Medium" : "Strict"}
            </span>
          </div>
          <Slider
            value={[params.fitStrictness]}
            onValueChange={([v]) => set("fitStrictness", v)}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Relaxed</span>
            <span>Strict</span>
          </div>
        </div>

        {/* Shadow */}
        <div className="flex flex-col gap-2">
          <Toggle
            label="Shadow Enforcement"
            value={params.shadowEnforcement}
            onChange={(v) => set("shadowEnforcement", v)}
          />
          <AnimatePresence>
            {params.shadowEnforcement && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <SelectChips
                  label="Shadow Level"
                  options={[
                    { value: "soft", label: "Soft" },
                    { value: "medium", label: "Medium" },
                    { value: "hard", label: "Hard" },
                  ]}
                  value={params.shadowLevel}
                  onChange={(v) => set("shadowLevel", v)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Framing */}
        <SelectChips
          label="Framing"
          options={[
            { value: "preserve", label: "Preserve Frame" },
            { value: "waist-legs", label: "Waist + Legs" },
            { value: "full-body", label: "Full Body" },
          ]}
          value={params.framing}
          onChange={(v) => set("framing", v)}
        />

        {/* Output controls */}
        <div className="grid grid-cols-3 gap-3">
          <SelectChips
            label="Resolution"
            options={[
              { value: "2k", label: "2K" },
              { value: "4k", label: "4K" },
              { value: "8k", label: "8K" },
            ]}
            value={params.resolution}
            onChange={(v) => set("resolution", v)}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Variations</span>
            <div className="flex gap-2 flex-wrap">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => set("variations", n)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm transition-all",
                    params.variations === n
                      ? "bg-primary/10 border-primary/50 text-primary font-medium"
                      : "bg-surface-2 border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <SelectChips
            label="Quality"
            options={[
              { value: "fast", label: "Fast" },
              { value: "balanced", label: "Balanced" },
              { value: "hd", label: "HD" },
            ]}
            value={params.quality}
            onChange={(v) => set("quality", v)}
          />
        </div>
      </div>

      {/* Prompt Preview / Editor */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-2 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground font-mono uppercase tracking-wider">
            {showRaw ? "Edit Prompt" : "Assembled Prompt"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showRaw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showRaw ? "Preview" : "Edit Raw"}
            </button>
            {showRaw && (
              <button
                onClick={() => { setRawPrompt(assembled); onChange({ ...params, customPrompt: "" }); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        <div className="bg-surface-1 p-4">
          {showRaw ? (
            <textarea
              value={rawPrompt}
              onChange={(e) => handleRawChange(e.target.value)}
              className="w-full h-40 bg-transparent text-sm font-mono text-foreground resize-none outline-none leading-relaxed"
              placeholder="Edit your prompt here..."
              maxLength={2000}
            />
          ) : (
            <p className="text-sm font-mono text-foreground/80 leading-relaxed">{assembled}</p>
          )}
        </div>
        <div className="px-4 py-2 bg-surface-2 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">
            {(showRaw ? rawPrompt : assembled).length} / 2000 chars
          </span>
          {(showRaw ? rawPrompt : assembled).length > 1800 && (
            <div className="flex items-center gap-1.5 text-gold text-xs">
              <AlertTriangle className="w-3 h-3" />
              Approaching limit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { assemblePrompt };
