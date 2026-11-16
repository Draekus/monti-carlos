import ctypes
import os
import random
import sys
import threading
import time
import tkinter as tk
from tkinter import ttk
from typing import Dict, List, Optional, Tuple

# Enable Per-Monitor DPI awareness on Windows so window coords match mss pixels 1:1
if sys.platform == "win32":
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

import mss
import pywinctl as pwc
from PIL import Image, ImageTk
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from treys import Card, Deck, Evaluator


# ---------------------------------------------------------------------------
# 1. Configuration, Theme & Structured Output Schema
# ---------------------------------------------------------------------------
MODEL_ID = "gemini-3.1-flash-lite"
APP_TITLE = "Poker Hand Analyzer"

BG_MAIN = "#12161f"
BG_CARD = "#1b2230"
BG_ELEVATED = "#242d3f"
BORDER_SUBTLE = "#2e394f"
TEXT_PRIMARY = "#f1f5f9"
TEXT_MUTED = "#94a3b8"
FELT_GREEN = "#114b34"
FELT_BORDER = "#1e7250"

SUIT_SYMBOLS = {"s": "\u2660", "h": "\u2665", "d": "\u2666", "c": "\u2663"}
SUIT_COLORS = {"s": "#181c24", "c": "#181c24", "h": "#d62828", "d": "#d62828"}


class PokerTableState(BaseModel):
    hero_hole_cards: List[str] = Field(
        default_factory=list,
        description="Hero's 2 private cards in 2-char format like ['As', 'Kd']. Use 'T' for 10. Empty if not visible.",
    )
    community_cards: List[str] = Field(
        default_factory=list,
        description="Community board cards (0, 3, 4, or 5 cards) in 2-char format like ['Qh', 'Jc', '2s'].",
    )
    pot_size: float = Field(
        default=0.0,
        description="Total pot size currently in the center (numeric value, no currency symbols).",
    )
    to_call: float = Field(
        default=0.0,
        description="Amount hero must pay to call right now. 0.0 if hero can check or no bet is facing hero.",
    )
    active_opponents: int = Field(
        default=1,
        description="Number of opponents still in the hand (not folded).",
    )
    street: str = Field(
        default="unknown",
        description="Current street: preflop, flop, turn, or river.",
    )
    notes: Optional[str] = Field(
        default=None,
        description="Brief note if any critical info was obscured or uncertain.",
    )


# ---------------------------------------------------------------------------
# 2. Window Enumeration & Capture Helpers
# ---------------------------------------------------------------------------
def list_capture_targets() -> Dict[str, Tuple[str, object]]:
    """Returns a mapping of display label -> ('window', Window) or ('monitor', int)."""
    targets: Dict[str, Tuple[str, object]] = {}

    try:
        windows = pwc.getAllWindows()
    except Exception:
        windows = []

    seen_labels: Dict[str, int] = {}
    for win in windows:
        try:
            title = (win.title or "").strip()
            if not title or title == APP_TITLE:
                continue
            if not win.isVisible:
                continue
            if not win.isMinimized and (win.width < 120 or win.height < 120):
                continue

            short_title = title if len(title) <= 42 else title[:39] + "..."
            size_tag = "Minimized" if win.isMinimized else f"{win.width}x{win.height}"
            base_label = f"{short_title} ({size_tag})"

            if base_label in seen_labels:
                seen_labels[base_label] += 1
                label = f"{base_label} #{seen_labels[base_label]}"
            else:
                seen_labels[base_label] = 1
                label = base_label

            targets[label] = ("window", win)
        except Exception:
            continue

    with mss.mss() as sct:
        for i in range(1, len(sct.monitors)):
            m = sct.monitors[i]
            targets[f"[Monitor {i}] {m['width']}x{m['height']}"] = ("monitor", i)

    return targets


def _grab_clamped_window(win) -> Tuple[Image.Image, str]:
    """Grabs a window's bounding box clamped to the virtual desktop."""
    with mss.mss() as sct:
        virtual = sct.monitors[0]
        v_right = virtual["left"] + virtual["width"]
        v_bottom = virtual["top"] + virtual["height"]

        left = max(virtual["left"], int(win.left))
        top = max(virtual["top"], int(win.top))
        right = min(v_right, int(win.left + win.width))
        bottom = min(v_bottom, int(win.top + win.height))

        width = right - left
        height = bottom - top
        if width <= 0 or height <= 0:
            raise ValueError("Selected window is completely off-screen.")

        region = {"left": left, "top": top, "width": width, "height": height}
        sct_img = sct.grab(region)
        img = Image.frombytes("RGB", sct_img.size, sct_img.rgb)
    return img, f"{width} × {height}"


