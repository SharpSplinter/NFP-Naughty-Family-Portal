#!/usr/bin/env python3
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
    report = root / "report.json"

    statements = [
        "PRAGMA defer_foreign_keys=TRUE;",
        "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
        "CREATE TABLE companies (id INTEGER PRIMARY KEY, company_name TEXT NOT NULL);",
        "INSERT INTO companies (id, company_name) VALUES (1, 'Company A'), (2, 'Company B');",
        "CREATE TABLE archive_children (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL, FOREIGN KEY(parent_id) REFERENCES archive_parents(id));",
        "INSERT INTO archive_children (id, parent_id) VALUES (1, 7);",
        "CREATE TABLE archive_parents (id INTEGER PRIMARY KEY, label TEXT NOT NULL);",
        "INSERT INTO archive_parents (id, label) VALUES (7, 'Parent declared after child');",
    ]
    for index in range(16):
        statements.append(
            "INSERT INTO d1_migrations (name) VALUES ('base_migration_%02d.sql');" % index
        )
    sql.write_text("\n".join(statements) + "\n", encoding="utf-8")
    sql_hash = hashlib.sha256(sql.read_bytes()).hexdigest()

    for number in range(13, 39):
        if number == 13:
            body = "ALTER TABLE companies ADD COLUMN notes TEXT;"
        elif number == 14:
            body = (
                "CREATE TABLE migration_child (id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL, "
                "FOREIGN KEY(company_id) REFERENCES companies(id));"
            )
        else:
            body = f"CREATE TABLE migration_test_{number} (id INTEGER PRIMARY KEY);"
        (migrations / f"{number:04d}_fixture.sql").write_text(body + "\n", encoding="utf-8")

    result = module.replay_backup(sql, migrations, sql_hash)
    assert result["result"] == "success"
    assert result["starting_migration_count"] == 16
    assert result["final_migration_count"] == 42
    assert result["preserved_existing_tables"] == 3
    assert result["starting_application_row_count"] == 4
    assert result["foreign_key_violations"] == 0
    assert len(result["replayed_migrations"]) == 26

    # A replay that removes restored company rows must fail preservation checks.
    destructive = migrations / "0014_fixture.sql"
    original = destructive.read_text(encoding="utf-8")
    destructive.write_text("DELETE FROM companies;\n", encoding="utf-8")
    try:
        module.replay_backup(sql, migrations, sql_hash)
        raise AssertionError("Expected a row-count decrease to be rejected.")
    except RuntimeError as error:
        assert "row counts decreased" in str(error)
    finally:
        destructive.write_text(original, encoding="utf-8")

    try:
        module.replay_backup(sql, migrations, "0" * 64)
        raise AssertionError("Expected a checksum mismatch to be rejected.")
    except RuntimeError as error:
        assert "SHA-256 did not match" in str(error)

print("PASS local production-backup migration replay harness: 25-migration ordering, ledger, integrity, foreign keys, row preservation, and checksum guard.")
