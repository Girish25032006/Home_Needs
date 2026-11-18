"""Home Needs grouped daily push-notification scheduler.
Run from the backend folder: python notification_scheduler.py
"""
import os
import time
import math
from datetime import date, datetime

import firebase_admin
from firebase_admin import credentials, messaging
from database import get_connection

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ACCOUNT_PATH = os.path.join(BASE_DIR, "firebase-service-account.json")

if not firebase_admin._apps:
    if not os.path.isfile(SERVICE_ACCOUNT_PATH):
        raise FileNotFoundError(
            "Place firebase-service-account.json inside the backend folder."
        )
    firebase_admin.initialize_app(credentials.Certificate(SERVICE_ACCOUNT_PATH))

print("Home Needs grouped notification scheduler started.")


def get_settings(cursor):
    cursor.execute("""
        SELECT expiry_reminder_days, low_stock_threshold,
               expiry_notifications_enabled, low_stock_notifications_enabled,
               TIME_FORMAT(reminder_time, '%H:%i') AS reminder_time
        FROM reminder_settings WHERE id = 1 LIMIT 1
    """)
    return cursor.fetchone()


def was_sent(cursor, product_id, notification_type, today):
    cursor.execute("""
        SELECT id FROM notification_history
        WHERE product_id=%s AND notification_type=%s AND notification_date=%s
        LIMIT 1
    """, (product_id, notification_type, today))
    return cursor.fetchone() is not None


def send_grouped_notification(cursor, connection, tokens, reminder_items, today):
    """Send one push with all due reminders, then record each included reminder."""
    if not reminder_items:
        print("No new reminders are due today.")
        return

    lines = ["Your household reminders for today:"]
    # Keep the push body within a reasonable length for notification display.
    max_items_in_message = 12
    for item in reminder_items[:max_items_in_message]:
        lines.append(f"• {item['message']}")

    remaining = len(reminder_items) - max_items_in_message
    if remaining > 0:
        lines.append(f"And {remaining} more reminder(s). Open Home Needs to view all.")

    body = "\n".join(lines)
    successful = 0
    for token in tokens:
        try:
            messaging.send(messaging.Message(
                notification=messaging.Notification(
                    title=f"Home Needs: Daily Reminders ({len(reminder_items)})",
                    body=body
                ),
                token=token
            ))
            successful += 1
        except Exception as error:
            print(f"Push failed for a registered device: {error}")

    if successful:
        for item in reminder_items:
            cursor.execute("""
                INSERT IGNORE INTO notification_history
                    (product_id, notification_type, notification_date)
                VALUES (%s, %s, %s)
            """, (item["product_id"], item["kind"], today))
        connection.commit()
        print(
            f"Sent one grouped notification containing {len(reminder_items)} reminder(s) "
            f"to {successful} device(s)."
        )
    else:
        print("No device accepted the grouped notification; reminders were not recorded.")


