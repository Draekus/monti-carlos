import React, { useMemo, useState } from "react";
import { Copy, Check, Download, Play } from "lucide-react";
import {
  generateTexasSolverScript,
  parseTexasSolverScript,
} from "../poker/presets";
import type { SolverConfig, TableState } from "../poker/types";

interface TexasSolverScriptViewProps {
  tableState: TableState;
  solverConfig: SolverConfig;
  onApplyImportedScript: (
    statePatch: Partial<TableState>,
    configPatch: Partial<SolverConfig>
  ) => void;
}

export const TexasSolverScriptView: React.FC<TexasSolverScriptViewProps> = ({
  tableState,
  solverConfig,
  onApplyImportedScript,
}) => {
  const generatedScript = useMemo(
    () => generateTexasSolverScript(tableState, solverConfig),
    [tableState, solverConfig]
  );

  const [copied, setCopied] = useState(false);
  const [importDraft, setImportDraft] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([generatedScript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `texassolver_${tableState.street}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyImport = () => {
    if (!importDraft.trim()) return;
    const { statePatch, configPatch, summary } = parseTexasSolverScript(
      importDraft,
      tableState,
      solverConfig
    );
    onApplyImportedScript(statePatch, configPatch);
    setImportMessage(
      summary.length > 0
        ? `Applied: ${summary.join(" · ")}`
        : "No recognized TexasSolver directives found."
    );
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Live Generated TexasSolver Console Script */}
      <section className="lg:col-span-7 rounded-lg border border-[#243044] bg-[#121824] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#243044]">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Generated TexasSolver Script
            </h2>
            <p className="text-xs text-slate-400">
              Synced live to your active pot, stack, board, IP/OOP ranges, and bet tree.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded border border-[#243044] bg-[#1A2232] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 cursor-pointer"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              )}
              <span>{copied ? "Copied" : "Copy Script"}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export .txt</span>
            </button>
          </div>
        </div>

        <pre className="mt-4 max-h-[460px] overflow-auto rounded-md border border-[#243044] bg-[#0B0F17] p-4 font-mono-tabular text-xs leading-relaxed text-emerald-200">
          {generatedScript}
        </pre>
      </section>

      {/* Import TexasSolver Script into Web HUD */}
      <section className="lg:col-span-5 rounded-lg border border-[#243044] bg-[#121824] p-4 sm:p-5 flex flex-col">
        <div className="pb-3 border-b border-[#243044]">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Import TexasSolver Config
          </h2>
          <p className="text-xs text-slate-400">
            Paste a console_solver script (set_pot, set_board, set_range_ip, set_bet_sizes) to hydrate the live HUD.
          </p>
        </div>

        <textarea
          rows={12}
          value={importDraft}
          onChange={(e) => setImportDraft(e.target.value)}
          placeholder={`set_pot 12\nset_effective_stack 94\nset_board Ks,9d,4c\nset_range_oop AA,KK,QQ,AKs,AQs\nset_range_ip JJ,TT,99,AQs,KQs\nset_bet_sizes ip,flop,bet,33,75`}
          className="mt-4 flex-1 rounded-md border border-[#243044] bg-[#0B0F17] p-3 font-mono-tabular text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />

        {importMessage && (
          <div className="mt-3 rounded border border-emerald-500/40 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-200">
            {importMessage}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setImportDraft(generatedScript)}
            className="rounded border border-[#243044] bg-[#1A2232] px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 cursor-pointer"
          >
            Load Current Script
          </button>
          <button
            type="button"
            onClick={handleApplyImport}
            disabled={!importDraft.trim()}
            className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Apply & Solve</span>
          </button>
        </div>
      </section>
    </div>
  );
};
