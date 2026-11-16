import React, { useRef } from "react";
import { MonitorUp, MonitorOff, Camera, Upload, AlertCircle } from "lucide-react";

export type AutoPollMode = "off" | "2000" | "4000";

interface LiveCapturePanelProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isSharing: boolean;
  isAnalyzing: boolean;
  autoPoll: AutoPollMode;
  onAutoPollChange: (mode: AutoPollMode) => void;
  onStartShare: () => void;
  onStopShare: () => void;
  onAnalyzeFrame: () => void;
  onUploadImage: (file: File) => void;
  lastSnapshotUrl: string | null;
  lastCaptureLabel: string;
  visionError: string | null;
  visionNotes: string | null;
  lastVisionLatencyMs: number | null;
}

export const LiveCapturePanel: React.FC<LiveCapturePanelProps> = ({
  videoRef,
  isSharing,
  isAnalyzing,
  autoPoll,
  onAutoPollChange,
  onStartShare,
  onStopShare,
  onAnalyzeFrame,
  onUploadImage,
  lastSnapshotUrl,
  lastCaptureLabel,
  visionError,
  visionNotes,
  lastVisionLatencyMs,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section className="rounded-lg border border-[#243044] bg-[#121824] p-4">
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#243044]">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Live Table Capture
          </h2>
          <p className="text-xs text-slate-400 font-mono-tabular">
            {lastCaptureLabel}
            {lastVisionLatencyMs !== null ? ` · ${lastVisionLatencyMs}ms` : ""}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {isSharing ? (
            <button
              type="button"
              onClick={onStopShare}
              className="inline-flex items-center gap-1.5 rounded border border-red-500/40 bg-red-950/30 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950/50 cursor-pointer whitespace-nowrap"
            >
              <MonitorOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Stop Share</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartShare}
              className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-950/30 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-950/50 cursor-pointer whitespace-nowrap"
            >
              <MonitorUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Share Window</span>
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-12 items-stretch">
        {/* Live Video or Last Screenshot Preview */}
        <div className="md:col-span-7 relative h-[185px] w-full overflow-hidden rounded-md border border-[#243044] bg-[#0B0F17] flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-contain ${isSharing ? "block" : "hidden"}`}
          />

          {!isSharing && lastSnapshotUrl && (
            <img
              src={lastSnapshotUrl}
              alt="Captured poker table frame"
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
            />
          )}

          {!isSharing && !lastSnapshotUrl && (
            <div className="px-6 text-center">
              <p className="text-xs font-medium text-slate-300">
                Share your poker window for real-time Spacebar or auto-poll reading.
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                You can also upload or paste (Ctrl+V) a table screenshot, or edit cards manually in Table State.
              </p>
            </div>
          )}
        </div>

        {/* Right Controls & Vision Feedback */}
        <div className="md:col-span-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onAnalyzeFrame}
                disabled={!isSharing || isAnalyzing}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isAnalyzing ? "Reading..." : "Analyze (Space)"}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1.5 rounded border border-[#243044] bg-[#1A2232] px-3 py-2 text-xs font-medium text-slate-200 hover:border-slate-500 cursor-pointer whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Upload</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadImage(file);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="flex items-center justify-between rounded border border-[#243044] bg-[#0B0F17] px-2.5 py-1.5">
              <span className="text-[11px] font-medium text-slate-400">
                Auto-Capture
              </span>
              <div className="flex items-center gap-1 text-[11px]">
                {(
                  [
                    { id: "off", label: "Manual" },
                    { id: "2000", label: "2s" },
                    { id: "4000", label: "4s" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onAutoPollChange(opt.id)}
                    className={`rounded px-2 py-1 font-medium cursor-pointer transition-colors ${
                      autoPoll === opt.id
                        ? "bg-[#1A2232] text-emerald-300"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visionError ? (
            <div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
              <span className="line-clamp-3">{visionError}</span>
            </div>
          ) : visionNotes ? (
            <div className="rounded border border-[#243044] bg-[#1A2232] px-3 py-2 text-xs text-slate-300">
              <span className="font-semibold text-slate-200">Vision Note: </span>
              <span className="line-clamp-3">{visionNotes}</span>
            </div>
          ) : (
            <div className="rounded border border-[#243044] bg-[#1A2232]/60 px-3 py-2 text-[11px] text-slate-400">
              Press <strong className="font-mono-tabular text-slate-200">Space</strong> during screen share or <strong className="font-mono-tabular text-slate-200">Ctrl+V</strong> to parse any poker table screenshot into the GTO solver.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
