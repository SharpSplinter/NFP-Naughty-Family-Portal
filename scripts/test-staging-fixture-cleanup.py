import json
import pathlib
import sqlite3
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts" / "staging-private-history-fixtures.mjs"
MIGRATIONS = ROOT / "migrations" / "auth"

def main():
    js = """import { buildFixtureCleanupStatements } from %s;
console.log(JSON.stringify(buildFixtureCleanupStatements({
  createdAt: "2026-11-17T03:59:00.000Z",
  discordLinkCode: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  deactivatePlayers: true
})));
""" % json.dumps(HELPER.as_uri())
    result = subprocess.run(
        ["node", "--input-type=module", "-e", js],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    cleanup = json.loads(result.stdout.strip().splitlines()[-1])

    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        db.executescript(migration.read_text(encoding="utf-8"))

    now = "2026-11-17T04:00:00.000Z"
    identities = [
        ("999999001", "Staging Private History Member"),
        ("999999002", "Staging Private History Other Member"),
        ("999999004", "Staging Private History Admin"),
        ("999999005", "Staging Feature Walkthrough Member"),
        ("999999006", "Staging Partial Archive Member"),
        ("999999007", "Staging First Login Consent Member"),
    ]
    for player_id, player_name in identities:
        db.execute(
            "INSERT INTO players (player_id, player_name, created_at, updated_at, faction_id, faction_verified_at) VALUES (?, ?, ?, ?, '8317', ?)",
            (player_id, player_name, now, now, now),
        )
    db.execute(
        "INSERT INTO players (player_id, player_name, created_at, updated_at, faction_id, faction_verified_at) VALUES ('888888888', 'Unrelated member', ?, ?, '8317', ?)",
        (now, now, now),
    )
    db.execute(
        "INSERT INTO api_keys (player_id, ciphertext, iv, last_four, created_at, updated_at) VALUES ('999999005', 'synthetic', 'iv', '4242', ?, ?)",
        (now, now),
    )
    db.execute(
        "INSERT INTO sessions (token_hash, player_id, expires_at, created_at) VALUES ('synthetic-session', '999999005', 9999999999, ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO companies (player_id, company_id, company_name, company_type, profile_json, employees_json, fetched_at) VALUES ('999999001', '999999003', 'fixture', 'type', '{}', '{}', ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO company_snapshots (player_id, company_id, profile_json, employees_json, fetched_at) VALUES ('999999001', '999999003', '{}', '{}', ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO company_financial_snapshots (player_id, company_id, stock_json, fetched_at) VALUES ('999999001', '999999003', '[]', ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO administrators (player_id, granted_by, granted_at) VALUES ('999999004', '999999004', ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO admin_audit_log (actor_player_id, actor_player_name, action, outcome, summary, created_at) VALUES ('999999005', 'fixture', 'test', 'succeeded', 'fixture audit', ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO admin_jobs (job_id, job_type, target_player_id, status, requested_by, created_at) VALUES ('fixture-job', 'test', '999999005', 'completed', '999999004', ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO discord_link_codes (code, owner_player_id, ciphertext, iv, expires_at) VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '999999005', 'x', 'y', ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO discord_account_links (owner_player_id, discord_user_id, alerts_enabled, linked_at, updated_at) VALUES ('999999005', '999999999999999999', 0, ?, ?)",
        (now, now),
    )

    def halloween_log(year, player_id, log_id):
        db.execute(
            "INSERT INTO halloween_event_logs (event_year, player_id, log_id, event_timestamp, labels_json, is_hit, log_json, collected_at) VALUES (?, ?, ?, 1, '[]', 0, '{}', ?)",
            (year, player_id, log_id, now),
        )
    halloween_log(2026, "999999005", "fixture-current")
    halloween_log(2025, "999999005", "fixture-prior-year")
    for index in range(2500):
        halloween_log(2026, "888888888", "unrelated-" + str(index))

    db.execute(
        "INSERT INTO halloween_live_snapshots (event_year, player_id, captured_at, upgrades_json, payload_json) VALUES (2026, '999999005', ?, '[]', '{}')",
        (now,),
    )
    db.execute(
        "INSERT INTO halloween_member_event_slots (event_year, player_id, start_minute_of_day, created_at, updated_at) VALUES (2026, '999999005', 720, ?, ?)",
        (now, now),
    )
    db.execute(
        "INSERT INTO halloween_collection_jobs (job_id, player_id, event_year, status, cursor_ts, created_at, updated_at) VALUES ('fixture-halloween', '999999005', 2026, 'complete', 0, ?, ?)",
        (now, now),
    )
    db.execute(
        "INSERT INTO halloween_attack_metrics_jobs (job_id, player_id, event_year, status, window_start_at, window_end_at, created_at, updated_at) VALUES ('fixture-attack', '999999005', 2026, 'complete', '2026-10-25T00:00:00Z', '2026-11-01T00:00:00Z', ?, ?)",
        (now, now),
    )
    db.execute(
        "INSERT INTO halloween_live_snapshot_jobs (job_id, event_year, player_id, snapshot_kind, bucket_start, status, created_at, updated_at) VALUES ('fixture-snapshot', 2026, '999999005', 'opening', 1, 'complete', ?, ?)",
        (now, now),
    )
    db.execute(
        "INSERT INTO event_history_consent_records (player_id, event_key, first_consented_at) VALUES ('999999005', 'halloween', ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO torn_event_calendar_cache (player_id, event_key, event_year, title, start_at, end_at, earliest_start_at, latest_end_at, fixed_start_time, fetched_at) VALUES ('999999005', 'halloween', 2026, 'fixture', ?, ?, ?, ?, 1, ?)",
        (now, now, now, now, now),
    )
    db.execute(
        "INSERT INTO christmas_town_collection_jobs (job_id, player_id, event_year, status, cursor_ts, window_start_at, window_end_at, created_at, updated_at) VALUES ('fixture-christmas', '999999005', 2025, 'complete', 1, '2025-12-01', '2026-01-01', ?, ?)",
        (now, now),
    )
    db.execute(
        "INSERT INTO christmas_town_event_logs (player_id, event_year, log_id, event_timestamp, log_json, collected_at) VALUES ('999999005', 2025, 'fixture-present', 1, '{}', ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO gym_training_historical_keys (player_id, last_four, access_level, last_validated_at, created_at, updated_at) VALUES ('999999005', '4242', 'Custom Access', ?, ?, ?)",
        (now, now, now),
    )
    db.execute(
        "INSERT INTO gym_training_collection_jobs (job_id, player_id, status, created_at, updated_at) VALUES ('fixture-gym', '999999005', 'complete', ?, ?)",
        (now, now),
    )
    db.execute(
        "INSERT INTO gym_training_event_logs (player_id, log_id, event_timestamp, log_json, collected_at) VALUES ('999999005', 'fixture-training', 1, '{}', ?)",
        (now,),
    )
    db.execute(
        "INSERT INTO event_history_consent_records (player_id, event_key, first_consented_at) VALUES ('999999005', 'christmas-town', ?)",
        (now,),
    )

    for statement in cleanup:
        if statement.lstrip().upper().startswith("PRAGMA"):
            continue
        details = " | ".join(row["detail"] for row in db.execute("EXPLAIN QUERY PLAN " + statement))
        if "SCAN " in details.upper():
            raise AssertionError("Cleanup plan contains a scan: " + statement + " => " + details)

    db.executescript("\\n".join(cleanup))
    def count(query):
        return db.execute(query).fetchone()[0]

    assert count("SELECT COUNT(*) FROM players WHERE player_id='999999005'") == 1
    assert db.execute("SELECT faction_id FROM players WHERE player_id='999999005'").fetchone()[0] is None
    assert count("SELECT COUNT(*) FROM api_keys WHERE player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM sessions WHERE player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM companies WHERE player_id='999999001'") == 0
    assert count("SELECT COUNT(*) FROM company_snapshots WHERE player_id='999999001'") == 0
    assert count("SELECT COUNT(*) FROM company_financial_snapshots WHERE player_id='999999001'") == 0
    assert count("SELECT COUNT(*) FROM halloween_event_logs WHERE player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM halloween_event_logs WHERE player_id='888888888'") == 2500
    assert count("SELECT COUNT(*) FROM halloween_live_snapshots WHERE player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM halloween_member_event_slots WHERE player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM halloween_collection_jobs WHERE player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM halloween_attack_metrics_jobs WHERE player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM halloween_live_snapshot_jobs WHERE player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM christmas_town_event_logs WHERE player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM gym_training_event_logs WHERE player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM discord_link_codes WHERE code='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'") == 0
    assert count("SELECT COUNT(*) FROM discord_account_links WHERE owner_player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM admin_audit_log WHERE actor_player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM admin_jobs WHERE target_player_id='999999005'") == 0
    assert count("SELECT COUNT(*) FROM players WHERE player_id='888888888'") == 1
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []

    metric_js = """import {
  parseWranglerD1Metrics, assertFixtureIdentityOutput, assertWranglerD1ReadBudget
} from %s;
const a = parseWranglerD1Metrics("Executed 8 queries (234 rows read, 78 rows written)");
if (a.rowsRead !== 234 || a.rowsWritten !== 78) throw new Error("text metric parser mismatch");
const b = parseWranglerD1Metrics(JSON.stringify([{ rows_read: 12, rows_written: 3 }]));
if (b.rowsRead !== 12 || b.rowsWritten !== 3) throw new Error("JSON metric parser mismatch");
assertFixtureIdentityOutput(JSON.stringify({ results: [{
  player_id: "999999005", player_name: "Staging Feature Walkthrough Member"
}] }));
let collision = false;
try {
  assertFixtureIdentityOutput(JSON.stringify({ results: [{
    player_id: "999999005", player_name: "Wrong identity"
  }] }));
} catch { collision = true; }
if (!collision) throw new Error("identity collision was accepted");
assertWranglerD1ReadBudget({ rowsRead: 9999 }, "test");
let over = false;
try { assertWranglerD1ReadBudget({ rowsRead: 10001 }, "test"); } catch { over = true; }
if (!over) throw new Error("read limit was not enforced");
console.log("PASS direct Wrangler counter parsing, identity collision guard and 10,000-row ceiling");
""" % json.dumps(HELPER.as_uri())
    parser = subprocess.run(
        ["node", "--input-type=module", "-e", metric_js],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    print(parser.stdout.strip())
    print("PASS indexed cleanup regression: real migration schema, 2,500 unrelated history rows preserved, reserved IDs deactivated and synthetic fixture rows removed.")
    db.close()

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("FAIL staging fixture cleanup regression: " + str(error), file=sys.stderr)
        raise
