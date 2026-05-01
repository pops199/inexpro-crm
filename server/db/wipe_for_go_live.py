"""
Wipe the Inexpro CRM database for go-live.

Preserves:
  - users                       (the people who can log in)
  - user_2fa                    (their 2FA enrollment)
  - user_dashboard_config       (per-user dashboard layouts)
  - user_view_preferences       (per-user list-view preferences)
  - system_settings             (SMTP, security toggles, templates etc.)
  - sqlite_*                    (SQLite internal tables)

Clears every other table (business data + audit log + notifications + OTPs).

Run AFTER stopping the Node server so the WAL is consolidated. The script
opens the DB read/write, truncates each non-preserved table, resets the
AUTOINCREMENT counters, then VACUUMs to reclaim space.
"""

import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), 'inexpro.db')

PRESERVE = {
    'users',
    'user_2fa',
    'user_dashboard_config',
    'user_view_preferences',
    'system_settings',
}

def main():
    if not os.path.exists(DB_PATH):
        print(f'! database not found at {DB_PATH}')
        sys.exit(1)

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    # Force any uncheckpointed WAL frames into the main DB so the wipe
    # is consistent regardless of how the server was last stopped.
    cur.execute("PRAGMA wal_checkpoint(TRUNCATE);")

    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    )
    all_tables = [r[0] for r in cur.fetchall()]
    targets = [t for t in all_tables if t not in PRESERVE]

    print('Tables found:', len(all_tables))
    print('Preserving  :', sorted(PRESERVE & set(all_tables)))
    print('Wiping      :', targets)
    print()

    # Defer foreign-key checks while we delete so we don't have to order rows.
    cur.execute('PRAGMA foreign_keys = OFF;')

    cleared = []
    for t in targets:
        try:
            before = cur.execute(f'SELECT COUNT(*) FROM "{t}";').fetchone()[0]
        except sqlite3.DatabaseError:
            before = '?'
        cur.execute(f'DELETE FROM "{t}";')
        cleared.append((t, before))

    # Reset AUTOINCREMENT counters so new IDs start at 1
    cur.execute("DELETE FROM sqlite_sequence WHERE name NOT IN ({});".format(
        ','.join('?' * len(PRESERVE))
    ), tuple(PRESERVE))

    cur.execute('PRAGMA foreign_keys = ON;')
    con.commit()

    # Reclaim space
    cur.execute('VACUUM;')

    print('Wiped:')
    for t, n in cleared:
        print(f'  {t:40s} {n} row(s) removed')

    # Final sanity check
    print()
    for t in sorted(PRESERVE):
        if t in all_tables:
            n = cur.execute(f'SELECT COUNT(*) FROM "{t}";').fetchone()[0]
            print(f'  preserved {t:38s} {n} row(s)')

    con.close()
    print()
    print('Done. Database is ready for go-live.')

if __name__ == '__main__':
    main()
