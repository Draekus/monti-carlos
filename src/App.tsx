/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar, type WorkspaceTab } from "./components/TopBar";
import { TableStateBar } from "./components/TableStateBar";
import { StrategyHudPanel } from "./components/StrategyHudPanel";
import { RangeMatrix13x13 } from "./components/RangeMatrix13x13";
import { LiveCapturePanel, type AutoPollMode } from "./components/LiveCapturePanel";
import { EquityGauge } from "./components/EquityGauge";
import { RangeAndTreeConfig } from "./components/RangeAndTreeConfig";
import { TexasSolverScriptView } from "./components/TexasSolverScriptView";
import { CompactActionBanner } from "./components/CompactActionBanner";
import { intToCard } from "./poker/cards";
import {
  DEFAULT_SOLVER_CONFIG,
  INITIAL_TABLE_STATE,
  RANGE_PRESETS,
} from "./poker/presets";
import type { SolverConfig, SolverResult, TableState } from "./poker/types";

interface VisionApiResponse {
  hero_hole_cards: string[];
  community_cards: string[];
  pot_size: number;
  to_call: number;
  effective_stack: number;
  active_opponents: number;
  street: "preflop" | "flop" | "turn" | "river";
  hero_position: "IP" | "OOP" | "unknown";
  notes: string | null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("hud");
  const [tableState, setTableState] = useState<TableState>(INITIAL_TABLE_STATE);
  const [solverConfig, setSolverConfig] = useState<SolverConfig>(DEFAULT_SOLVER_CONFIG);

  // Solver Worker State
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Live Screen Share & Vision State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [autoPoll, setAutoPoll] = useState<AutoPollMode>("off");
  const [lastSnapshotUrl, setLastSnapshotUrl] = useState<string | null>(null);
  const [lastCaptureLabel, setLastCaptureLabel] = useState<string>("Ready for live capture");
  const [visionError, setVisionError] = useState<string | null>(null);
  const [visionNotes, setVisionNotes] = useState<string | null>(null);
  const [lastVisionLatencyMs, setLastVisionLatencyMs] = useState<number | null>(null);

