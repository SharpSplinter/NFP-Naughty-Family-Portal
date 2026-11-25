#!/usr/bin/env python3
"""Offline replay of pending portal D1 migrations against a normalized production export.

This program uses Python's local SQLite library only. It never contacts Cloudflare,
Torn, D1, Queues, or any remote service.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path


EXPECTED_MIGRATION_NUMBERS = list(range(13, 42))
EXPECTED_RESTORED_MIGRATION_COUNT = 45
EXPECTED_PENDING_MIGRATION_NUMBERS = [41]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def application_table_counts(connection: sqlite3.Connection) -> dict[str, int]:
    rows = connection.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' "
        "AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' ORDER BY name"
    ).fetchall()
    counts: dict[str, int] = {}
    for (name,) in rows:
        count = connection.execute(
            f"SELECT COUNT(*) FROM {quote_identifier(name)}"
        ).fetchone()[0]
        counts[str(name)] = int(count)
    return counts


def read_migration_ledger(connection: sqlite3.Connection) -> tuple[set[str], set[str]]:
    table = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='d1_migrations'"
    ).fetchone()
    if not table:
        raise RuntimeError("Restored SQL is missing the d1_migrations ledger table.")
    columns = {
        str(row[1])
        for row in connection.execute("PRAGMA table_info('d1_migrations')").fetchall()
    }
    if "name" not in columns:
        raise RuntimeError("The d1_migrations ledger does not expose a name column.")
    applied = {
        str(row[0])
        for row in connection.execute("SELECT name FROM d1_migrations").fetchall()
    }
    return applied, columns


def record_migration(connection: sqlite3.Connection, columns: set[str], name: str) -> None:
    fields = ["name"]
    values = ["?"]
    parameters: list[str] = [name]
    if "applied_at" in columns:
        fields.append("applied_at")
        values.append("CURRENT_TIMESTAMP")
    connection.execute(
        "INSERT INTO d1_migrations (" + ", ".join(fields) + ") VALUES (" + ", ".join(values) + ")",
        parameters,
    )
    connection.commit()


def replay_backup(
    sql_path: Path,
    migrations_dir: Path,
    expected_sql_sha256: str,
) -> dict[str, object]:
    actual_sha256 = sha256_file(sql_path)
    if actual_sha256.lower() != expected_sql_sha256.lower():
        raise RuntimeError(
            "Normalized SQL SHA-256 did not match the operator-supplied expected checksum."
        )

    connection = sqlite3.connect(":memory:")
    try:
        # D1 exports can insert child rows before a referenced parent table is
        # declared later in the dump. Disable FK enforcement only during the
        # pristine snapshot import, then turn it back on before migration replay.
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.executescript(sql_path.read_text(encoding="utf-8"))
        connection.execute("PRAGMA foreign_keys = ON")

        applied, ledger_columns = read_migration_ledger(connection)

        all_files = sorted(
            (path for path in migrations_dir.glob("*.sql") if path.is_file()),
            key=lambda path: path.name,
        )
        candidate_files: list[Path] = []
        for path in all_files:
            try:
                number = int(path.name.split("_", 1)[0])
            except ValueError:
                continue
            if 13 <= number <= 41:
                candidate_files.append(path)

        numbers = [int(path.name.split("_", 1)[0]) for path in candidate_files]
        if numbers != EXPECTED_MIGRATION_NUMBERS:
            raise RuntimeError(
                "The checked-out migration directory must contain exactly one ordered migration for every prefix 0013 through 0041."
            )

        # Production already has 0038_global_company_rank_snapshot_meta.sql and
        # 0039_retire_discord_poll_telemetry.sql in its live ledger. Both must be
        # represented in the backup; the only new migration in this release is 0041.
        prior_migrations = [
            path for path in candidate_files
            if int(path.name.split("_", 1)[0]) < 41
        ]
        missing_prior = [path.name for path in prior_migrations if path.name not in applied]
        if missing_prior:
            raise RuntimeError(
                "The restored production ledger is missing previously applied migrations: "
                + ", ".join(missing_prior[:12])
            )

        pending = [path for path in candidate_files if path.name not in applied]
        pending_numbers = [int(path.name.split("_", 1)[0]) for path in pending]
        if pending_numbers != EXPECTED_PENDING_MIGRATION_NUMBERS:
            raise RuntimeError(
                "Expected only migration 0041 to be pending for this production backup; "
                f"found {pending_numbers}."
            )

        if len(applied) != EXPECTED_RESTORED_MIGRATION_COUNT:
            raise RuntimeError(
                "Expected the production backup to contain "
                f"{EXPECTED_RESTORED_MIGRATION_COUNT} applied migrations through 0040; "
                f"found {len(applied)} entries."
            )

        before_counts = application_table_counts(connection)
        before_total = sum(before_counts.values())

        for migration in pending:
            sql = migration.read_text(encoding="utf-8")
            try:
                connection.executescript(sql)
                record_migration(connection, ledger_columns, migration.name)
            except sqlite3.Error as error:
                raise RuntimeError(
                    f"Local SQLite replay failed at {migration.name}: {error}"
                ) from error
            connection.execute("PRAGMA foreign_keys = ON")

        after_counts = application_table_counts(connection)
        missing_tables = sorted(set(before_counts) - set(after_counts))
        if missing_tables:
            raise RuntimeError(
                "A table present in the restored backup disappeared during additive replay: "
                + ", ".join(missing_tables[:12])
            )

        decreased_tables = sorted(
            name for name, count in before_counts.items()
            if after_counts.get(name, -1) < count
        )
        if decreased_tables:
            details = ", ".join(
                f"{name} ({before_counts[name]} -> {after_counts[name]})"
                for name in decreased_tables[:12]
            )
            raise RuntimeError(
                "Existing application table row counts decreased during replay: " + details
            )

        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"SQLite integrity_check failed: {integrity}")

        connection.execute("PRAGMA foreign_keys = ON")
        foreign_key_violations = connection.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_violations:
            raise RuntimeError(
                f"SQLite foreign_key_check found {len(foreign_key_violations)} violation(s)."
            )

        final_ledger, _ = read_migration_ledger(connection)
        missing_migrations = [path.name for path in pending if path.name not in final_ledger]
        if missing_migrations:
            raise RuntimeError(
                "The final migration ledger is missing entries: "
                + ", ".join(missing_migrations)
            )

        return {
            "result": "success",
            "sqlite_version": sqlite3.sqlite_version,
            "normalized_sql_sha256": actual_sha256,
            "starting_migration_count": len(applied),
            "replayed_migrations": [path.name for path in pending],
            "final_migration_count": len(final_ledger),
            "starting_application_table_count": len(before_counts),
            "final_application_table_count": len(after_counts),
            "starting_application_row_count": before_total,
            "final_application_row_count": sum(after_counts.values()),
            "preserved_existing_tables": len(before_counts),
            "row_count_decreases": 0,
            "integrity_check": integrity,
            "foreign_key_violations": len(foreign_key_violations),
            "execution_mode": "local SQLite only; no Cloudflare D1 or Queue calls",
        }
    finally:
        connection.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sql-file", required=True, type=Path)
    parser.add_argument("--migrations-dir", required=True, type=Path)
    parser.add_argument("--expected-sql-sha256", required=True)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    if not args.sql_file.is_file():
        parser.error("--sql-file must identify an extracted SQL file.")
    if not args.migrations_dir.is_dir():
        parser.error("--migrations-dir must identify a migrations directory.")
    if len(args.expected_sql_sha256) != 64 or any(
        char not in "0123456789abcdefABCDEF" for char in args.expected_sql_sha256
    ):
        parser.error("--expected-sql-sha256 must be exactly 64 hexadecimal characters.")

    report = replay_backup(args.sql_file, args.migrations_dir, args.expected_sql_sha256)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "PASS local production-data migration replay: "
        f"{len(report['replayed_migrations'])} migration, "
        f"{report['preserved_existing_tables']} existing tables preserved, "
        f"{report['foreign_key_violations']} foreign-key violations."
    )
    print(f"SQLite integrity_check: {report['integrity_check']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"FAIL local migration replay: {error}", file=sys.stderr)
        raise SystemExit(1)
