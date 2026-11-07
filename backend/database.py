"""Optional PostgreSQL readiness check; never connected by application startup."""

import argparse
import json
import os
from urllib.parse import parse_qs, urlsplit


class DatabaseError(Exception):
    """Sanitized error code; never includes driver messages or connection strings."""


def configuration_status():
    return {"database_url_present": bool(os.environ.get("DATABASE_URL", "").strip()),
            "rotated_credentials_confirmed": os.environ.get("DATABASE_CREDENTIALS_ROTATED", "").lower() == "true"}


def check_connection(*, approved=False):
    if not approved:
        raise DatabaseError("connection_not_approved")
    if not configuration_status()["rotated_credentials_confirmed"]:
        raise DatabaseError("rotated_credentials_not_confirmed")
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise DatabaseError("missing_database_url")
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in {"postgres", "postgresql"} or not all(
            [parsed.hostname, parsed.username, parsed.password, parsed.path.strip("/")]
        ):
            raise ValueError()
        sslmode = parse_qs(parsed.query).get("sslmode", ["require"])[-1]
        if sslmode not in {"require", "verify-ca", "verify-full"}:
            raise ValueError()
    except ValueError:
        raise DatabaseError("invalid_database_url") from None
    try:
        import psycopg
    except ImportError:
        raise DatabaseError("database_driver_unavailable") from None
    try:
        # Explicit keyword settings override URL options. This helper cannot
        # create tables and exposes no general-purpose query interface.
        with psycopg.connect(url, connect_timeout=5, sslmode=sslmode, autocommit=True,
                             options="-c default_transaction_read_only=on -c statement_timeout=5000") as conn:
            row = conn.execute("SELECT 1").fetchone()
            if row != (1,):
                raise DatabaseError("unexpected_database_response")
        return {"connected": True, "read_only_check": True}
    except psycopg.Error:
        raise DatabaseError("database_connection_failed") from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connect", action="store_true", help="Only after explicit approval and credential rotation")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(check_connection(approved=True) if args.connect else configuration_status()))
        return 0
    except DatabaseError as exc:
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
