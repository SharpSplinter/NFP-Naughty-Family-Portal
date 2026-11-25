from __future__ import annotations

import hashlib
import importlib.util
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

    # Model production after migrations 0038 and 0039 have already been applied:
    # 17 historical ledger entries + migrations 0013-0039 = 44 entries.
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
    ]
    for index in range(17):
        statements.append("INSERT INTO d1_migrations (name) VALUES ('base_migration_%02d.sql');" % index)
    sql.write_text("\n".join(statements) + "\n", encoding="utf-8")

    for number in range(13, 41):
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
        else:
            body = f"CREATE TABLE migration_test_{number} (id INTEGER PRIMARY KEY);"
        filename = f"{number:04d}_fixture.sql"
        (migrations / filename).write_text(body + "\n", encoding="utf-8")
        if number < 40:
            with sql.open("a", encoding="utf-8") as stream:
                stream.write("INSERT INTO d1_migrations (name) VALUES ('" + filename + "');\n")

    original_sql = sql.read_text(encoding="utf-8")
    sql_hash = hashlib.sha256(sql.read_bytes()).hexdigest()

    result = module.replay_backup(sql, migrations, sql_hash)
    assert result["result"] == "success"
    assert result["starting_migration_count"] == 44
    assert result["final_migration_count"] == 45
    assert result["replayed_migrations"] == ["0040_fixture.sql"]
    assert result["preserved_existing_tables"] == result["starting_application_table_count"]
    assert result["row_count_decreases"] == 0
    assert result["foreign_key_violations"] == 0

    # Every previously applied migration through 0039 must be present.
    missing_prior_sql = original_sql.replace(
        "INSERT INTO d1_migrations (name) VALUES ('0039_fixture.sql');\n", ""
    )
    sql.write_text(missing_prior_sql, encoding="utf-8")
    missing_prior_hash = hashlib.sha256(sql.read_bytes()).hexdigest()
    try:
        module.replay_backup(sql, migrations, missing_prior_hash)
        raise AssertionError("Expected a missing prior migration to be rejected.")
    except RuntimeError as error:
        assert "missing previously applied migrations" in str(error)

    # Migration 0040 must be pending exactly once.
    sql.write_text(
        original_sql + "INSERT INTO d1_migrations (name) VALUES ('0040_fixture.sql');\n",
        encoding="utf-8",
    )
    already_applied_hash = hashlib.sha256(sql.read_bytes()).hexdigest()
    try:
        module.replay_backup(sql, migrations, already_applied_hash)
        raise AssertionError("Expected an already-applied migration to be rejected.")
    except RuntimeError as error:
        assert "Expected only migration 0040 to be pending" in str(error)

    # The additive migration may not reduce rows in a retained table.
    sql.write_text(original_sql, encoding="utf-8")
    target = migrations / "0040_fixture.sql"
    original_target = target.read_text(encoding="utf-8")
    target.write_text(
        "DELETE FROM companies;\n"
        "CREATE TABLE global_star_income_buffers (id INTEGER PRIMARY KEY);\n"
        "CREATE TABLE global_star_income_buffer_snapshots (id INTEGER PRIMARY KEY);\n",
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
        "CREATE TABLE global_star_income_buffers (id INTEGER PRIMARY KEY);\n"
        "CREATE TABLE global_star_income_buffer_snapshots (id INTEGER PRIMARY KEY);\n",
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
    "PASS local production-backup migration replay harness: 44-entry current ledger through 0039, "
    "only 0040 pending, additive schema preservation, integrity, foreign keys, and checksum guard."
)
