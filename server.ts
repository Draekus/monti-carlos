import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_ID = "gemini-3.1-flash-lite";

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function normalizeCard(raw: string): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  let s = cleaned;
  if (s.startsWith("10")) {
    s = "T" + s.slice(2);
  }
  if (s.length !== 2) return null;
  const rank = s[0].toUpperCase();
  const suit = s[1].toLowerCase();
  if (!"23456789TJQKA".includes(rank) || !"shdc".includes(suit)) {
    return null;
  }
  return `${rank}${suit}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "12mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post("/api/analyze-table", async (req: Request, res: Response) => {
    try {
      const client = getGeminiClient();
      if (!client) {
        res.status(503).json({
          error:
            "GEMINI_API_KEY is not configured. Add it in Settings > Secrets to enable live vision parsing.",
        });
        return;
      }

      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };

      if (!imageBase64 || typeof imageBase64 !== "string") {
        res.status(400).json({ error: "Missing imageBase64 payload." });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const safeMime =
        typeof mimeType === "string" && mimeType.startsWith("image/")
          ? mimeType
          : "image/jpeg";

      const prompt =
        "Analyze this poker table screenshot. Extract the hero's hole cards, " +
        "the community cards on the board, the total pot size, the amount required " +
        "for the hero to call (look at the Call button or facing bet), the hero's approximate effective stack in chips/BB if visible, " +
        "whether the hero appears in position (IP) or out of position (OOP) postflop, and the number of opponents still active in the hand.\n" +
        "Card formatting rules: Rank in {2,3,4,5,6,7,8,9,T,J,Q,K,A} followed by " +
        "lowercase suit in {s,h,d,c}. Example: Ace of Spades = 'As', Ten of Hearts = 'Th'.";

      const response = await client.models.generateContent({
        model: MODEL_ID,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: safeMime,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hero_hole_cards: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Hero's 2 private cards in 2-char format like ['As', 'Kd']. Use 'T' for 10. Empty if not visible.",
              },
              community_cards: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Community board cards (0, 3, 4, or 5 cards) in 2-char format like ['Qh', 'Jc', '2s'].",
              },
              pot_size: {
                type: Type.NUMBER,
                description:
                  "Total pot size currently in the center (numeric value, no currency symbols).",
              },
              to_call: {
                type: Type.NUMBER,
                description:
                  "Amount hero must pay to call right now. 0.0 if hero can check or no bet is facing hero.",
              },
              effective_stack: {
                type: Type.NUMBER,
                description:
                  "Effective remaining stack behind hero/villain if visible, or 0 if not visible.",
              },
              active_opponents: {
                type: Type.INTEGER,
                description:
                  "Number of opponents still in the hand (not folded).",
              },
              street: {
                type: Type.STRING,
                description: "Current street: preflop, flop, turn, or river.",
              },
              hero_position: {
                type: Type.STRING,
                description: "Hero postflop relative position: IP, OOP, or unknown.",
              },
              notes: {
                type: Type.STRING,
                description:
                  "Brief note if any critical info was obscured or uncertain.",
              },
            },
            required: [
              "hero_hole_cards",
              "community_cards",
              "pot_size",
              "to_call",
              "active_opponents",
              "street",
            ],
          },
        },
      });

      const rawText = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawText) as {
        hero_hole_cards?: string[];
        community_cards?: string[];
        pot_size?: number;
        to_call?: number;
        effective_stack?: number;
        active_opponents?: number;
        street?: string;
        hero_position?: string;
        notes?: string;
      };

      const seen = new Set<string>();
      const heroHoleCards: string[] = [];
      for (const c of parsed.hero_hole_cards ?? []) {
        const norm = normalizeCard(c);
        if (norm && !seen.has(norm) && heroHoleCards.length < 2) {
          seen.add(norm);
          heroHoleCards.push(norm);
        }
      }

      const communityCards: string[] = [];
      for (const c of parsed.community_cards ?? []) {
        const norm = normalizeCard(c);
        if (norm && !seen.has(norm) && communityCards.length < 5) {
          seen.add(norm);
          communityCards.push(norm);
        }
      }

      const inferredStreet =
        communityCards.length >= 5
          ? "river"
          : communityCards.length === 4
          ? "turn"
          : communityCards.length >= 3
          ? "flop"
          : "preflop";

      res.json({
        hero_hole_cards: heroHoleCards,
        community_cards: communityCards,
        pot_size: Math.max(0, Number(parsed.pot_size) || 0),
        to_call: Math.max(0, Number(parsed.to_call) || 0),
        effective_stack: Math.max(0, Number(parsed.effective_stack) || 0),
        active_opponents: Math.max(1, Math.min(8, Number(parsed.active_opponents) || 1)),
        street:
          parsed.street && ["preflop", "flop", "turn", "river"].includes(parsed.street.toLowerCase())
            ? parsed.street.toLowerCase()
            : inferredStreet,
        hero_position:
          parsed.hero_position === "IP" || parsed.hero_position === "OOP"
            ? parsed.hero_position
            : "unknown",
        notes: parsed.notes ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to analyze table screenshot.";
      res.status(500).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === "production";
  const distDir = path.join(__dirname, "dist");

  if (!isProd || !fs.existsSync(distDir)) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get("/{*path}", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SolverHUD server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
