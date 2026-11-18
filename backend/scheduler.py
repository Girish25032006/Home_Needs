"""
Home Needs - IST notification scheduler

Run this as a separate process from Flask:
    python scheduler.py

The computer must remain ON and connected to the internet.
"""

import logging
import time
from datetime import datetime, timedelta, timezone

from database import get_connection
from app import _ensure_user_reminder_settings, _generate_notifications_for_user

# Fixed Indian Standard Time (UTC+05:30); no timezone database required.
IST = timezone(timedelta(hours=5, minutes=30), name="IST")
CHECK_INTERVAL_SECONDS = 15

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)


def normalize_reminder_time(value):
    """Return a reminder TIME value as HH:MM, regardless of MySQL return type."""
    if value is None:
        return "08:00"

    if hasattr(value, "strftime"):
        return value.strftime("%H:%M")

    if isinstance(value, timedelta):
        total_seconds = int(value.total_seconds()) % (24 * 60 * 60)
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        return f"{hours:02d}:{minutes:02d}"

    text_value = str(value).strip()
    if len(text_value) >= 5:
        return text_value[:5]

    return "08:00"


def get_user_ids():
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users")
        rows = cursor.fetchall() or []
        return [row["id"] for row in rows]
    finally:
        cursor.close()
        connection.close()


def process_user_at_scheduled_time(user_id, current_hhmm):
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Ensure every user has their own settings row (default: 08:00 IST).
        settings = _ensure_user_reminder_settings(cursor, user_id)
        reminder_time = normalize_reminder_time(
            settings.get("reminder_time") if settings else None
        )

        if reminder_time != current_hhmm:
            connection.commit()
            return False

        created_count = _generate_notifications_for_user(cursor, user_id)
        connection.commit()

        logging.info(
            "User %s: scheduled check completed; %s new notification(s).",
            user_id,
            created_count,
        )
        return True

    except Exception:
        connection.rollback()
        logging.exception("Notification generation failed for user %s", user_id)
        return False

    finally:
        cursor.close()
        connection.close()


def run_scheduler():
    logging.info("Home Needs notification scheduler started (IST).")
    logging.info(
        "Checking user reminder times every %s seconds.",
        CHECK_INTERVAL_SECONDS,
    )

    # Prevent repeated execution for the same user on the same IST date.
    processed_today = set()

    while True:
        now_ist = datetime.now(IST)
        today_ist = now_ist.date()
        current_hhmm = now_ist.strftime("%H:%M")

        # Forget previous dates so the set remains small.
        processed_today = {
            item for item in processed_today if item[1] == today_ist
        }

        try:
            for user_id in get_user_ids():
                run_key = (str(user_id), today_ist)

                if run_key in processed_today:
                    continue

                did_run = process_user_at_scheduled_time(
                    user_id,
                    current_hhmm,
                )

                if did_run:
                    processed_today.add(run_key)

        except Exception:
            logging.exception("Scheduler cycle failed.")

        time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == "__main__":
    run_scheduler()
