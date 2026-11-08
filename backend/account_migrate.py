"""Manual additive schema installation; never invoked by the app or Docker."""
import argparse
from pathlib import Path
from backend.services.accounts import connection


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--confirm-zero-cost-and-rotated-credentials', action='store_true')
    args = parser.parse_args()
    if not (args.apply and args.confirm_zero_cost_and_rotated_credentials):
        print('No database access. Review backend/migrations/001_account_progress.sql first.')
        return 2
    try:
        with connection() as conn:
            conn.execute(Path(__file__).with_name('migrations').joinpath('001_account_progress.sql').read_text(encoding='utf-8'))
    except Exception:
        print('Schema installation failed. No credentials or server details were logged. Check private configuration.')
        return 1
    print('Additive account schema installed. Existing unrelated tables were not modified.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