def capture_preview(target: Tuple[str, object]) -> Tuple[Optional[Image.Image], str]:
    """Non-intrusive capture for the preview panel (does not steal focus)."""
    kind, obj = target
    if kind == "monitor":
        monitor_idx = int(obj)
        with mss.mss() as sct:
            mon = sct.monitors[monitor_idx]
            sct_img = sct.grab(mon)
            img = Image.frombytes("RGB", sct_img.size, sct_img.rgb)
        return img, f"Monitor {monitor_idx} ({mon['width']} × {mon['height']})"

    win = obj
    if not win.isAlive:
        return None, "Window closed. Click Refresh."
    if win.isMinimized:
        return None, "Window is minimized.\nIt will restore when you Analyze."

    try:
        return _grab_clamped_window(win)
    except Exception as exc:
        return None, str(exc)


def capture_target(
    target: Tuple[str, object],
    assistant_root: tk.Tk,
    bring_to_front: bool = True,
) -> Tuple[Image.Image, str]:
    """Clean capture used for AI analysis."""
    kind, obj = target

    if kind == "monitor":
        monitor_idx = int(obj)
        with mss.mss() as sct:
            mon = sct.monitors[monitor_idx]
            sct_img = sct.grab(mon)
            img = Image.frombytes("RGB", sct_img.size, sct_img.rgb)
        img.thumbnail((1920, 1080), Image.Resampling.LANCZOS)
        return img, f"Monitor {monitor_idx} ({mon['width']} × {mon['height']})"

    win = obj
    if not win.isAlive:
        raise RuntimeError("The selected window was closed. Click 'Refresh' and select another.")

    if win.isMinimized:
        try:
            win.restore()
            time.sleep(0.22)
        except Exception:
            pass

    if bring_to_front:
        try:
            win.activate()
        except Exception:
            pass

    assistant_root.withdraw()
    assistant_root.update()
    time.sleep(0.14 if bring_to_front else 0.06)

    try:
        img, size_label = _grab_clamped_window(win)
    finally:
        assistant_root.deiconify()
        assistant_root.update()

    img.thumbnail((1920, 1080), Image.Resampling.LANCZOS)
    return img, size_label


# ---------------------------------------------------------------------------
# 3. Vision Parsing & Poker Math Engine
# ---------------------------------------------------------------------------
def parse_table_from_image(client: genai.Client, img: Image.Image) -> PokerTableState:
    prompt = (
        "Analyze this poker table screenshot. Extract the hero's hole cards, "
        "the community cards on the board, the total pot size, the amount required "
        "for the hero to call (look at the Call button or current bet), and the number "
        "of opponents still active in the hand.\n"
        "Card formatting rules: Rank in {2,3,4,5,6,7,8,9,T,J,Q,K,A} followed by "
        "lowercase suit in {s,h,d,c}. Example: Ace of Spades = 'As', Ten of Hearts = 'Th'."
    )

    response = client.models.generate_content(
        model=MODEL_ID,
        contents=[prompt, img],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=PokerTableState,
            temperature=0.0,
        ),
    )
    return response.parsed


def normalize_card(card_str: str) -> str:
    s = card_str.strip()
    if s.startswith("10"):
        s = "T" + s[2:]
    if len(s) != 2:
        raise ValueError(f"Invalid card string: {card_str}")
    return s[0].upper() + s[1].lower()


