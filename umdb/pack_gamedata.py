#!/usr/bin/env python3

import json
import gzip
import struct
import os
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


def pack_images():
    entries = []
    for path in sorted(ASSETS_DIR.rglob("*.png")):
        key = path.relative_to(ASSETS_DIR).as_posix()
        with open(path, "rb") as f:
            data = f.read()
        entries.append((key, data))

    print(f"  Collected {len(entries)} image assets")

    data_parts = []
    offset = 0
    manifest_entries = []
    for key, raw in entries:
        key_bytes = key.encode("utf-8")
        manifest_entries.append((key_bytes, offset, len(raw)))
        data_parts.append(raw)
        offset += len(raw)

    manifest_buf = bytearray()
    manifest_buf += struct.pack("<I", len(manifest_entries))
    for key_bytes, data_offset, data_length in manifest_entries:
        manifest_buf += struct.pack("<H", len(key_bytes))
        manifest_buf += key_bytes
        manifest_buf += struct.pack("<II", data_offset, data_length)

    blob = bytes(manifest_buf) + b"".join(data_parts)
    print(f"  Uncompressed blob: {len(blob):,} bytes")

    out_path = OUTPUT_DIR / "assets.bin.gz"
    with gzip.open(out_path, "wb", compresslevel=9) as f:
        f.write(blob)

    compressed_size = out_path.stat().st_size
    ratio = (1 - compressed_size / len(blob)) * 100
    print(f"  Written {out_path.name}: {compressed_size:,} bytes ({ratio:.1f}% compression)")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=== Packing JSON data ===")
    pack_json()

    print("\n=== Packing image assets ===")
    pack_images()

    print("\nDone!")


if __name__ == "__main__":
    main()
