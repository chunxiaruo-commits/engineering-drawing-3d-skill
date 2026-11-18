"""Find ray hits in the packaged 3D mesh from the front, top or left."""

import argparse
import base64
import gzip
import json
from pathlib import Path
import re
import struct

import numpy as np


# (Screen coordinate axes in model units, depth axis, positive-side viewer)
VIEWS = {"front": ((0, 2), 1, True), "top": ((0, 1), 2, True), "left": ((1, 2), 0, False)}


def load_triangles(path, model):
    if path.suffix.lower() == ".html":
        match = re.search(r"(?m)^const meshData = (\{[^\n]*\});$", path.read_text(encoding="utf-8"))
        if match is None:
            raise ValueError("Expected HTML generated with the skill's viewer template")
        meshes = json.loads(match[1])
        if model is None:
            model = next(iter(meshes), None)
        if model not in meshes:
            raise ValueError(f"Unknown mesh key {model!r}. Available keys: {', '.join(meshes)}")
        compressed = base64.b64decode(meshes[model], validate=True)
    else:
        if model is not None:
            raise ValueError("--model selects an embedded mesh in an HTML file")
        compressed = path.read_bytes()
    raw = gzip.decompress(compressed)
    count, length, stride = struct.unpack_from("<3I", raw)
    index_offset = 12 + 14 * count
    if count < 3 or length < 3 or length % 3 or stride not in (2, 4) or len(raw) != index_offset + length * stride:
        raise ValueError("Invalid packed mesh")
    xyz = np.frombuffer(raw, "<i2", count=7 * count, offset=12).reshape(-1, 7)[:, :3]
    indices = np.frombuffer(raw, f"<u{stride}", offset=index_offset).reshape(-1, 3)
    if indices.max() >= count:
        raise ValueError("Triangle index exceeds vertex count")
    return xyz[indices] / 30000


def ray_hits(triangles, view, points):
    axes, depth_axis, positive_view = VIEWS[view]
    projected = triangles[:, :, axes]
    a, b, c = projected.transpose(1, 0, 2)
    u, v = b - a, c - a
    determinant = u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0]
    valid = np.abs(determinant) > 1e-12
    a, u, v, determinant = a[valid], u[valid], v[valid], determinant[valid]
    depths = triangles[valid, :, depth_axis]
    for point in points:
        delta = point - a
        s = (delta[:, 0] * v[:, 1] - delta[:, 1] * v[:, 0]) / determinant
        t = (u[:, 0] * delta[:, 1] - u[:, 1] * delta[:, 0]) / determinant
        inside = (s >= -1e-8) & (t >= -1e-8) & (s + t <= 1 + 1e-8)
        crossing_depths = depths[:, 0] + s * (depths[:, 1] - depths[:, 0]) + t * (depths[:, 2] - depths[:, 0])
        ordered = np.sort(crossing_depths[inside])
        if len(ordered):
            ordered = ordered[np.r_[True, np.diff(ordered) > 1e-8]]
        yield ordered[::-1] if positive_view else ordered


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Packed .mesh.gz or an HTML from build_demo.py")
    parser.add_argument("view", choices=VIEWS)
    parser.add_argument("--point", nargs=2, type=float, action="append", required=True,
                        metavar=("U", "V"), help="front: X Z; top: X Y; left: Y Z. Repeat to probe multiple points.")
    parser.add_argument("--bounds", type=float, nargs=6, metavar="LIMIT",
                        help="Original mesh packing bounds: Xmin Xmax Ymin Ymax Zmin Zmax")
    parser.add_argument("--model", help="Embedded mesh key, e.g. q2 or q1s1. Defaults to first model.")
    args = parser.parse_args()
    try:
        points = np.asarray(args.point)
        if not np.isfinite(points).all():
            raise ValueError("Points must be finite")
        center, radius = np.zeros(3), 1
        if args.bounds is not None:
            limits = np.asarray(args.bounds).reshape(3, 2)
            span = limits[:, 1] - limits[:, 0]
            if not np.isfinite(limits).all() or np.any(span <= 0):
                raise ValueError("Bounds must be finite and increasing on each axis")
            center = limits.mean(axis=1)
            radius = np.linalg.norm(span) / 2
        axes, depth_axis, _ = VIEWS[args.view]
        triangles = load_triangles(args.input, args.model)
        normalized = (points - center[list(axes)]) / radius
        hits = ray_hits(triangles, args.view, normalized)
        print(json.dumps([{"point": point, "hits": (depth * radius + center[depth_axis]).tolist()}
                          for point, depth in zip(args.point, hits)]))
    except (OSError, ValueError, KeyError, EOFError, struct.error) as error:
        parser.exit(1, f"Unable to probe projection: {error}\n")


if __name__ == "__main__":
    main()
