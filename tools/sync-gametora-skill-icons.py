#!/usr/bin/env python3
"""Sync missing skill icons from GameTora's public Uma Musume catalog.

Requires Pillow. Existing icons are left untouched unless --refresh is used.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image


GAMETORA_BASE = "https://gametora.com"
MANIFEST_URL = f"{GAMETORA_BASE}/data/manifests/umamusume.json"
MEDIA_ICON_URL = "https://media.gametora.com/umamusume/skills/icon/{icon_id}.png"
HASH_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
USER_AGENT = "Hakuraku skill-icon sync/1.0"


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        content_type = response.headers.get_content_type()
        payload = response.read()
    if not payload:
        raise ValueError(f"Empty response from {url}")
    if content_type not in {"application/json", "image/png", "application/octet-stream"}:
        raise ValueError(f"Unexpected content type {content_type!r} from {url}")
    return payload


def fetch_json(url: str) -> object:
    return json.loads(fetch_bytes(url))


def catalog_icon_ids() -> list[int]:
    manifest = fetch_json(MANIFEST_URL)
    if not isinstance(manifest, dict):
        raise ValueError("GameTora manifest is not an object")
    skills_hash = manifest.get("skills")
    if not isinstance(skills_hash, str) or not HASH_RE.fullmatch(skills_hash):
        raise ValueError("GameTora manifest has an invalid skills hash")

    skills_url = f"{GAMETORA_BASE}/data/umamusume/skills.{skills_hash}.json"
    skills = fetch_json(skills_url)
    if not isinstance(skills, list):
        raise ValueError("GameTora skills catalog is not an array")

    icon_ids: set[int] = set()
    for skill in skills:
        if not isinstance(skill, dict):
            continue
        value = skill.get("iconid")
        try:
            icon_id = int(value)
        except (TypeError, ValueError):
            continue
        if icon_id > 0:
            icon_ids.add(icon_id)
    return sorted(icon_ids)


def convert_icon(payload: bytes, destination: Path) -> None:
    with Image.open(io.BytesIO(payload)) as image:
        image.load()
        if image.format != "PNG":
            raise ValueError(f"Expected PNG source, received {image.format}")
        if image.size != (64, 64):
            raise ValueError(f"Expected a 64x64 icon, received {image.size}")
        converted = image.convert("RGBA")

    temporary = destination.with_suffix(destination.suffix + ".tmp")
    try:
        converted.save(temporary, format="WEBP", lossless=True, method=6)
        with Image.open(temporary) as check:
            check.verify()
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    repository = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=repository / "public" / "assets" / "skill_icons",
        help="Destination directory for utx_ico_skill_<id>.webp files",
    )
    parser.add_argument("--refresh", action="store_true", help="Replace icons that already exist")
    parser.add_argument("--dry-run", action="store_true", help="List required downloads without writing files")
    parser.add_argument(
        "--delay",
        type=float,
        default=0.05,
        help="Delay in seconds between media requests (default: 0.05)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.delay < 0:
        raise ValueError("--delay cannot be negative")

    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    icon_ids = catalog_icon_ids()
    selected = [
        icon_id
        for icon_id in icon_ids
        if args.refresh or not (output / f"utx_ico_skill_{icon_id}.webp").exists()
    ]
    print(json.dumps({"catalogIcons": len(icon_ids), "downloads": len(selected), "output": str(output)}))
    if args.dry_run:
        print(" ".join(map(str, selected)))
        return 0

    added = 0
    failures: list[tuple[int, str]] = []
    for index, icon_id in enumerate(selected):
        destination = output / f"utx_ico_skill_{icon_id}.webp"
        try:
            payload = fetch_bytes(MEDIA_ICON_URL.format(icon_id=icon_id))
            convert_icon(payload, destination)
            added += 1
            print(f"[{index + 1}/{len(selected)}] added {destination.name}")
        except Exception as error:  # Continue so one missing upstream asset does not hide the rest.
            failures.append((icon_id, str(error)))
            print(f"[{index + 1}/{len(selected)}] failed {icon_id}: {error}", file=sys.stderr)
        if args.delay and index + 1 < len(selected):
            time.sleep(args.delay)

    print(json.dumps({"catalogIcons": len(icon_ids), "added": added, "failed": len(failures)}))
    if failures:
        print(json.dumps({"failures": failures}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
