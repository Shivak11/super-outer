#!/usr/bin/env python3
"""Code-flow diagram kit: a small SVG generator in the draw-system-diagram house style.

Write a generator script that imports this file, builds the picture with the
methods below, then calls save(). Never hand-edit the SVG it writes; edit the
generator and run it again, so the picture stays reproducible.

    import sys; sys.path.insert(0, "<skill>/scripts")
    from diagram_kit import Diagram
    d = Diagram("Title", "Subtitle", "One or two sentences for screen readers.", facts={...})
    d.legend(parallel=True)
    d.group(30, 150, 1380, 200, "blue", "Phone")
    d.box(50, 200, 300, 104, "blue", "A. Step", ["line one", "line two"], code="module.function")
    d.arrow("M350 250H430", "blue", "label", 360, 240)
    d.save("out.svg")

Rules the checker enforces, which the kit cannot fix for you:
  * SVG text does not wrap: keep each line inside its box (about 8 units per
    character at 16 px, 12.5 per character for a 21 px bold title).
  * Arrow labels sit in the gap between groups, at least 4 units from any border.
  * Nothing smaller than 14 px.
"""

from __future__ import annotations

import json
from xml.sax.saxutils import escape

# One colour per kind of part: (border and arrows, fill, titles).
PALETTE = {
    "blue": ("#1971C2", "#E7F5FF", "#1864AB"),  # people and the clients they use
    "pink": ("#C2255C", "#FFF0F6", "#A61E4D"),  # the people's own data held elsewhere
    "orange": ("#E8590C", "#FFF4E6", "#D9480F"),  # the system being drawn
    "green": ("#0B8A5F", "#EBFBEE", "#087F5B"),  # AI models and other outside services
    "purple": ("#6741D9", "#F3F0FF", "#5F3DC4"),  # storage
    "teal": ("#0C8599", "#E3FAFC", "#0B7285"),  # release, checks, safety nets
    "grey": ("#868E96", "#F8F9FA", "#495057"),  # next phase
    "indigo": (
        "#4263EB",
        "#EDF2FF",
        "#364FC7",
    ),  # example strips, overview, work at the same time
}
BODY = "#344054"
STRONG = "#1F2937"
TITLE = "#13294B"
NEUTRAL_FILL = "#F8FAFC"
NEUTRAL_STROKE = "#CBD5E1"
WIDTH = 1440


