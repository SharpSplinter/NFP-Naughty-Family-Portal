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

    statements = [
        "PRAGMA defer_foreign_keys=TRUE;",
        "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
        "CREATE TABLE companies (id INTEGER PRIMARY KEY, company_name TEXT NOT NULL);",
        "INSERT INTO companies (id, company_name) VALUES (1, 'Company A'), (2, 'Company B');",
        "CREATE TABLE archive_children (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL, FOREIGN KEY(parent_id) REFERENCES archive_parents(id));",
        "INSERT INTO archive_children (id, parent_id) VALUES (1, 7);",
        "CREATE TABLE archive_parents (id INTEGER PRIMARY KEY, label TEXT NOT NULL);",
        "INSERT INTO archive_parents (id, label) VALUES (7, 'Parent declared after child');",
        "CREATE TABLE discord_alert_poll_history (report_id TEXT PRIMARY KEY, payload TEXT NOT NULL);",
        "INSERT INTO discord_alert_poll_history VALUES ('poll-1', 'one'), ('poll-2', 'two');",
        "CREATE TABLE discord_alert_poll_health (owner_player_id TEXT PRIMARY KEY, status TEXT NOT NULL);",
        "INSERT INTO discord_alert_poll_health VALUES ('player-1', 'ok');",
    ]
    # Production has 17 historical ledger entries plus numbered migrations 0013-0037.
    for index in range(17):
        statements.append(
            "INSERT INTO d1_migrations (name) VALUES ('base_migration_%02d.sql');" % index
        )
    sql.write_text("\n".join(statements) + "\n", encoding="utf-8")

    for number in range(13, 40):
        if number == 13:
            body = "ALTER TABLE companies ADD COLUMN notes TEXT;"
        elif number == 14:
            body = (
                "CREATE TABLE migration_child (id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL, "
                "FOREIGN KEY(company_id) REFERENCES companies(id));"
            )
        elif number == 38:
            body = "CREATE TABLE global_company_rank_snapshot_meta_fixture (id INTEGER PRIMARY KEY);"
        elif number == 39:
            body = (
                "DROP TABLE IF EXISTS discord_alert_poll_history;\n"
                "DROP TABLE IF EXISTS discord_alert_poll_health;\n"
                "CREATE TABLE migration_test_39 (id INTEGER PRIMARY KEY);"
            )
        else:
            body = f"CREATE TABLE migration_test_{number} (id INTEGER PRIMARY KEY);"
        filename = f"{number:04d}_fixture.sql"
        (migrations / filename).write_text(body + "\n", encoding="utf-8")
        if number < 38:
            with sql.open("a", encoding="utf-8") as stream:
                stream.write(
                    "INSERT INTO d1_migrations (name) VALUES ('" + filename + "');\n"
                )

    original_sql = sql.read_text(encoding="utf-8")
    sql_hash = hashlib.sha256(sql.read_bytes()).hexdigest()

    result = module.replay_backup(sql, migrations, sql_hash)
    assert result["result"] == "success"
    assert result["starting_migration_count"] == 42
    assert result["final_migration_count"] == 44
    assert result["preserved_existing_tables"] == 3
    assert result["starting_application_row_count"] == 7
    assert result["retired_tables_dropped"] == [
        "discord_alert_poll_health",
        "discord_alert_poll_history",
    ]
    assert result["retired_rows_removed"] == 3
    assert result["foreign_key_violations"] == 0
    assert result["replayed_migrations"] == ["0038_fixture.sql", "0039_fixture.sql"]

    # A missing previously-applied migration must not be mistaken for a valid pending set.
    missing_prior_sql = original_sql.replace(
        "INSERT INTO d1_migrations (name) VALUES ('0037_fixture.sql');\n", ""
    )
    sql.write_text(missing_prior_sql, encoding="utf-8")
    missing_prior_hash = hashlib.sha256(sql.read_bytes()).hexdigest()
    try:
        module.replay_backup(sql, migrations, missing_prior_hash)
        raise AssertionError("Expected a missing prior migration to be rejected.")
    except RuntimeError as error:
        assert "missing previously applied migrations" in str(error)

    # Either target migration already being recorded makes the expected pending set invalid.
    sql.write_text(
        original_sql + "INSERT INTO d1_migrations (name) VALUES ('0038_fixture.sql');\n",
        encoding="utf-8",
    )
    already_applied_hash = hashlib.sha256(sql.read_bytes()).hexdigest()
    try:
        module.replay_backup(sql, migrations, already_applied_hash)
        raise AssertionError("Expected an already-applied target migration to be rejected.")
    except RuntimeError as error:
        assert "Expected only migrations 0038 and 0039 to be pending" in str(error)

    # Decreasing a retained company's row count is still forbidden during cleanup replay.
    sql.write_text(original_sql, encoding="utf-8")
    destructive = migrations / "0038_fixture.sql"
    original = destructive.read_text(encoding="utf-8")
    destructive.write_text(
        "DELETE FROM companies;\nCREATE TABLE global_company_rank_snapshot_meta_fixture (id INTEGER PRIMARY KEY);\n",
        encoding="utf-8",
    )
    try:
        module.replay_backup(sql, migrations, sql_hash)
        raise AssertionError("Expected a retained-table row-count decrease to be rejected.")
    except RuntimeError as error:
        assert "row counts decreased" in str(error)
    finally:
        destructive.write_text(original, encoding="utf-8")

    # A migration may not silently remove an unrelated restored table.
    sql.write_text(original_sql, encoding="utf-8")
    destructive_cleanup = migrations / "0039_fixture.sql"
    original_cleanup = destructive_cleanup.read_text(encoding="utf-8")
    destructive_cleanup.write_text(
        "DROP TABLE companies;\n"
        "DROP TABLE discord_alert_poll_history;\n"
        "DROP TABLE discord_alert_poll_health;\n",
        encoding="utf-8",
    )
    try:
        module.replay_backup(sql, migrations, sql_hash)
        raise AssertionError("Expected an unrelated table drop to be rejected.")
    except RuntimeError as error:
        assert "non-retired table" in str(error)
    finally:
        destructive_cleanup.write_text(original_cleanup, encoding="utf-8")

    try:
        module.replay_backup(sql, migrations, "0" * 64)
        raise AssertionError("Expected a checksum mismatch to be rejected.")
    except RuntimeError as error:
        assert "SHA-256 did not match" in str(error)

print(
    "PASS local production-backup migration replay harness: 42-entry ledger, exact pending migrations 0038-0039, "
    "explicit two-table retirement, retained-row preservation, integrity, foreign keys, and checksum guard."
)
