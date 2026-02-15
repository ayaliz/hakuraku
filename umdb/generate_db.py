import argparse
import gzip
import hashlib
import json
import sqlite3
import sys
from datetime import date
from google.protobuf import json_format
import os
from pathlib import Path

import data_pb2

sys.stdout.reconfigure(encoding='utf-8')
def open_db(path: str) -> sqlite3.Cursor:
    connection = sqlite3.connect(path)
    return connection.cursor()


def populate_charas(pb: data_pb2.UMDatabase, cursor: sqlite3.Cursor):
    cursor.execute("""SELECT t1."index", t1.text, t2.text FROM text_data AS t1
                      LEFT JOIN text_data AS t2 on t1."index"=t2."index"
                      WHERE t1.category=170 AND t2.category=7;""")
    rows = cursor.fetchall()
    for row in rows:
        c = data_pb2.Chara()
        c.id = row[0]
        c.name = row[1]
        c.cast_name = row[2]
        pb.chara.append(c)


def populate_cards(pb: data_pb2.UMDatabase, cursor: sqlite3.Cursor):
    cursor.execute("SELECT `index`, text FROM text_data WHERE category=5;")
    rows = cursor.fetchall()
    for row in rows:
        c = data_pb2.Card()
        c.id = row[0]
        c.name = row[1]
        pb.card.append(c)


def populate_support_cards(pb: data_pb2.UMDatabase, cursor: sqlite3.Cursor):
    cursor.execute('''SELECT s.id, t.text, s.chara_id
                      FROM support_card_data AS s
                      JOIN text_data AS t ON t."index"=s.id AND t.category=75;''')
    rows = cursor.fetchall()
    for row in rows:
        c = data_pb2.SupportCard()
        c.id = row[0]
        c.name = row[1]
        c.chara_id = row[2]
        pb.support_card.append(c)


def populate_race_instance(pb: data_pb2.UMDatabase, cursor: sqlite3.Cursor):
    cursor.execute("""SELECT ri.id, rcs.distance, rcs.ground, t.text
                      FROM race_instance AS ri
                      LEFT JOIN race AS r ON ri.race_id = r.id
                      LEFT JOIN race_course_set AS rcs ON r.course_set = rcs.id
                      LEFT JOIN text_data AS t ON t."index" = ri.id AND t.category = 29;""")
    rows = cursor.fetchall()
    for row in rows:
        r = data_pb2.RaceInstance()
        r.id = row[0]
        r.distance = row[1]
        r.ground_type = row[2]
        r.name = row[3] or 'Unknown'
        pb.race_instance.append(r)


def populate_skills(pb: data_pb2.UMDatabase, cursor: sqlite3.Cursor):
    cursor.execute('''SELECT s.id, t.text, s.grade_value, s.tag_id, s.rarity
                      FROM skill_data AS s
                      JOIN text_data AS t ON t."index"=s.id AND t.category=47;''')
    rows = cursor.fetchall()
    for row in rows:
        r = data_pb2.Skill()
        r.id = row[0]
        r.name = row[1]
        r.grade_value = row[2]
        r.tag_id.extend(row[3].split('/'))
        r.rarity = row[4]
        pb.skill.append(r)


def populate_single_mode_skill_need_point(pb: data_pb2.UMDatabase, cursor: sqlite3.Cursor):
    cursor.execute("SELECT id, need_skill_point, status_type, status_value, solvable_type FROM single_mode_skill_need_point;")
    rows = cursor.fetchall()
    for row in rows:
        r = data_pb2.SingleModeSkillNeedPoint()
        r.id = row[0]
        r.need_skill_point = row[1]
        r.status_type = row[2]
        r.status_value = row[3]
        r.solvable_type = row[4]
        pb.single_mode_skill_need_point.append(r)


def populate_text_data(pb: data_pb2.UMDatabase, cursor: sqlite3.Cursor):
    cursor.execute("SELECT id, category, `index`, text FROM text_data WHERE category IN (4, 147);")
    rows = cursor.fetchall()
    for row in rows:
        t = data_pb2.TextData()
        t.id = row[0]
        t.category = row[1]
        t.index = row[2]
        t.text = row[3]
        pb.text_data.append(t)


def populate_single_mode_rank(pb: data_pb2.UMDatabase, cursor: sqlite3.Cursor):
    cursor.execute("SELECT id, min_value, max_value FROM single_mode_rank ORDER BY id;")
    rows = cursor.fetchall()
    for row in rows:
        r = data_pb2.SingleModeRank()
        r.id = row[0]
        r.min_value = row[1]
        r.max_value = row[2]
        pb.single_mode_rank.append(r)


def main():
    parser = argparse.ArgumentParser()
    default_db_path = os.path.join(
    os.environ.get("LOCALAPPDATA", ""),
    "..",
    "LocalLow",
    "Cygames",
    "Umamusume",
    "master",
    "master.mdb",
    )
    parser.add_argument("--db_path", default=default_db_path)
    parser.add_argument("--version", default="test")
    args = parser.parse_args()

    pb = data_pb2.UMDatabase()
    pb.version = args.version

    cursor = open_db(args.db_path)

    for p in (populate_charas,
              populate_cards,
              populate_support_cards,
              populate_race_instance,
              populate_skills,
              populate_text_data,
              populate_single_mode_skill_need_point,
              populate_single_mode_rank):
        p(pb, cursor)

    print("Database populated, serializing...")

    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    output_dir = project_root / "public" / "data"

    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)

    with open(output_dir / 'umdb.binarypb.gz', 'wb') as f:
        f.write(gzip.compress(pb.SerializeToString(), mtime=0))

    # Force UTF-8 when writing JSON (so ☆ and other characters are preserved)
    with open(output_dir / 'umdb.json', 'w', encoding='utf-8') as f:
        json.dump(json_format.MessageToDict(pb), f, ensure_ascii=False, indent=2)

    generate_masterdata_artifacts(args.db_path, cursor, output_dir)


