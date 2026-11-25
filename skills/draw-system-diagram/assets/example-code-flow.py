#!/usr/bin/env python3
"""Worked example: a swimlane data flow for a made-up endpoint, built with diagram_kit.

Run:  python3 example-code-flow.py out.svg
It writes the template the skill starts from (assets/template-code-flow.svg)
and doubles as the skill's self-test. Copy it, replace the Example Shop content with
the real endpoint, keep the structure.
"""

import os
import sys

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts")
)
from diagram_kit import Diagram  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else "template-code-flow.svg"

FACTS = {
    "example": True,
    "route": "POST /orders/{id}/export",
    "queue": "arq",
    "stepsInOrder": ["load", "render", "send"],
    "renderParallelism": 2,
    "jobTimeoutSeconds": 600,
    "sendEmail": {"deployed": False},
}

d = Diagram(
    "Example: one export request, start to finish",
    "Example Shop, made up. Replace every box with the real endpoint, keep the structure.",
    "A swimlane data flow of a made-up export endpoint: the client asks, the API queues one job and replies, "
    "the worker runs three steps in order, then two side jobs run at the same time. The email step is planned.",
    FACTS,
)
d.legend(parallel=True)

# ---- how to read
d.group(30, 150, 1380, 104, "indigo", "How to read this")
for x, a, b in [
    (50, "Left to right: who does the work.", "Top to bottom: time passes."),
    (
        500,
        "Arrow labels name the data that moves.",
        "Numbered steps: each waits for the one above.",
    ),
    (
        950,
        "AT ONCE tag: work that runs in parallel.",
        "Dashed box: planned, not live yet.",
    ),
]:
    d.add(f'<text x="{x}" y="218" font-size="16" fill="#344054">{a}</text>')
    d.add(f'<text x="{x}" y="240" font-size="16" fill="#344054">{b}</text>')

# ---- lanes
PBX, PBW = 45, 260
MX, MW = 430, 580
RX, RW = 1135, 260
LANES = [
    (30, 290, "blue", "Client"),
    (410, 620, "orange", "Backend: API, then worker"),
    (1120, 290, "purple", "Stores and services", "neutral"),
]
lane_at = d.mark()

y = 294
d.bar(y, "A. Request: the client waits, so the API answers fast.")
seg_a_top = y + 36 + 12
y = seg_a_top + 54

a1 = y
d.box(
    PBX,
    a1,
    PBW,
    104,
    "blue",
    "Ask for an export",
    ["Sends the order id and", "the format wanted."],
)
d.box(
    MX,
    a1,
    MW,
    104,
    "orange",
    "API: accept and queue",
    [
        "Checks the person owns the order, inserts an export row, queues",
        "ONE job and replies 202 at once.",
    ],
    code="orders_controller.start_export",
)
d.box(RX, a1, RW, 60, "purple", "Postgres", ["export row: queued"])
d.box(RX, a1 + 68, RW, 60, "purple", "Redis (arq)", ["export job queued"])
d.arrow(f"M{PBX + PBW} {a1 + 34}H{MX}", "blue", "request", 326, a1 + 24)
d.arrow(f"M{MX} {a1 + 80}H{PBX + PBW}", "orange", "202", 340, a1 + 70)
d.arrow(f"M{MX + MW} {a1 + 30}H{RX}", "orange", "insert", 1040, a1 + 20)
d.arrow(f"M{MX + MW} {a1 + 96}H{RX}", "orange", "enqueue", 1040, a1 + 86)
seg_a_end = a1 + 128 + 20
y = seg_a_end + 24

d.bar(
    y,
    "The client's request ends here. Everything below runs in the background.",
    solid=False,
)
y += 44 + 20
d.bar(y, "B. Export job: three steps, one after another.")
seg_b_top = y + 36 + 12
y = seg_b_top + 54

steps = [
    (
        "1. Load the orders",
        ["Reads the person's orders for the", "period asked for."],
        "export_worker.load",
        False,
    ),
    (
        "2. Render the file",
        ["Builds the CSV and the PDF side by", "side, then uploads both."],
        "export_worker.render",
        True,
    ),
    (
        "3. Send the email",
        ["Mails the download link. Planned: the", "mail service is not live yet."],
        "export_worker.send",
        False,
    ),
]
rows = []
for i, (t, ls, code, chip) in enumerate(steps):
    rows.append(y)
    d.box(MX, y, MW, 104, "orange", t, ls, chip=chip, code=code, dashed=(i == 2))
    y += 104 + 28
r = rows
d.box(
    RX,
    r[0] + 10,
    RW,
    84,
    "purple",
    "Postgres",
    ["reads the orders", "export row: running"],
)
d.arrow(f"M{RX} {r[0] + 52}H{MX + MW}", "purple", "orders", 1040, r[0] + 42)
d.box(RX, r[1] + 10, RW, 84, "purple", "Storage", ["export.csv and", "export.pdf"])
d.arrow(f"M{MX + MW} {r[1] + 52}H{RX}", "orange", "files", 1040, r[1] + 42)
d.box(
    RX, r[2] + 10, RW, 84, "green", "Mail service", ["planned, not live"], dashed=True
)
d.arrow(f"M{MX + MW} {r[2] + 52}H{RX}", "orange", "link", 1040, r[2] + 42, dashed=True)
for i in range(2):
    top = r[i] + 104
    cx = MX + MW // 2
    d.arrow(f"M{cx} {top}V{r[i + 1]}", "orange", "then", cx + 10, top + 19, small=True)
d.box(
    PBX,
    r[0],
    PBW,
    104,
    "blue",
    "Client is free",
    ["It polls the export row:", "queued, then running."],
)
d.box(
    PBX,
    r[2],
    PBW,
    104,
    "blue",
    "Download link",
    ["Appears when the file", "is stored."],
)
lane_end = r[2] + 104 + 24
d.lanes(seg_a_top, seg_a_end, LANES, lane_at)
d.lanes(seg_b_top, lane_end, LANES, lane_at + 3)

# ---- parallel jobs
cy = lane_end + 60
d.arrow(
    f"M{MX + MW // 2} {r[2] + 104}V{cy}",
    "orange",
    "enqueue, no waiting",
    MX + MW // 2 + 10,
    lane_end + 40,
)
d.group(
    30, cy, 1380, 226, "indigo", "C. After the export: separate jobs, at the same time"
)
d.box(
    50,
    cy + 50,
    430,
    160,
    "indigo",
    "Notification job",
    [
        "Writes an in-app notice that the",
        "export is ready.",
    ],
    chip=True,
    code="notify_worker.run",
)
d.box(
    510,
    cy + 50,
    430,
    160,
    "indigo",
    "Cleanup job",
    [
        "Deletes export files older than",
        "seven days.",
    ],
    chip=True,
    code="cleanup_worker.run",
)

final = cy + 226 + 30
d.save(OUT, final)
