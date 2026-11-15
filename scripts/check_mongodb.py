from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.database.store import MongoStore, store


def main() -> int:
    if not isinstance(store, MongoStore):
        print('MongoDB is unavailable. Set a valid MONGODB_URI in the project .env file.')
        return 1

    try:
        result = store.health_check(verify_write=True)
    except Exception as exc:
        print(
            'MongoDB health check failed '
            f'({type(exc).__name__}). Verify the Atlas URI, database permissions, and Network Access rules.'
        )
        return 1

    print('MongoDB connection: OK')
    print(f"Database selected: {result['database']}")
    print(f"users collection: {'OK' if result['users_collection'] else 'MISSING'}")
    print(f"unique email index: {'OK' if result['users_email_unique_index'] else 'MISSING'}")
    print(f"temporary read/write check: {'OK' if result['read_write'] else 'SKIPPED'}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
