"""Package solved engineering drawing questions as one offline HTML file."""

import argparse
import base64
import gzip
from html import escape
import json
from pathlib import Path
import re
import struct

ASSETS = Path(__file__).resolve().parent.parent / "assets"
IMAGE_TYPES = {
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
}


def image_url(path):
    mime = IMAGE_TYPES.get(path.suffix.lower())
    if mime is None:
        raise ValueError(f"Unsupported image format: {path.name}")
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def encoded_mesh(path):
    packed = path.read_bytes()
    raw = gzip.decompress(packed)
    if len(raw) < 12:
        raise ValueError(f"Incomplete mesh header: {path.name}")
    vertices, indices, stride = struct.unpack_from("<3I", raw)
    if (vertices < 3 or indices < 3 or indices % 3 or stride not in (2, 4)
            or len(raw) != 12 + 14 * vertices + indices * stride):
        raise ValueError(f"Invalid mesh buffer: {path.name}")
    index_format = "<H" if stride == 2 else "<I"
    if any(value >= vertices for (value,) in struct.iter_unpack(index_format, memoryview(raw)[12 + 14 * vertices:])):
        raise ValueError(f"Index exceeds vertex count: {path.name}")
    return base64.b64encode(packed).decode("ascii")


def script_json(value):
    # Quoted page data must stay inert inside the script element.
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", r"\u003c")


def build(manifest, output):
    data = json.loads(manifest.read_text(encoding="utf-8-sig"))
    base = manifest.parent
    items = data["questions"]
    if not isinstance(items, list) or not items:
        raise ValueError("questions must contain at least one question")
    title = data.get("title", "工程制图演示")
    meshes, questions = {}, []
    for index, item in enumerate(items, start=1):
        key = f"q{index}"
        meshes[key] = encoded_mesh(base / item["model"])
        sections = []
        for section_index, section in enumerate(item.get("sections", []), start=1):
            section_key = f"{key}s{section_index}"
            meshes[section_key] = encoded_mesh(base / section["model"])
            sections.append({"label": section["label"], "model": section_key})
        questions.append({
            "number": str(item["number"]),
            "title": item["title"],
            "tab": item.get("tab", ""),
            "prompt": item.get("prompt", ""),
            "notes": item.get("notes", []),
            "assumptions": item.get("assumptions", ""),
            "answer": image_url(base / item["answer"]),
            "source": image_url(base / item["source"]) if item.get("source") else None,
            "model": key,
            "sections": sections,
        })
    template = (ASSETS / "index.html").read_text(encoding="utf-8")
    replacements = {
        "<title>工程制图 · 交互演示</title>": f"<title>{escape(title)}</title>",
        "/* INLINE_STYLE */": (ASSETS / "style.css").read_text(encoding="utf-8"),
        "/* INLINE_MESHES */ null": script_json(meshes),
        "/* INLINE_PROJECT */ null": script_json({"title": title, "questions": questions}),
        "/* INLINE_VIEWER */": (ASSETS / "viewer.js").read_text(encoding="utf-8"),
        "/* INLINE_APP */": (ASSETS / "app.js").read_text(encoding="utf-8"),
    }
    for marker in replacements:
        if template.count(marker) != 1:
            raise ValueError(f"Template marker missing or repeated: {marker}")
    markers = "|".join(re.escape(marker) for marker in replacements)
    template = re.sub(markers, lambda match: replacements[match[0]], template)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(template, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="JSON project file")
    parser.add_argument("output", type=Path, help="Destination HTML")
    args = parser.parse_args()
    try:
        build(args.manifest, args.output)
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(1, f"Unable to build HTML: {error}\n")
    print(args.output.resolve())


if __name__ == "__main__":
    main()