class Diagram:
    def __init__(
        self,
        title: str,
        subtitle: str,
        desc: str,
        facts: dict,
        width: int = WIDTH,
        title_size: int = 42,
    ):
        self.width = width
        self.title = title
        self.subtitle = subtitle
        self.desc = desc
        self.facts = facts
        self.title_size = title_size
        self.o: list[str] = []
        self.title_text = (title, subtitle)

    # ------------------------------------------------------------------ primitives
    def add(self, s: str) -> None:
        self.o.append(s)

    def mark(self) -> int:
        """Index to insert lane backgrounds at, so they sit under the boxes drawn after it."""
        return len(self.o)

    def group(self, x, y, w, h, color, title="", fill=None, stroke=None, at=None):
        b, f, t = PALETTE[color]
        rect = (
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" '
            f'fill="{fill or f}" stroke="{stroke or b}" stroke-width="2.5"/>'
        )
        if at is None:
            self.add(rect)
        else:
            self.o.insert(at, rect)
        if title:
            self.add(
                f'<text x="{x + 20}" y="{y + 34}" font-size="25" font-weight="800" fill="{t}">{escape(title)}</text>'
            )

    def box(
        self, x, y, w, h, color, title, lines=(), dashed=False, chip=False, code=None
    ):
        """White box with a 21 px bold title, up to three 16 px lines and an optional 14 px code pointer."""
        b, _, t = PALETTE[color]
        d = ' stroke-dasharray="8 6"' if dashed else ""
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#FFFFFF" stroke="{b}" stroke-width="2"{d}/>'
        )
        self.add(
            f'<text x="{x + 14}" y="{y + 28}" font-size="21" font-weight="700" fill="{t}">{escape(title)}</text>'
        )
        for i, ln in enumerate(lines):
            self.add(
                f'<text x="{x + 14}" y="{y + 54 + 22 * i}" font-size="16" fill="{BODY}">{escape(ln)}</text>'
            )
        if code:
            self.add(
                f'<text x="{x + 14}" y="{y + h - 12}" font-size="14" font-weight="700" fill="{b}">{escape(code)}</text>'
            )
        if chip:
            self.chip(x + w - 88, y + 8)

    def chip(self, x, y, label="AT ONCE"):
        """Indigo tag for work that runs at the same time as its neighbours."""
        self.add(
            f'<rect x="{x}" y="{y}" width="76" height="24" rx="6" fill="{PALETTE["indigo"][0]}"/>'
        )
        self.add(
            f'<text x="{x + 38}" y="{y + 17}" font-size="14" font-weight="700" fill="#FFFFFF" text-anchor="middle">{escape(label)}</text>'
        )

    def arrow(
        self,
        path,
        color,
        label,
        lx,
        ly,
        dashed=False,
        small=False,
        both=False,
        anchor=None,
    ):
        """Straight segments only (M x y H x V y). Every arrow carries a 14 px bold label."""
        b = PALETTE[color][0]
        d = ' stroke-dasharray="8 6"' if dashed else ""
        mk = f"a-{color}-s" if small else f"a-{color}"
        ms = f' marker-start="url(#{mk})"' if both else ""
        self.add(
            f'<path d="{path}" fill="none" stroke="{b}" stroke-width="3"{d}{ms} marker-end="url(#{mk})"/>'
        )
        an = f' text-anchor="{anchor}"' if anchor else ""
        self.add(
            f'<text x="{lx}" y="{ly}" font-size="14" font-weight="700" fill="{b}"{an}>{escape(label)}</text>'
        )

    def cylinder(self, x, y, w, title, lines=(), dashed=False):
        """A store. Body is 112 high; title at 20 px, lines at 14 px."""
        b, _, t = PALETTE["purple"]
        d = ' stroke-dasharray="8 6"' if dashed else ""
        h, r = 112, w // 2
        k = f"{r * 0.9:.0f}"
        self.add(
            f'<path d="M{x} {y + 12}c0-8 {k}-12 {r}-12s{r} 4 {r} 12v{h - 24}c0 8-{k} 12-{r} 12s-{r}-4-{r}-12z" fill="#FFFFFF" stroke="{b}" stroke-width="2.5"{d}/>'
        )
        self.add(
            f'<path d="M{x} {y + 12}c0 8 {k} 12 {r} 12s{r}-4 {r}-12" fill="none" stroke="{b}" stroke-width="2.5"{d}/>'
        )
        cx = x + r
        self.add(
            f'<text x="{cx}" y="{y + 56}" font-size="20" font-weight="800" fill="{t}" text-anchor="middle">{escape(title)}</text>'
        )
        for i, ln in enumerate(lines):
            self.add(
                f'<text x="{cx}" y="{y + 78 + 18 * i}" font-size="14" fill="{BODY}" text-anchor="middle">{escape(ln)}</text>'
            )

    def bar(self, y, text, solid=True):
        """Full-width phase bar (solid indigo) or boundary bar (white, indigo outline)."""
        i = PALETTE["indigo"]
        if solid:
            self.add(
                f'<rect x="30" y="{y}" width="{self.width - 60}" height="36" rx="10" fill="{i[0]}"/>'
            )
            self.add(
                f'<text x="50" y="{y + 25}" font-size="18" font-weight="800" fill="#FFFFFF">{escape(text)}</text>'
            )
        else:
            self.add(
                f'<rect x="30" y="{y}" width="{self.width - 60}" height="44" rx="10" fill="#FFFFFF" stroke="{i[0]}" stroke-width="2.5"/>'
            )
            self.add(
                f'<text x="50" y="{y + 29}" font-size="18" font-weight="800" fill="{i[2]}">{escape(text)}</text>'
            )

    def lanes(self, top, bottom, lanes, at):
        """Draw one set of swimlane backgrounds for one phase.

        lanes: list of (x, width, color, title) or (x, width, color, title, "neutral").
        Draw one set per phase, so phase bars never sit on top of a lane (the
        checker would read the bar text as lying inside the lane box).
        """
        for n, lane in enumerate(lanes):
            x, w, color, title = lane[:4]
            neutral = len(lane) > 4 and lane[4] == "neutral"
            self.group(
                x,
                top,
                w,
                bottom - top,
                color,
                title,
                fill=NEUTRAL_FILL if neutral else None,
                stroke=NEUTRAL_STROKE if neutral else None,
                at=at + n,
            )

    def legend(self, parallel=False, planned_label="Planned, or staging only"):
        """Top-right legend. 'Live' is mandatory; a dashed entry must name 'planned'."""
        rows = 3 if parallel else 2
        h = 78 if rows == 2 else 106
        self.add(
            f'<rect x="{self.width - 380}" y="26" width="350" height="{h}" rx="12" fill="{NEUTRAL_FILL}" stroke="{NEUTRAL_STROKE}" stroke-width="1.5"/>'
        )
        self.add(
            f'<rect x="{self.width - 362}" y="40" width="42" height="20" rx="5" fill="#FFFFFF" stroke="#334155" stroke-width="2"/>'
        )
        self.add(
            f'<text x="{self.width - 308}" y="56" font-size="17" fill="{STRONG}">Live</text>'
        )
        self.add(
            f'<rect x="{self.width - 362}" y="{72 if rows == 2 else 70}" width="42" height="20" rx="5" fill="#FFFFFF" stroke="#334155" stroke-width="2" stroke-dasharray="6 4"/>'
        )
        self.add(
            f'<text x="{self.width - 308}" y="{88 if rows == 2 else 86}" font-size="17" fill="{STRONG}">{escape(planned_label)}</text>'
        )
        if parallel:
            self.add(
                f'<rect x="{self.width - 362}" y="100" width="42" height="20" rx="5" fill="{PALETTE["indigo"][0]}"/>'
            )
            self.add(
                f'<text x="{self.width - 308}" y="116" font-size="17" fill="{STRONG}">Runs at the same time</text>'
            )

    # ------------------------------------------------------------------ output
    def _head(self, height: int) -> list[str]:
        w = self.width
        head = [
            f'<svg xmlns="http://www.w3.org/2000/svg" data-diagram="code-flow" viewBox="0 0 {w} {height}" width="{w}" height="{height}" '
            f'font-family="Helvetica Neue, Helvetica, Arial, sans-serif" role="img" aria-labelledby="title desc">',
            f'<title id="title">{escape(self.title)}</title>',
            f'<desc id="desc">{escape(self.desc)}</desc>',
            f'<metadata id="diagram-facts">{escape(json.dumps(self.facts))}</metadata>',
            "<defs>",
        ]
        for k, (b, _, _) in PALETTE.items():
            head.append(
                f'<marker id="a-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{b}"/></marker>'
            )
            head.append(
                f'<marker id="a-{k}-s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{b}"/></marker>'
            )
        head.append("</defs>")
        head.append(f'<rect width="{w}" height="{height}" fill="#FFFFFF"/>')
        head.append(
            f'<text x="40" y="62" font-size="{self.title_size}" font-weight="800" fill="{TITLE}">{escape(self.title_text[0])}</text>'
        )
        head.append(
            f'<text x="40" y="98" font-size="20" fill="{BODY}">{escape(self.title_text[1])}</text>'
        )
        return head

    def save(self, path: str, height: int) -> None:
        """Write the SVG. height is the final canvas height (last box bottom plus about 30)."""
        body = "\n".join(self._head(height) + self.o + ["</svg>"])
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(body)
        print(f"wrote {path} ({self.width}x{height})")