def _dump_all_tables(cursor: sqlite3.Cursor) -> dict:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    tables = [row[0] for row in cursor.fetchall()]
    snapshot = {}
    for table in tables:
        cursor.execute(f'SELECT * FROM "{table}";')
        cols = [desc[0] for desc in cursor.description]
        rows = [list(row) for row in cursor.fetchall()]
        snapshot[table] = {"columns": cols, "rows": rows}
    return snapshot


def _compute_diff(old_snapshot: dict, new_snapshot: dict) -> dict:
    tables_diff = {}
    all_tables = set(old_snapshot.keys()) | set(new_snapshot.keys())
    for table in all_tables:
        old_data = old_snapshot.get(table, {"columns": [], "rows": []})
        new_data = new_snapshot.get(table, {"columns": [], "rows": []})
        columns = new_data["columns"] if new_data["columns"] else old_data["columns"]

        old_rows = {tuple(r[0:1]): r for r in old_data["rows"]} if old_data["rows"] else {}
        new_rows = {tuple(r[0:1]): r for r in new_data["rows"]} if new_data["rows"] else {}

        added = [r for k, r in new_rows.items() if k not in old_rows]
        removed = [r for k, r in old_rows.items() if k not in new_rows]
        modified = []
        for k in old_rows:
            if k in new_rows and old_rows[k] != new_rows[k]:
                modified.append({"key": k[0], "before": old_rows[k], "after": new_rows[k]})

        if added or removed or modified:
            tables_diff[table] = {
                "columns": columns,
                "added": added,
                "removed": removed,
                "modified": modified,
            }
    return tables_diff


def generate_masterdata_artifacts(db_path: str, cursor: sqlite3.Cursor, output_dir: Path):
    masterdata_dir = output_dir / "masterdata"
    diffs_dir = masterdata_dir / "diffs"
    os.makedirs(diffs_dir, exist_ok=True)

    with open(db_path, "rb") as f:
        raw_bytes = f.read()
    new_hash = hashlib.sha256(raw_bytes).hexdigest()
    short_hash = new_hash[:12]
    today = date.today().isoformat()

    with open(masterdata_dir / "master.mdb.gz", "wb") as f:
        f.write(gzip.compress(raw_bytes, mtime=0))

    meta_path = masterdata_dir / "meta.json"
    if meta_path.exists():
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    else:
        meta = None

    if meta and meta.get("hash") == new_hash:
        print("masterdata: same hash, skipping artifact update.")
        return

    previous_hash = meta["hash"] if meta else None

    snapshot_path = masterdata_dir / "snapshot.json.gz"
    old_snapshot = None
    if snapshot_path.exists() and previous_hash:
        with gzip.open(snapshot_path, "rt", encoding="utf-8") as f:
            old_snapshot = json.load(f)

    new_snapshot = _dump_all_tables(cursor)

    with gzip.open(snapshot_path, "wt", encoding="utf-8") as f:
        json.dump(new_snapshot, f, ensure_ascii=False)

    versions_path = masterdata_dir / "versions.json"
    if versions_path.exists():
        with open(versions_path, "r", encoding="utf-8") as f:
            versions = json.load(f)
    else:
        versions = []

    diff_summary = None
    if old_snapshot is not None:
        tables_diff = _compute_diff(old_snapshot, new_snapshot)
        tables_changed = len(tables_diff)
        total_added = sum(len(v["added"]) for v in tables_diff.values())
        total_removed = sum(len(v["removed"]) for v in tables_diff.values())
        total_modified = sum(len(v["modified"]) for v in tables_diff.values())
        diff_summary = {
            "tables_changed": tables_changed,
            "added": total_added,
            "removed": total_removed,
            "modified": total_modified,
        }
        diff_data = {
            "from_hash": previous_hash,
            "to_hash": new_hash,
            "date": today,
            "summary": diff_summary,
            "tables": tables_diff,
        }
        diff_path = diffs_dir / f"{short_hash}.json.gz"
        with gzip.open(diff_path, "wt", encoding="utf-8") as f:
            json.dump(diff_data, f, ensure_ascii=False)
        print(f"masterdata: diff written to {diff_path}")

    version_entry = {
        "hash": new_hash,
        "short_hash": short_hash,
        "date": today,
        "previous_hash": previous_hash,
        "summary": diff_summary,
    }
    versions.append(version_entry)
    with open(versions_path, "w", encoding="utf-8") as f:
        json.dump(versions, f, ensure_ascii=False, indent=2)

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({"hash": new_hash, "date": today, "previous_hash": previous_hash}, f, ensure_ascii=False, indent=2)

    print(f"masterdata: artifacts updated (hash={short_hash})")


if __name__ == '__main__':
    main()
