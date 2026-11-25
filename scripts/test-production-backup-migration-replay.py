from __future__ import annotations

import hashlib
import importlib.util
import sqlite3
import tempfile
from pathlib import Path

module_path = Path(__file__).with_name("replay-production-backup-migrations.py")
spec = importlib.util.spec_from_file_location("production_backup_replay", module_path)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    migrations = root / "migrations"
    migrations.mkdir()
    sql = root / "restored.sql"

    # Model production after migration 0040 has also been applied:
    # 17 historical ledger entries + migrations 0013-0040 = 45 entries.
    statements = [
        "PRAGMA defer_foreign_keys=TRUE;",
        "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
        "CREATE TABLE companies (id INTEGER PRIMARY KEY, company_name TEXT NOT NULL);",
        "INSERT INTO companies (id, company_name) VALUES (1, 'Company A'), (2, 'Company B');",
        "CREATE TABLE archive_children (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL, FOREIGN KEY(parent_id) REFERENCES archive_parents(id));",
        "INSERT INTO archive_children (id, parent_id) VALUES (1, 7);",
        "CREATE TABLE archive_parents (id INTEGER PRIMARY KEY, label TEXT NOT NULL);",
        "INSERT INTO archive_parents (id, label) VALUES (7, 'Parent declared after child');",
        "CREATE TABLE global_company_rank_snapshot_meta_fixture (id INTEGER PRIMARY KEY);",
        "CREATE TABLE migration_child (id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL, FOREIGN KEY(company_id) REFERENCES companies(id));",
        "CREATE TABLE global_company_rank_snapshots (reporting_day TEXT NOT NULL, company_id TEXT NOT NULL, company_name TEXT NOT NULL, company_type_id INTEGER NOT NULL, star_rating INTEGER NOT NULL, weekly_income REAL, source_fetched_at TEXT NOT NULL, PRIMARY KEY(reporting_day, company_id));",
        "INSERT INTO global_company_rank_snapshots VALUES ('2026-11-22', 'zero-a', 'Zero A', 28, 0, 0, '2026-11-22T18:11:01.905Z'), ('2026-11-22', 'zero-b', 'Zero B', 28, 0, 0, '2026-11-22T18:11:01.905Z'), ('2026-11-22', 'zero-c', 'Zero C', 28, 0, 10, '2026-11-22T18:11:01.905Z'), ('2026-11-22', 'one-zero', 'One Zero', 28, 1, 0, '2026-11-22T18:11:01.905Z'), ('2026-11-22', 'one-a', 'One A', 28, 1, 100, '2026-11-22T18:11:01.905Z'), ('2026-11-22', 'one-b', 'One B', 28, 1, 200, '2026-11-22T18:11:01.905Z'), ('2026-11-22', 'one-c', 'One C', 28, 1, 300, '2026-11-22T18:11:01.905Z'), ('2026-11-22', 'one-d', 'One D', 28, 1, 400, '2026-11-22T18:11:01.905Z'), ('2026-11-22', 'two-a', 'Two A', 28, 2, 50, '2026-11-22T18:11:01.905Z'), ('2026-11-22', 'two-b', 'Two B', 28, 2, 100, '2026-11-22T18:11:01.905Z');",
        "CREATE TABLE global_star_income_buffers (reporting_day TEXT NOT NULL, company_type_id INTEGER NOT NULL, company_type TEXT NOT NULL, star_rating REAL NOT NULL, min_weekly_income REAL NOT NULL, max_weekly_income REAL NOT NULL, company_count INTEGER NOT NULL, source_started_at TEXT NOT NULL, captured_at TEXT NOT NULL, PRIMARY KEY(reporting_day, company_type_id, star_rating));",
        "INSERT INTO global_star_income_buffers VALUES ('2026-11-22', 28, 'Oil Rig', 0, 0, 10, 3, '2026-11-22T18:11:01.905Z', '2026-11-22T18:13:23.227Z'), ('2026-11-22', 28, 'Oil Rig', 1, 0, 400, 5, '2026-11-22T18:11:01.905Z', '2026-11-22T18:13:23.227Z'), ('2026-11-22', 28, 'Oil Rig', 2, 50, 100, 2, '2026-11-22T18:11:01.905Z', '2026-11-22T18:13:23.227Z');",
        "CREATE TABLE global_star_income_buffer_snapshots (reporting_day TEXT PRIMARY KEY, scheduled_at TEXT NOT NULL, source_started_at TEXT NOT NULL, source_completed_at TEXT NOT NULL, company_count INTEGER NOT NULL, benchmark_company_count INTEGER NOT NULL, company_type_count INTEGER NOT NULL, captured_at TEXT NOT NULL);",
        "INSERT INTO global_star_income_buffer_snapshots VALUES ('2026-11-22', '2026-11-22T18:10:00.000Z', '2026-11-22T18:11:01.905Z', '2026-11-22T18:13:23.227Z', 10, 10, 1, '2026-11-22T18:13:23.227Z');",
    ]
    for index in range(17):
        statements.append("INSERT INTO d1_migrations (name) VALUES ('base_migration_%02d.sql');" % index)
    sql.write_text("\n".join(statements) + "\n", encoding="utf-8")

    for number in range(13, 42):
        if number == 13:
            body = "ALTER TABLE companies ADD COLUMN notes TEXT;"
        elif number == 14:
            body = "CREATE TABLE migration_child (id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL, FOREIGN KEY(company_id) REFERENCES companies(id));"
        elif number == 38:
            body = "CREATE TABLE global_company_rank_snapshot_meta_fixture (id INTEGER PRIMARY KEY);"
        elif number == 39:
            body = "DROP TABLE IF EXISTS discord_alert_poll_history; DROP TABLE IF EXISTS discord_alert_poll_health;"
        elif number == 40:
            body = (
                "CREATE TABLE global_star_income_buffers (reporting_day TEXT NOT NULL, company_type_id INTEGER NOT NULL, "
                "star_rating REAL NOT NULL, min_weekly_income REAL NOT NULL, max_weekly_income REAL NOT NULL, "
                "company_count INTEGER NOT NULL, PRIMARY KEY(reporting_day, company_type_id, star_rating));"
                "\nCREATE TABLE global_star_income_buffer_snapshots (reporting_day TEXT PRIMARY KEY);"
            )
        elif number == 41:
            body = (
                Path(__file__).resolve().parents[1] / "migrations" / "auth" /
                "0041_third_lowest_star_income_buffer.sql"
            ).read_text(encoding="utf-8")
        else:
            body = f"CREATE TABLE migration_test_{number} (id INTEGER PRIMARY KEY);"
        filename = f"{number:04d}_fixture.sql"
        (migrations / filename).write_text(body + "\n", encoding="utf-8")
        if number < 41:
            with sql.open("a", encoding="utf-8") as stream:
                stream.write("INSERT INTO d1_migrations (name) VALUES ('" + filename + "');\n")

    original_sql = sql.read_text(encoding="utf-8")
    sql_hash = hashlib.sha256(sql.read_bytes()).hexdigest()

    result = module.replay_backup(sql, migrations, sql_hash)
    assert result["result"] == "success"
    assert result["starting_migration_count"] == 45
    assert result["final_migration_count"] == 46
    assert result["replayed_migrations"] == ["0041_fixture.sql"]
    assert result["preserved_existing_tables"] == result["starting_application_table_count"]
    assert result["row_count_decreases"] == 0
    assert result["foreign_key_violations"] == 0

    # Verify the real 0041 SQL backfills from the exact matching full snapshot,
    # keeps zero incomes only at 0 stars, and leaves groups with fewer than
    # three eligible companies without a third-lowest threshold.
    verification = sqlite3.connect(":memory:")
    try:
        verification.executescript(original_sql)
        verification.executescript(
            (Path(__file__).resolve().parents[1] / "migrations" / "auth" /
             "0041_third_lowest_star_income_buffer.sql").read_text(encoding="utf-8")
        )
        income_rows = verification.execute(
            "SELECT star_rating, company_count, min_weekly_income, max_weekly_income, third_lowest_weekly_income "
            "FROM global_star_income_buffers WHERE reporting_day='2026-11-22' ORDER BY star_rating"
        ).fetchall()
        assert income_rows == [
            (0.0, 3, 0.0, 10.0, 10.0),
            (1.0, 4, 100.0, 400.0, 300.0),
            (2.0, 2, 50.0, 100.0, None),
        ]
        benchmark_count = verification.execute(
            "SELECT benchmark_company_count FROM global_star_income_buffer_snapshots WHERE reporting_day='2026-11-22'"
        ).fetchone()[0]
        assert benchmark_count == 9
    finally:
        verification.close()

    # Every previously applied migration through 0040 must be present.
    missing_prior_sql = original_sql.replace(
        "INSERT INTO d1_migrations (name) VALUES ('0040_fixture.sql');\n", ""
    )
    sql.write_text(missing_prior_sql, encoding="utf-8")
    missing_prior_hash = hashlib.sha256(sql.read_bytes()).hexdigest()
    try:
        module.replay_backup(sql, migrations, missing_prior_hash)
        raise AssertionError("Expected a missing prior migration to be rejected.")
    except RuntimeError as error:
        assert "missing previously applied migrations" in str(error)

    # Migration 0041 must be pending exactly once.
    sql.write_text(
        original_sql + "INSERT INTO d1_migrations (name) VALUES ('0041_fixture.sql');\n",
        encoding="utf-8",
    )
    already_applied_hash = hashlib.sha256(sql.read_bytes()).hexdigest()
    try:
        module.replay_backup(sql, migrations, already_applied_hash)
        raise AssertionError("Expected an already-applied migration to be rejected.")
    except RuntimeError as error:
        assert "Expected only migration 0041 to be pending" in str(error)

    # The additive migration may not reduce rows in a retained table.
    sql.write_text(original_sql, encoding="utf-8")
    target = migrations / "0041_fixture.sql"
    original_target = target.read_text(encoding="utf-8")
    target.write_text(
        "DELETE FROM companies;\n"
        "ALTER TABLE global_star_income_buffers ADD COLUMN third_lowest_weekly_income REAL;\n",
        encoding="utf-8",
    )
    try:
        module.replay_backup(sql, migrations, sql_hash)
        raise AssertionError("Expected a retained-table row count decrease to be rejected.")
    except RuntimeError as error:
        assert "row counts decreased" in str(error)

    # The additive migration may not drop any pre-existing table.
    sql.write_text(original_sql, encoding="utf-8")
    target.write_text(
        "DROP TABLE companies;\n"
        "ALTER TABLE global_star_income_buffers ADD COLUMN third_lowest_weekly_income REAL;\n",
        encoding="utf-8",
    )
    try:
        module.replay_backup(sql, migrations, sql_hash)
        raise AssertionError("Expected a table drop to be rejected.")
    except RuntimeError as error:
        assert "table present in the restored backup disappeared" in str(error)
    finally:
        target.write_text(original_target, encoding="utf-8")

    try:
        module.replay_backup(sql, migrations, "0" * 64)
        raise AssertionError("Expected a checksum mismatch to be rejected.")
    except RuntimeError as error:
        assert "SHA-256 did not match" in str(error)

print(
    "PASS local production-backup migration replay harness: 45-entry current ledger through 0040, "
    "only 0041 pending, additive schema preservation, integrity, foreign keys, and checksum guard."
)