  // Initialize Web Worker
  useEffect(() => {
    const worker = new Worker(new URL("./workers/solverWorker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent<{ type: string; result?: SolverResult; error?: string }>) => {
      const msg = event.data;
      if ((msg.type === "PROGRESS" || msg.type === "DONE") && msg.result) {
        if (msg.result.requestId === requestIdRef.current) {
          setSolverResult(msg.result);
          setSelectedNodeId(msg.result.activeNodeId);
        }
      }
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Dispatch solve whenever tableState or solverConfig changes
  useEffect(() => {
    if (!workerRef.current) return;
    requestIdRef.current += 1;
    workerRef.current.postMessage({
      type: "SOLVE",
      requestId: requestIdRef.current,
      state: tableState,
      config: solverConfig,
    });
  }, [tableState, solverConfig]);

  const handleStatePatch = useCallback((patch: Partial<TableState>) => {
    setTableState((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleConfigPatch = useCallback((patch: Partial<SolverConfig>) => {
    setSolverConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleApplyPreset = useCallback((presetId: string) => {
    const preset = RANGE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSolverConfig((prev) => ({
      ...prev,
      presetId: preset.id,
      ipRange: preset.ipRange,
      oopRange: preset.oopRange,
    }));
    setTableState((prev) => ({
      ...prev,
      potSize: preset.defaultPot,
      effectiveStack: preset.defaultStack,
      toCall: 0,
      source: "preset",
    }));
  }, []);

  const handleDealRandomFlop = useCallback(() => {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    const hero = [intToCard(deck[0]), intToCard(deck[1])];
    const board = [intToCard(deck[2]), intToCard(deck[3]), intToCard(deck[4])];
    setTableState((prev) => ({
      ...prev,
      heroCards: hero,
      boardCards: board,
      street: "flop",
      toCall: 0,
      source: "manual",
    }));
  }, []);

  const handleResetHand = useCallback(() => {
    setTableState((prev) => ({
      ...prev,
      boardCards: [],
      street: "preflop",
      toCall: 0,
      source: "manual",
    }));
  }, []);

  // Stop sharing cleanly
  const stopScreenShare = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsSharing(false);
    setAutoPoll("off");
    setLastCaptureLabel("Screen share stopped");
  }, []);

  // Start browser getDisplayMedia screen share
  const startScreenShare = useCallback(async () => {
    try {
      setVisionError(null);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 15, max: 30 },
        },
        audio: false,
      });

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          stopScreenShare();
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const settings = videoTrack?.getSettings();
      const dimLabel =
        settings?.width && settings?.height
          ? `Live Stream (${settings.width} × ${settings.height})`
          : "Live Window Stream";

      setIsSharing(true);
      setLastCaptureLabel(dimLabel);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Screen capture permission was cancelled or unavailable.";
      setVisionError(msg);
    }
  }, [stopScreenShare]);

  // Send a base64 image frame to /api/analyze-table
  const submitImageForVision = useCallback(
    async (dataUrl: string, mimeType: string, label: string) => {
      if (isAnalyzing) return;
      setIsAnalyzing(true);
      setVisionError(null);
      const t0 = performance.now();

      try {
        const resp = await fetch("/api/analyze-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: dataUrl, mimeType }),
        });

        const payload = (await resp.json()) as VisionApiResponse & { error?: string };
        if (!resp.ok) {
          throw new Error(payload.error || `Vision error (${resp.status})`);
        }

        setLastVisionLatencyMs(Math.round(performance.now() - t0));
        setLastCaptureLabel(label);
        setVisionNotes(payload.notes ?? null);

        if (payload.hero_hole_cards.length !== 2) {
          setVisionError(
            `Could not detect 2 Hero hole cards (detected: ${
              payload.hero_hole_cards.join(", ") || "none"
            }). Adjust window crop or click card slots to edit manually.`
          );
          if (payload.community_cards.length >= 3) {
            setTableState((prev) => ({
              ...prev,
              boardCards: payload.community_cards,
              potSize: payload.pot_size > 0 ? payload.pot_size : prev.potSize,
              toCall: payload.to_call,
              activeOpponents: payload.active_opponents,
              street: payload.street,
              source: "vision",
            }));
          }
          return;
        }

        setTableState((prev) => ({
          ...prev,
          heroCards: payload.hero_hole_cards,
          boardCards: payload.community_cards,
          potSize: payload.pot_size > 0 ? payload.pot_size : prev.potSize,
          toCall: payload.to_call,
          effectiveStack:
            payload.effective_stack > 0 ? payload.effective_stack : prev.effectiveStack,
          activeOpponents: payload.active_opponents,
          street: payload.street,
          heroPosition:
            payload.hero_position === "IP" || payload.hero_position === "OOP"
              ? payload.hero_position
              : prev.heroPosition,
          notes: payload.notes,
          source: "vision",
        }));
      } catch (err) {
        setVisionError(err instanceof Error ? err.message : "Failed to analyze table image.");
      } finally {
        setIsAnalyzing(false);
      }
    },
    [isAnalyzing]
  );

  // Grab frame from active getDisplayMedia video stream
  const analyzeLiveFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isSharing || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const maxW = 1600;
    const scale = Math.min(1, maxW / video.videoWidth);
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    setLastSnapshotUrl(dataUrl);
    void submitImageForVision(dataUrl, "image/jpeg", `Captured ${w} × ${h}`);
  }, [isSharing, submitImageForVision]);

  // Handle uploaded or pasted image file
  const handleImageFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setLastSnapshotUrl(reader.result);
          void submitImageForVision(
            reader.result,
            file.type || "image/png",
            `Image (${file.name || "Pasted"})`
          );
        }
      };
      reader.readAsDataURL(file);
    },
    [submitImageForVision]
  );

  // Spacebar hotkey for instant capture (mirrors Python assistant)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      if (isSharing) {
        e.preventDefault();
        analyzeLiveFrame();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSharing, analyzeLiveFrame]);

  // Clipboard paste (Ctrl+V) for zero-friction screenshot testing
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            handleImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleImageFile]);

  // Auto-poll interval when enabled during active screen share
  useEffect(() => {
    if (!isSharing || autoPoll === "off") return;
    const ms = parseInt(autoPoll, 10);
    const id = window.setInterval(() => {
      analyzeLiveFrame();
    }, ms);
    return () => window.clearInterval(id);
  }, [isSharing, autoPoll, analyzeLiveFrame]);

  const activeNode = useMemo(() => {
    if (!solverResult) return null;
    if (selectedNodeId && solverResult.nodes[selectedNodeId]) {
      return solverResult.nodes[selectedNodeId];
    }
    return solverResult.nodes[solverResult.activeNodeId] ?? solverResult.nodes[solverResult.rootNodeId] ?? null;
  }, [solverResult, selectedNodeId]);

  // Re-attach live MediaStream when switching between Live HUD and Compact HUD
  useEffect(() => {
    if (isSharing && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        void videoRef.current.play().catch(() => {});
      }
    }
  }, [activeTab, isSharing]);

  const handlePrimaryTopBarAction = () => {
    if (isSharing) {
      analyzeLiveFrame();
    } else {
      if (activeTab !== "hud" && activeTab !== "compact") {
        setActiveTab("hud");
      }
      void startScreenShare();
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#F1F5F9]">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isSharingScreen={isSharing}
        isAnalyzingVision={isAnalyzing}
        onPrimaryAction={handlePrimaryTopBarAction}
      />

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
        {activeTab === "hud" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
            {/* Left Primary Tactical Column */}
            <div className="lg:col-span-8 space-y-5">
              <LiveCapturePanel
                videoRef={videoRef}
                isSharing={isSharing}
                isAnalyzing={isAnalyzing}
                autoPoll={autoPoll}
                onAutoPollChange={setAutoPoll}
                onStartShare={startScreenShare}
                onStopShare={stopScreenShare}
                onAnalyzeFrame={analyzeLiveFrame}
                onUploadImage={handleImageFile}
                lastSnapshotUrl={lastSnapshotUrl}
                lastCaptureLabel={lastCaptureLabel}
                visionError={visionError}
                visionNotes={visionNotes}
                lastVisionLatencyMs={lastVisionLatencyMs}
              />

              <StrategyHudPanel
                result={solverResult}
                activeNode={activeNode}
                onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
              />

              <RangeMatrix13x13
                activeNode={activeNode}
                heroHandClass={solverResult?.heroHandClass ?? ""}
              />
            </div>

            {/* Right Table State & Equity Column */}
            <div className="lg:col-span-4 space-y-5">
              <TableStateBar
                state={tableState}
                onChangeState={handleStatePatch}
                onDealRandomFlop={handleDealRandomFlop}
                onResetHand={handleResetHand}
              />

              <EquityGauge
                stats={solverResult?.equityStats ?? null}
                potSize={tableState.potSize}
                toCall={tableState.toCall}
              />
            </div>
          </div>
        )}

        {activeTab === "compact" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
            {/* Left: Live Table Capture + Top Action & Sizing */}
            <div className="lg:col-span-8 space-y-5">
              <LiveCapturePanel
                videoRef={videoRef}
                isSharing={isSharing}
                isAnalyzing={isAnalyzing}
                autoPoll={autoPoll}
                onAutoPollChange={setAutoPoll}
                onStartShare={startScreenShare}
                onStopShare={stopScreenShare}
                onAnalyzeFrame={analyzeLiveFrame}
                onUploadImage={handleImageFile}
                lastSnapshotUrl={lastSnapshotUrl}
                lastCaptureLabel={lastCaptureLabel}
                visionError={visionError}
                visionNotes={visionNotes}
                lastVisionLatencyMs={lastVisionLatencyMs}
              />

              <CompactActionBanner
                result={solverResult}
                activeNode={activeNode}
                onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
              />
            </div>

            {/* Right: Table State */}
            <div className="lg:col-span-4">
              <TableStateBar
                state={tableState}
                onChangeState={handleStatePatch}
                onDealRandomFlop={handleDealRandomFlop}
                onResetHand={handleResetHand}
              />
            </div>
          </div>
        )}

        {activeTab === "config" && (
          <RangeAndTreeConfig
            config={solverConfig}
            onChangeConfig={handleConfigPatch}
            onApplyPreset={handleApplyPreset}
          />
        )}

        {activeTab === "script" && (
          <TexasSolverScriptView
            tableState={tableState}
            solverConfig={solverConfig}
            onApplyImportedScript={(statePatch, configPatch) => {
              if (Object.keys(statePatch).length > 0) {
                setTableState((prev) => ({
                  ...prev,
                  ...statePatch,
                  source: "manual",
                }));
              }
              if (Object.keys(configPatch).length > 0) {
                setSolverConfig((prev) => ({ ...prev, ...configPatch }));
              }
              setActiveTab("hud");
            }}
          />
        )}
      </main>
    </div>
  );
}
