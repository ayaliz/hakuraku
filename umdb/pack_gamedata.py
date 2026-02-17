#!/usr/bin/env python3

import json
import gzip
import os
import shutil
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
ASSETS_DIR = PROJECT_ROOT / "assets"
OUTPUT_DIR = PROJECT_ROOT / "public" / "data"


def pack_json():
    combined = {}
    for path in sorted(ASSETS_DIR.rglob("*.json")):
        rel = path.relative_to(ASSETS_DIR)
        key = rel.with_suffix("").as_posix()
        with open(path, "r", encoding="utf-8") as f:
            combined[key] = json.load(f)
        print(f"  Loaded {key} ({path.stat().st_size:,} bytes)")

    raw = json.dumps(combined, separators=(",", ":")).encode("utf-8")
    print(f"  Combined JSON: {len(raw):,} bytes")

    out_path = OUTPUT_DIR / "gamedata.bin.gz"
    with gzip.open(out_path, "wb", compresslevel=9) as f:
        f.write(raw)

    compressed_size = out_path.stat().st_size
    ratio = (1 - compressed_size / len(raw)) * 100
    print(f"  Written {out_path.name}: {compressed_size:,} bytes ({ratio:.1f}% compression)")


def copy_images():
    out_dir = PROJECT_ROOT / "public" / "assets"
    count = 0
    skipped = 0
    for path in sorted(ASSETS_DIR.rglob("*.png")):
        rel = path.relative_to(ASSETS_DIR)
        webp_dest = out_dir / rel.with_suffix(".webp")
        if webp_dest.exists():
            skipped += 1
            continue
        dest = out_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)
        count += 1
    print(f"  Copied {count} new image files to {out_dir} ({skipped} skipped, webp already present)")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=== Packing JSON data ===")
    pack_json()

    print("\n=== Copying image assets ===")
    copy_images()

    print("\nDone!")


if __name__ == "__main__":
    main()
