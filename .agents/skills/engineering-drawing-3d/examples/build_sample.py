"""Reproduce the synthetic stepped block example without an attachment."""

import argparse
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_demo import build
from mesh_sdf import between, solid, union, write_mesh

WIDTH, DEPTH, HEIGHT = 80, 48, 34
STEP_Y, STEP_HEIGHT = 25, 22
HOLE_Z, RADIUS, SCALE = 11, 6, 3
BOUNDS = [(-WIDTH / 2, WIDTH / 2), (0, DEPTH), (0, HEIGHT)]


def stepped_block(x, y, z):
    span = abs(x) - WIDTH / 2
    low = solid(span, between(y, 0, DEPTH), between(z, 0, STEP_HEIGHT))
    back = solid(span, between(y, 0, STEP_Y), between(z, 0, HEIGHT))
    hole = np.hypot(x, z - HOLE_Z) - RADIUS
    return solid(union(low, back), -hole)


def drawing(answer):
    w, d, h = WIDTH * SCALE, DEPTH * SCALE, HEIGHT * SCALE
    sy, sh, z, r = (value * SCALE for value in (STEP_Y, STEP_HEIGHT, HOLE_Z, RADIUS))
    base_y, plan_y, front_x, left_x = 156, 215, 57, 367
    middle = front_x + w / 2
    rear_chord = (base_y - z + r, base_y - z - r)
    left = f'''
      <g class="added">
        <path d="M{left_x} {base_y}v{-h}h{sy}v{h-sh}h{d-sy}v{sh}Z"/>
        <line class="hidden" x1="{left_x}" y1="{rear_chord[0]}" x2="{left_x+d}" y2="{rear_chord[0]}"/>
        <line class="hidden" x1="{left_x}" y1="{rear_chord[1]}" x2="{left_x+d}" y2="{rear_chord[1]}"/>
        <line class="center" x1="{left_x-14}" y1="{base_y-z}" x2="{left_x+d+14}" y2="{base_y-z}"/>
      </g>
      <text x="{left_x+d/2}" y="31" class="answer-label">左视图 · 补画</text>
    ''' if answer else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 570 400">
      <style>
        path,line,rect,circle{{fill:none;stroke:#253833;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}}
        text{{font:15px sans-serif;text-anchor:middle;fill:#4e6661}}
        .hidden{{stroke-width:1.4;stroke-dasharray:7 4}}
        .center{{stroke-width:1;stroke-dasharray:12 4 2 4}}
        .added > *{{stroke:#00735f}}
        .answer-label{{fill:#00735f}}
      </style>
      <text x="{middle}" y="31">主视图</text>
      <rect x="{front_x}" y="{base_y-h}" width="{w}" height="{h}"/>
      <path d="M{front_x} {base_y-sh}h{w}"/>
      <circle cx="{middle}" cy="{base_y-z}" r="{r}"/>
      <path class="center" d="M{middle-r-11} {base_y-z}h{r*2+22}M{middle} {base_y-z-r-11}v{r*2+22}"/>
      <rect x="{front_x}" y="{plan_y}" width="{w}" height="{d}"/>
      <path d="M{front_x} {plan_y+sy}h{w}"/>
      <path class="hidden" d="M{middle-r} {plan_y}v{d}M{middle+r} {plan_y}v{d}"/>
      <path class="center" d="M{middle} {plan_y-12}v{d+24}"/>
      <text x="{middle}" y="{plan_y+d+28}">俯视图</text>
      {left}
    </svg>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("demo.html"))
    args = parser.parse_args()
    with TemporaryDirectory() as temporary:
        job = Path(temporary)
        for name, answer in [("source.svg", False), ("answer.svg", True)]:
            (job / name).write_text(drawing(answer), encoding="utf-8")
        write_mesh(job / "part.mesh.gz", stepped_block, BOUNDS, step=1.15)
        write_mesh(job / "section.mesh.gz", stepped_block, BOUNDS, step=1.15, clip=lambda x, y, z: -x)
        project = {
            "title": "带通孔的台阶块",
            "questions": [{
                "number": "1",
                "title": "补画带通孔台阶块的左视图",
                "tab": "补左视图",
                "prompt": "已知主视图和俯视图，补画左视图。",
                "model": "part.mesh.gz",
                "source": "source.svg",
                "answer": "answer.svg",
                "notes": [
                    "从俯视图转移总深度和台阶位置。",
                    "从主视图转移高度及孔的上下边界。",
                    "圆孔沿深度方向贯通，侧面用两条水平虚线表达。"
                ],
                "sections": [{"label": "沿孔轴剖切", "model": "section.mesh.gz"}],
            }],
        }
        manifest = job / "project.json"
        manifest.write_text(json.dumps(project, ensure_ascii=False), encoding="utf-8")
        build(manifest, args.output.resolve())
    print(args.output.resolve())


if __name__ == "__main__":
    main()