def run_monte_carlo_equity(
    hole_strs: List[str],
    board_strs: List[str],
    opponents: int,
    simulations: int = 4000,
) -> dict:
    evaluator = Evaluator()

    hole_cards = [Card.new(normalize_card(c)) for c in hole_strs]
    board_cards = [Card.new(normalize_card(c)) for c in board_strs]

    known = set(hole_cards + board_cards)
    if len(known) != len(hole_cards) + len(board_cards):
        raise ValueError("Duplicate cards detected between hand and board.")

    opponents = max(1, min(opponents, 8))
    cards_to_board = 5 - len(board_cards)
    cards_needed = cards_to_board + (2 * opponents)
    remaining_deck = [c for c in Deck().cards if c not in known]

    equity_points = 0.0
    wins = 0
    ties = 0

    for _ in range(simulations):
        drawn = random.sample(remaining_deck, cards_needed)
        sim_board = board_cards + drawn[:cards_to_board]
        hero_score = evaluator.evaluate(sim_board, hole_cards)

        opp_scores = []
        offset = cards_to_board
        for i in range(opponents):
            opp_hand = drawn[offset + 2 * i : offset + 2 * (i + 1)]
            opp_scores.append(evaluator.evaluate(sim_board, opp_hand))

        best_opp = min(opp_scores)
        if hero_score < best_opp:
            wins += 1
            equity_points += 1.0
        elif hero_score == best_opp:
            ties += 1
            num_tied_opps = sum(1 for s in opp_scores if s == hero_score)
            equity_points += 1.0 / (1 + num_tied_opps)

    made_hand = "Preflop Hand"
    if len(board_cards) >= 3:
        current_score = evaluator.evaluate(board_cards, hole_cards)
        rank_class = evaluator.get_rank_class(current_score)
        made_hand = evaluator.class_to_string(rank_class)

    return {
        "equity": equity_points / simulations,
        "win_pct": wins / simulations,
        "tie_pct": ties / simulations,
        "made_hand": made_hand,
    }


def recommend_action(state: PokerTableState, stats: dict) -> dict:
    equity = stats["equity"]
    pot = max(0.0, state.pot_size)
    to_call = max(0.0, state.to_call)

    if to_call == 0:
        pot_odds = 0.0
        ev = equity * pot
        if equity >= 0.65:
            action = "BET — STRONG VALUE"
            detail = "High equity. Bet ~66%–75% of the pot for value."
        elif equity >= 0.50:
            action = "BET — THIN VALUE"
            detail = "Ahead of random ranges. Bet ~33%–50% pot or check-control."
        else:
            action = "CHECK"
            detail = "Low raw equity with no cost to see the next card."
    else:
        total_pot_after_call = pot + to_call
        pot_odds = to_call / total_pot_after_call if total_pot_after_call > 0 else 1.0
        ev = (equity * total_pot_after_call) - ((1.0 - equity) * to_call)

        if equity >= max(pot_odds * 1.65, 0.62):
            action = "RAISE — VALUE"
            detail = f"Equity ({equity:.1%}) crushes pot odds ({pot_odds:.1%}). Raise for value."
        elif equity >= pot_odds + 0.03:
            action = "CALL (+EV)"
            detail = f"Equity ({equity:.1%}) beats pot odds ({pot_odds:.1%}). Profitable call."
        elif equity >= pot_odds - 0.02:
            action = "MARGINAL CALL / FOLD"
            detail = (
                f"Break-even spot (Equity {equity:.1%} vs Odds {pot_odds:.1%}). "
                "Call with position/implied odds; fold vs tight aggression."
            )
        else:
            action = "FOLD (-EV)"
            detail = f"Equity ({equity:.1%}) is below required pot odds ({pot_odds:.1%})."

    return {
        "action": action,
        "detail": detail,
        "pot_odds": pot_odds,
        "ev": ev,
    }


# ---------------------------------------------------------------------------
# 4. Custom Canvas Drawing Helpers
# ---------------------------------------------------------------------------
def draw_round_rect(
    canvas: tk.Canvas,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    r: float = 10,
    **kwargs,
):
    """Draws a crisp rounded rectangle on a Tkinter Canvas."""
    r = min(r, (x2 - x1) / 2, (y2 - y1) / 2)
    points = [
        x1 + r, y1,
        x1 + r, y1,
        x2 - r, y1,
        x2 - r, y1,
        x2, y1,
        x2, y1 + r,
        x2, y1 + r,
        x2, y2 - r,
        x2, y2 - r,
        x2, y2,
        x2 - r, y2,
        x2 - r, y2,
        x1 + r, y2,
        x1 + r, y2,
        x1, y2,
        x1, y2 - r,
        x1, y2 - r,
        x1, y1 + r,
        x1, y1 + r,
        x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, **kwargs)


