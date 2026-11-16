import { solveGtoSpot } from "../poker/cfrSolver";
import type { SolverConfig, SolverResult, TableState } from "../poker/types";

interface WorkerSolveMessage {
  type: "SOLVE";
  requestId: number;
  state: TableState;
  config: SolverConfig;
}

let latestRequestId = 0;

self.onmessage = (event: MessageEvent<WorkerSolveMessage>) => {
  const msg = event.data;
  if (!msg || msg.type !== "SOLVE") return;

  latestRequestId = msg.requestId;

  try {
    const result: SolverResult = solveGtoSpot(
      msg.requestId,
      msg.state,
      msg.config,
      (partial) => {
        if (msg.requestId === latestRequestId) {
          self.postMessage({ type: "PROGRESS", result: partial });
        }
      },
      () => msg.requestId !== latestRequestId
    );

    if (msg.requestId === latestRequestId) {
      self.postMessage({ type: "DONE", result });
    }
  } catch (err) {
    self.postMessage({
      type: "ERROR",
      requestId: msg.requestId,
      error: err instanceof Error ? err.message : "Solver error",
    });
  }
};