def run_reminder_check():
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        settings = get_settings(cursor)
        if not settings:
            print("No reminder_settings row with id=1. Save reminder settings in the app first.")
            return False

        now = datetime.now()
        today = date.today()
        scheduled_time = str(settings.get("reminder_time") or "08:00")[:5]
        if now.strftime("%H:%M") < scheduled_time:
            return False

        cursor.execute("SELECT fcm_token FROM notification_tokens")
        tokens = list(dict.fromkeys(
            row["fcm_token"] for row in cursor.fetchall()
            if row.get("fcm_token")
        ))
        if not tokens:
            print("No registered device tokens yet. Will check again shortly.")
            return False

        cursor.execute("""
            SELECT p.id AS product_id, p.product_name, p.quantity,
                   p.unit, p.expiry_date,
                   prs.expiry_reminder_days,
                   prs.low_stock_threshold,
                   prs.expiry_notifications_enabled AS product_expiry_enabled,
                   prs.low_stock_notifications_enabled AS product_low_enabled,
                   COALESCE(prs.expiry_reminder_days, %s) AS effective_expiry_days,
                   COALESCE(prs.low_stock_threshold, %s) AS effective_low_threshold,
                   COALESCE(prs.expiry_notifications_enabled, %s) AS effective_expiry_enabled,
                   COALESCE(prs.low_stock_notifications_enabled, %s) AS effective_low_enabled
            FROM products p
            LEFT JOIN product_reminder_settings prs ON prs.product_id=p.id
            ORDER BY p.product_name
        """, (
            settings["expiry_reminder_days"], settings["low_stock_threshold"],
            settings["expiry_notifications_enabled"], settings["low_stock_notifications_enabled"]
        ))
        products = cursor.fetchall()

        # Consumption history, using the same calculation as the app's AI predictions.
        cursor.execute("""
            SELECT p.id AS product_id,
                   COUNT(DISTINCT c.consumption_date) AS usage_days,
                   COALESCE(SUM(c.quantity_used), 0) AS total_consumed,
                   MIN(c.consumption_date) AS first_usage_date
            FROM products p
            LEFT JOIN consumption c ON p.id=c.product_id
            GROUP BY p.id
        """)
        usage_by_product = {row["product_id"]: row for row in cursor.fetchall()}

        reminders = []
        for product in products:
            pid = product["product_id"]
            name = product["product_name"]
            stock = float(product["quantity"] or 0)
            unit = product.get("unit") or ""

            expiry = product.get("expiry_date")
            expiry_days = int(product["effective_expiry_days"] or 0)
            if (settings["expiry_notifications_enabled"]
                    and product["effective_expiry_enabled"] and expiry):
                if isinstance(expiry, datetime):
                    expiry = expiry.date()
                if isinstance(expiry, date):
                    days_to_expiry = (expiry - today).days
                    if 0 <= days_to_expiry <= expiry_days:
                        if not was_sent(cursor, pid, "expiry", today):
                            if days_to_expiry == 0:
                                message = f"{name} expires today. Please check it."
                            else:
                                message = f"{name} expires in {days_to_expiry} day(s)."
                            reminders.append({"product_id": pid, "kind": "expiry", "message": message})

            threshold = float(product["effective_low_threshold"] or 0)
            if (settings["low_stock_notifications_enabled"]
                    and product["effective_low_enabled"] and stock <= threshold):
                if not was_sent(cursor, pid, "low_stock", today):
                    reminders.append({
                        "product_id": pid,
                        "kind": "low_stock",
                        "message": f"{name} is running low ({stock:g} {unit})."
                    })

            usage = usage_by_product.get(pid, {})
            first_usage = usage.get("first_usage_date")
            if isinstance(first_usage, datetime):
                first_usage = first_usage.date()
            usage_days = int(usage.get("usage_days") or 0)
            total = float(usage.get("total_consumed") or 0)
            if usage_days >= 2 and first_usage:
                days_recorded = (today - first_usage).days + 1
                if days_recorded > 0:
                    avg_daily = total / days_recorded
                    if avg_daily > 0:
                        days_remaining = math.ceil(stock / avg_daily)
                        if 0 <= days_remaining <= 7 and not was_sent(cursor, pid, "ai_stockout", today):
                            if days_remaining == 0:
                                message = f"AI predicts {name} may run out today."
                            else:
                                message = f"AI predicts {name} may run out in about {days_remaining} day(s)."
                            reminders.append({"product_id": pid, "kind": "ai_stockout", "message": message})

        send_grouped_notification(cursor, connection, tokens, reminders, today)
        return True

    except Exception as error:
        print("Scheduler check error:", error)
        if connection:
            connection.rollback()
        return False
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


if __name__ == "__main__":
    last_run_date = None
    while True:
        today_string = date.today().isoformat()
        if today_string != last_run_date:
            completed = run_reminder_check()
            if completed:
                last_run_date = today_string
        time.sleep(30)