def draw_playing_card(
    canvas: tk.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    card_code: Optional[str] = None,
    highlight: bool = False,
):
    """Draws either a styled playing card or an empty dashed card slot."""
    if not card_code:
        draw_round_rect(
            canvas, x, y, x + w, y + h, r=7,
            fill="#0c3625", outline="#28664d", width=1.5, dash=(4, 3)
        )
        canvas.create_text(
            x + w / 2, y + h / 2, text="?", fill="#3c8264", font=("Segoe UI", 14, "bold")
        )
        return

    try:
        norm = normalize_card(card_code)
        rank_char, suit_char = norm[0], norm[1]
        display_rank = "10" if rank_char == "T" else rank_char
        suit_sym = SUIT_SYMBOLS.get(suit_char, "?")
        color = SUIT_COLORS.get(suit_char, "#181c24")
    except Exception:
        display_rank, suit_sym, color = card_code, "", "#181c24"

    # Subtle drop shadow
    draw_round_rect(canvas, x + 2, y + 3, x + w + 2, y + h + 3, r=7, fill="#082419", outline="")

    outline_col = "#f59e0b" if highlight else "#cbd5e1"
    outline_w = 2 if highlight else 1
    draw_round_rect(
        canvas, x, y, x + w, y + h, r=7,
        fill="#f8fafc", outline=outline_col, width=outline_w
    )

    # Top-left rank & suit
    canvas.create_text(
        x + 8, y + 12, text=display_rank, anchor="w",
        fill=color, font=("Segoe UI", 12, "bold")
    )
    canvas.create_text(
        x + 8, y + 26, text=suit_sym, anchor="w",
        fill=color, font=("Segoe UI", 11)
    )

    # Center large suit watermark
    canvas.create_text(
        x + w / 2 + 2, y + h / 2 + 8, text=suit_sym,
        fill=color, font=("Segoe UI", 22)
    )


