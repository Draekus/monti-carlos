import React from "react";
import { ScanEye, MonitorUp } from "lucide-react";

export type WorkspaceTab = "compact" | "hud" | "config" | "script";

interface TopBarProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  isSharingScreen: boolean;
  isAnalyzingVision: boolean;
  onPrimaryAction: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onTabChange,
  isSharingScreen,
  isAnalyzingVision,
  onPrimaryAction,
}) => {
  return (
    <header className="w-full border-b border-[#243044] bg-[#0B0F17]">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
        {/* Zone 1: Single-element wordmark */}
        <button
          type="button"
          onClick={() => onTabChange("hud")}
          className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
        >
          SolverHUD
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="flex items-center gap-6" aria-label="Workspace views">
          {(
            [
              { id: "hud", label: "Live HUD" },
              { id: "compact", label: "Compact HUD" },
              { id: "config", label: "Range & Tree" },
              { id: "script", label: "TexasSolver Script" },
            ] as const
          ).map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`relative py-1 text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded ${
                  active ? "text-slate-100" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-0 -bottom-[15px] h-[2px] bg-emerald-500" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={isAnalyzingVision}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {isSharingScreen ? (
              <ScanEye className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <MonitorUp className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>
              {isAnalyzingVision
                ? "Analyzing..."
                : isSharingScreen
                ? "Analyze Frame (Space)"
                : "Share Table"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
