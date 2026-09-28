"""Deletes stored sets that have no counted rep, plus the raw telemetry of sessions
that are left with no set at all.

Sets like these came from before POST /v1/sessions started refusing them (buttons
pressed twice in a row, testing without the sensor on). Dry run by default:

    python -m app.cleanup_empty_sets            # show what would be deleted
    python -m app.cleanup_empty_sets --apply    # delete it

Inside the production container: docker exec cyberpump-backend python -m app.cleanup_empty_sets
Reads MONGO_URI from the environment (same variable the API uses).
"""

import argparse
import os

from pymongo import MongoClient

EMPTY_SET = {"$or": [{"totalReps": {"$lte": 0}}, {"totalReps": {"$exists": False}}]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="actually delete (default: dry run)")
    args = parser.parse_args()

    uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017/cyberpump")
    db = MongoClient(uri, serverSelectionTimeoutMS=5000).get_default_database()

    empty_sets = list(db.session_results.find(EMPTY_SET, {"session_id": 1, "user_id": 1, "created_at": 1}))
    print(f"Database: {db.name}")
    print(f"Sets with no reps: {len(empty_sets)} of {db.session_results.count_documents({})}")
    for doc in empty_sets[:20]:
        print(f"  {doc['_id']}  user={doc.get('user_id')}  session={doc.get('session_id')}  at={doc.get('created_at')}")
    if len(empty_sets) > 20:
        print(f"  ... and {len(empty_sets) - 20} more")

    # Sessions whose every set is empty disappear entirely, so their telemetry goes too.
    touched = {doc["session_id"] for doc in empty_sets if doc.get("session_id")}
    empty_ids = [doc["_id"] for doc in empty_sets]
    emptied_sessions = [
        sid for sid in touched
        if db.session_results.count_documents({"session_id": sid, "_id": {"$nin": empty_ids}}) == 0
    ]
    telemetry_filter = {"session_id": {"$in": emptied_sessions}}
    telemetry_count = db.telemetry_samples.count_documents(telemetry_filter) if emptied_sessions else 0
    print(f"Sessions left with no set: {len(emptied_sessions)} -> telemetry samples: {telemetry_count}")

    if not args.apply:
        print("\nDry run, nothing deleted. Run again with --apply to delete.")
        return

    deleted_sets = db.session_results.delete_many({"_id": {"$in": empty_ids}}).deleted_count
    deleted_samples = (
        db.telemetry_samples.delete_many(telemetry_filter).deleted_count if emptied_sessions else 0
    )
    print(f"\nDeleted {deleted_sets} sets and {deleted_samples} telemetry samples.")


if __name__ == "__main__":
    main()