# ---------------------------------------------------------------------------
# 5. Visual Desktop UI (Tkinter)
# ---------------------------------------------------------------------------
class PokerAssistantApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("900x630")
        self.root.minsize(820, 580)
        self.root.configure(bg=BG_MAIN)
        self.root.attributes("-topmost", True)

        api_key = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=api_key) if api_key else None
        self.targets: Dict[str, Tuple[str, object]] = {}
        self._is_running = False

        # Image references held to prevent garbage collection
        self._preview_pil: Optional[Image.Image] = None
        self._preview_tk: Optional[ImageTk.PhotoImage] = None
        self._preview_message: str = "Select a window to preview."

        self._configure_styles()
        self._build_ui()
        self.refresh_windows()

    def _configure_styles(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure("TFrame", background=BG_MAIN)
        style.configure("Card.TFrame", background=BG_CARD)
        style.configure("TLabel", background=BG_MAIN, foreground=TEXT_PRIMARY, font=("Segoe UI", 9))
        style.configure("Card.TLabel", background=BG_CARD, foreground=TEXT_PRIMARY, font=("Segoe UI", 9))
        style.configure("TCheckbutton", background=BG_MAIN, foreground=TEXT_MUTED, font=("Segoe UI", 9))
        style.map("TCheckbutton", background=[("active", BG_MAIN)])
        style.configure("TButton", font=("Segoe UI", 9, "bold"), padding=5)
        style.configure("Accent.TButton", font=("Segoe UI", 9, "bold"), padding=6)

    def _build_ui(self):
        # --- Top Toolbar ---
        toolbar = ttk.Frame(self.root)
        toolbar.pack(fill="x", padx=14, pady=(12, 6))

        ttk.Label(toolbar, text="Target Window:", font=("Segoe UI", 9, "bold")).pack(side="left")

        self.target_var = tk.StringVar()
        self.target_combo = ttk.Combobox(
            toolbar, textvariable=self.target_var, state="readonly", width=42
        )
        self.target_combo.pack(side="left", fill="x", expand=True, padx=8)
        self.target_combo.bind("<<ComboboxSelected>>", lambda _: self.update_preview())

        ttk.Button(toolbar, text="Refresh", width=8, command=self.refresh_windows).pack(side="left", padx=(0, 4))
        ttk.Button(toolbar, text="Peek", width=6, command=self.update_preview).pack(side="left")

        # --- Sub-toolbar ---
        subbar = ttk.Frame(self.root)
        subbar.pack(fill="x", padx=14, pady=(0, 8))

        self.focus_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            subbar,
            text="Bring window to front before analyzing",
            variable=self.focus_var,
        ).pack(side="left")

        self.status_var = tk.StringVar(
            value="Ready — press Space to analyze."
            if self.client
            else "ERROR: GEMINI_API_KEY not set!"
        )
        ttk.Label(subbar, textvariable=self.status_var, foreground=TEXT_MUTED).pack(
            side="left", padx=16
        )

        self.analyze_btn = ttk.Button(
            subbar,
            text="Analyze Window (Space)",
            style="Accent.TButton",
            command=self.start_analysis,
        )
        self.analyze_btn.pack(side="right")

        # --- Main Two-Column Body ---
        body = ttk.Frame(self.root)
        body.pack(fill="both", expand=True, padx=14, pady=(0, 14))
        body.columnconfigure(0, weight=3)
        body.columnconfigure(1, weight=2)
        body.rowconfigure(0, weight=1)

        # ==================== LEFT COLUMN: VISUAL DASHBOARD ====================
        left_panel = tk.Frame(body, bg=BG_CARD, highlightbackground=BORDER_SUBTLE, highlightthickness=1)
        left_panel.grid(row=0, column=0, sticky="nsew", padx=(0, 10))

        # 1. Action Banner + Street/Hand Badges
        banner_frame = tk.Frame(left_panel, bg="#1e293b", pady=10, padx=12)
        banner_frame.pack(fill="x")
        self.banner_frame = banner_frame

        self.action_label = tk.Label(
            banner_frame,
            text="WAITING FOR HAND",
            font=("Segoe UI", 16, "bold"),
            bg="#1e293b",
            fg="#ffffff",
        )
        self.action_label.pack(side="left")

        badges_box = tk.Frame(banner_frame, bg="#1e293b")
        badges_box.pack(side="right")
        self.badges_box = badges_box

        self.street_badge = tk.Label(
            badges_box,
            text="PREFLOP",
            font=("Segoe UI", 8, "bold"),
            bg="#0f172a",
            fg="#cbd5e1",
            padx=8,
            pady=3,
        )
        self.street_badge.pack(side="top", anchor="e")

        self.hand_badge = tk.Label(
            badges_box,
            text="No Board",
            font=("Segoe UI", 9, "bold"),
            bg="#1e293b",
            fg="#e2e8f0",
            pady=2,
        )
        self.hand_badge.pack(side="bottom", anchor="e")

        # 2. Felt Table Canvas (Hole Cards + Board Cards)
        self.table_canvas = tk.Canvas(
            left_panel, height=162, bg=BG_CARD, highlightthickness=0
        )
        self.table_canvas.pack(fill="x", padx=12, pady=(12, 6))
        self.table_canvas.bind("<Configure>", lambda _: self._redraw_table())

        # 3. Equity vs. Pot Odds Gauge Canvas
        self.gauge_canvas = tk.Canvas(
            left_panel, height=84, bg=BG_CARD, highlightthickness=0
        )
        self.gauge_canvas.pack(fill="x", padx=12, pady=(2, 8))
        self.gauge_canvas.bind("<Configure>", lambda _: self._redraw_gauge())

        # 4. 4 Key Metric Cards
        metrics_frame = tk.Frame(left_panel, bg=BG_CARD)
        metrics_frame.pack(fill="x", padx=12, pady=(0, 10))
        for i in range(4):
            metrics_frame.columnconfigure(i, weight=1, uniform="metric")

        self.metric_labels = {}
        metric_specs = [
            ("pot", "POT SIZE", "--"),
            ("call", "TO CALL", "--"),
            ("opps", "OPPONENTS", "--"),
            ("ev", "EST. CALL EV", "--"),
        ]
        for idx, (key, title, default) in enumerate(metric_specs):
            tile = tk.Frame(
                metrics_frame,
                bg=BG_ELEVATED,
                highlightbackground=BORDER_SUBTLE,
                highlightthickness=1,
                padx=8,
                pady=7,
            )
            tile.grid(row=0, column=idx, sticky="nsew", padx=(0 if idx == 0 else 4, 0))
            tk.Label(
                tile, text=title, bg=BG_ELEVATED, fg=TEXT_MUTED, font=("Segoe UI", 7, "bold")
            ).pack(anchor="w")
            val_lbl = tk.Label(
                tile, text=default, bg=BG_ELEVATED, fg=TEXT_PRIMARY, font=("Segoe UI", 12, "bold")
            )
            val_lbl.pack(anchor="w", pady=(2, 0))
            self.metric_labels[key] = val_lbl

        # 5. Reasoning & Notes Card
        reason_box = tk.Frame(
            left_panel,
            bg=BG_ELEVATED,
            highlightbackground=BORDER_SUBTLE,
            highlightthickness=1,
            padx=10,
            pady=8,
        )
        reason_box.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        tk.Label(
            reason_box,
            text="RECOMMENDATION REASONING",
            bg=BG_ELEVATED,
            fg=TEXT_MUTED,
            font=("Segoe UI", 7, "bold"),
        ).pack(anchor="w")

        self.reason_var = tk.StringVar(
            value="Select your poker window on the top bar, confirm it looks right in the preview on the right, and press Space."
        )
        self.reason_label = tk.Label(
            reason_box,
            textvariable=self.reason_var,
            bg=BG_ELEVATED,
            fg=TEXT_PRIMARY,
            font=("Segoe UI", 9),
            justify="left",
            wraplength=470,
            anchor="nw",
        )
        self.reason_label.pack(fill="both", expand=True, pady=(4, 0))

        # ==================== RIGHT COLUMN: WINDOW PREVIEW ====================
        right_panel = tk.Frame(body, bg=BG_CARD, highlightbackground=BORDER_SUBTLE, highlightthickness=1)
        right_panel.grid(row=0, column=1, sticky="nsew")

        preview_header = tk.Frame(right_panel, bg=BG_ELEVATED, padx=10, pady=8)
        preview_header.pack(fill="x")

        tk.Label(
            preview_header,
            text="WINDOW PREVIEW",
            bg=BG_ELEVATED,
            fg=TEXT_PRIMARY,
            font=("Segoe UI", 9, "bold"),
        ).pack(side="left")

        self.preview_dim_var = tk.StringVar(value="--")
        tk.Label(
            preview_header,
            textvariable=self.preview_dim_var,
            bg=BG_ELEVATED,
            fg="#38bdf8",
            font=("Segoe UI", 8, "bold"),
        ).pack(side="right")

        self.preview_canvas = tk.Canvas(
            right_panel, bg="#0b0f17", highlightthickness=0
        )
        self.preview_canvas.pack(fill="both", expand=True, padx=10, pady=10)
        self.preview_canvas.bind("<Configure>", lambda _: self._redraw_preview())

        tk.Label(
            right_panel,
            text="Tip: Use 'Peek' or change the dropdown to verify the right table is targeted.",
            bg=BG_CARD,
            fg=TEXT_MUTED,
            font=("Segoe UI", 8),
            wraplength=280,
            justify="left",
        ).pack(fill="x", padx=10, pady=(0, 10))

        # Internal state for canvas redraws
        self._last_state: Optional[PokerTableState] = None
        self._last_stats: Optional[dict] = None
        self._last_rec: Optional[dict] = None

        self.root.bind("<space>", self._on_space)

    def _on_space(self, _event):
        self.start_analysis()
        return "break"

    # -----------------------------------------------------------------------
    # Window List & Preview Logic
    # -----------------------------------------------------------------------
    def refresh_windows(self):
        prev = self.target_var.get()
        self.targets = list_capture_targets()
        labels = list(self.targets.keys())
        self.target_combo["values"] = labels

        if prev in self.targets:
            self.target_var.set(prev)
        elif labels:
            self.target_var.set(labels[0])

        self.status_var.set(f"Found {len(labels)} targets.")
        self.update_preview()

    def update_preview(self):
        selected = self.target_var.get()
        if selected not in self.targets:
            self._preview_pil = None
            self._preview_message = "No window selected."
            self.preview_dim_var.set("--")
            self._redraw_preview()
            return

        img, info = capture_preview(self.targets[selected])
        if img is not None:
            self._preview_pil = img
            self._preview_message = ""
            self.preview_dim_var.set(info)
        else:
            self._preview_pil = None
            self._preview_message = info
            self.preview_dim_var.set("Unavailable")
        self._redraw_preview()

    def _redraw_preview(self):
        c = self.preview_canvas
        c.delete("all")
        cw = max(10, c.winfo_width())
        ch = max(10, c.winfo_height())

        if self._preview_pil is None:
            c.create_text(
                cw / 2, ch / 2,
                text=self._preview_message,
                fill=TEXT_MUTED,
                font=("Segoe UI", 9),
                justify="center",
                width=max(100, cw - 24),
            )
            return

        pw, ph = self._preview_pil.size
        scale = min((cw - 8) / pw, (ch - 8) / ph)
        new_w = max(1, int(pw * scale))
        new_h = max(1, int(ph * scale))

        resized = self._preview_pil.resize((new_w, new_h), Image.Resampling.LANCZOS)
        self._preview_tk = ImageTk.PhotoImage(resized)
        c.create_image(cw / 2, ch / 2, image=self._preview_tk, anchor="center")

    # -----------------------------------------------------------------------
    # Visual Dashboard Redraws
    # -----------------------------------------------------------------------
    def _redraw_table(self):
        c = self.table_canvas
        c.delete("all")
        cw = max(200, c.winfo_width())
        ch = max(140, c.winfo_height())

        # Green poker felt background
        draw_round_rect(
            c, 2, 2, cw - 2, ch - 2, r=16,
            fill=FELT_GREEN, outline=FELT_BORDER, width=2
        )

        card_w, card_h = 54, 78
        hole = self._last_state.hero_hole_cards if self._last_state else []
        board = self._last_state.community_cards if self._last_state else []

        # Section labels
        c.create_text(
            20, 18, text="HERO HAND", anchor="w",
            fill="#86efac", font=("Segoe UI", 8, "bold")
        )
        board_start_x = 162
        c.create_text(
            board_start_x, 18, text="COMMUNITY BOARD", anchor="w",
            fill="#86efac", font=("Segoe UI", 8, "bold")
        )

        # Vertical divider between Hero and Board
        c.create_line(146, 20, 146, ch - 20, fill="#1f6d4d", width=1.5)

        # Draw 2 Hero Cards
        for i in range(2):
            code = hole[i] if i < len(hole) else None
            draw_playing_card(
                c, 20 + i * (card_w + 8), 36, card_w, card_h,
                card_code=code, highlight=bool(code)
            )

        # Draw 5 Board Slots
        gap = max(6, min(10, (cw - board_start_x - 16 - 5 * card_w) // 4))
        for i in range(5):
            code = board[i] if i < len(board) else None
            draw_playing_card(
                c, board_start_x + i * (card_w + gap), 36, card_w, card_h,
                card_code=code, highlight=False
            )

    def _redraw_gauge(self):
        c = self.gauge_canvas
        c.delete("all")
        cw = max(200, c.winfo_width())

        bar_x1, bar_x2 = 4, cw - 4
        bar_w = bar_x2 - bar_x1
        bar_y1, bar_y2 = 24, 48

        if not self._last_stats or not self._last_rec:
            c.create_text(
                4, 10, text="HAND EQUITY VS. POT ODDS", anchor="w",
                fill=TEXT_MUTED, font=("Segoe UI", 8, "bold")
            )
            draw_round_rect(
                c, bar_x1, bar_y1, bar_x2, bar_y2, r=6,
                fill=BG_ELEVATED, outline=BORDER_SUBTLE
            )
            c.create_text(
                cw / 2, (bar_y1 + bar_y2) / 2,
                text="Analyze a hand to see equity breakdown",
                fill=TEXT_MUTED, font=("Segoe UI", 8)
            )
            return

        win_pct = self._last_stats["win_pct"]
        tie_pct = self._last_stats["tie_pct"]
        equity = self._last_stats["equity"]
        pot_odds = self._last_rec["pot_odds"]

        c.create_text(
            4, 10,
            text=f"EQUITY: {equity:.1%}   (Win {win_pct:.1%}  |  Tie {tie_pct:.1%})",
            anchor="w", fill=TEXT_PRIMARY, font=("Segoe UI", 9, "bold")
        )
        if pot_odds > 0:
            c.create_text(
                cw - 4, 10,
                text=f"Pot Odds Needed: {pot_odds:.1%}",
                anchor="e", fill="#38bdf8", font=("Segoe UI", 9, "bold")
            )

        # Base track (Loss %)
        draw_round_rect(
            c, bar_x1, bar_y1, bar_x2, bar_y2, r=5,
            fill="#334155", outline=BORDER_SUBTLE
        )

        # Win bar (Green)
        win_w = bar_w * min(1.0, max(0.0, win_pct))
        if win_w > 2:
            c.create_rectangle(
                bar_x1 + 1, bar_y1 + 1, bar_x1 + win_w, bar_y2 - 1,
                fill="#22c55e", outline=""
            )

        # Tie bar (Amber)
        tie_w = bar_w * min(1.0 - win_pct, max(0.0, tie_pct))
        if tie_w > 1:
            c.create_rectangle(
                bar_x1 + win_w, bar_y1 + 1, bar_x1 + win_w + tie_w, bar_y2 - 1,
                fill="#f59e0b", outline=""
            )

        # Pot Odds Break-even Marker
        if pot_odds > 0:
            mx = bar_x1 + bar_w * min(1.0, max(0.0, pot_odds))
            c.create_line(mx, bar_y1 - 5, mx, bar_y2 + 5, fill="#38bdf8", width=2.5)
            c.create_text(
                mx, bar_y2 + 16,
                text=f"Break-even {pot_odds:.0%}",
                fill="#38bdf8", font=("Segoe UI", 8, "bold")
            )
        else:
            c.create_text(
                4, bar_y2 + 16, anchor="w",
                text="Free to check (0% pot odds required)",
                fill=TEXT_MUTED, font=("Segoe UI", 8)
            )

    # -----------------------------------------------------------------------
    # Analysis Pipeline
    # -----------------------------------------------------------------------
    def start_analysis(self):
        if self._is_running:
            return
        if not self.client:
            self._show_error("Please set the GEMINI_API_KEY environment variable first.")
            return

        selected = self.target_var.get()
        if selected not in self.targets:
            self._show_error("No target window selected. Click Refresh.")
            return

        self._is_running = True
        self.analyze_btn.config(state="disabled")
        self.status_var.set("Capturing selected window...")

        try:
            img, size_label = capture_target(
                self.targets[selected],
                self.root,
                bring_to_front=self.focus_var.get(),
            )
            # Update preview immediately with the exact frame sent to Gemini
            self._preview_pil = img
            self._preview_message = ""
            self.preview_dim_var.set(size_label)
            self._redraw_preview()
        except Exception as exc:
            self._show_error(str(exc))
            return

        self.status_var.set("Reading table & simulating 4,000 hands...")
        thread = threading.Thread(target=self._run_pipeline, args=(img,), daemon=True)
        thread.start()

    def _run_pipeline(self, img: Image.Image):
        try:
            state = parse_table_from_image(self.client, img)

            if len(state.hero_hole_cards) != 2:
                self.root.after(
                    0,
                    self._show_error,
                    f"Could not detect 2 hole cards (saw: {state.hero_hole_cards}). Check the Preview panel.",
                    state,
                )
                return

            stats = run_monte_carlo_equity(
                state.hero_hole_cards,
                state.community_cards,
                state.active_opponents,
            )
            rec = recommend_action(state, stats)
            self.root.after(0, self._update_ui, state, stats, rec)
        except Exception as exc:
            self.root.after(0, self._show_error, str(exc))

    def _set_banner_color(self, bg: str):
        self.banner_frame.config(bg=bg)
        self.action_label.config(bg=bg)
        self.badges_box.config(bg=bg)
        self.hand_badge.config(bg=bg)

    def _update_ui(self, state: PokerTableState, stats: dict, rec: dict):
        action = rec["action"]
        if "RAISE" in action or "BET" in action:
            bg = "#166534"
        elif "CALL" in action:
            bg = "#1d4ed8"
        elif "CHECK" in action:
            bg = "#475569"
        else:
            bg = "#991b1b"

        self._set_banner_color(bg)
        self.action_label.config(text=action)
        self.street_badge.config(text=state.street.upper())
        self.hand_badge.config(text=stats["made_hand"])

        self._last_state = state
        self._last_stats = stats
        self._last_rec = rec
        self._redraw_table()
        self._redraw_gauge()

        self.metric_labels["pot"].config(text=f"{state.pot_size:,.2f}")
        self.metric_labels["call"].config(text=f"{state.to_call:,.2f}")
        self.metric_labels["opps"].config(text=f"{state.active_opponents} Active")

        ev = rec["ev"]
        ev_color = "#4ade80" if ev >= 0 else "#f87171"
        self.metric_labels["ev"].config(text=f"{ev:+,.2f}", fg=ev_color)

        reason = rec["detail"]
        if state.notes:
            reason += f"\n\nVision Note: {state.notes}"
        self.reason_var.set(reason)

        self.status_var.set("Analysis complete.")
        self.analyze_btn.config(state="normal")
        self._is_running = False

    def _show_error(self, msg: str, partial_state: Optional[PokerTableState] = None):
        self._set_banner_color("#7f1d1d")
        self.action_label.config(text="ANALYSIS ERROR")
        self.street_badge.config(text="ERROR")
        self.hand_badge.config(text="")

        self._last_state = partial_state
        self._last_stats = None
        self._last_rec = None
        self._redraw_table()
        self._redraw_gauge()

        self.reason_var.set(msg)
        self.status_var.set("Error occurred.")
        self.analyze_btn.config(state="normal")
        self._is_running = False


if __name__ == "__main__":
    root = tk.Tk()
    app = PokerAssistantApp(root)
    root.mainloop()