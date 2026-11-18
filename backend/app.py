
from flask import Flask, request, jsonify, session
from datetime import date, timedelta, datetime, timezone

# Fixed Indian Standard Time (UTC+05:30); works on Windows without tzdata.
IST = timezone(timedelta(hours=5, minutes=30), name="IST")
import math
import json
from flask_cors import CORS
from database import get_connection
from cooking_prediction import cooking_prediction_bp
import os
import firebase_admin
from firebase_admin import credentials, messaging
from global_recipes import global_recipes_bp
from meal_planner import meal_planner_bp
app = Flask(__name__)


from ingredient_matching import (
    ingredient_key, canonical_ingredient_name, resolve_unique_product
)

@app.route('/ingredient-aliases', methods=['GET'])
def get_ingredient_aliases():
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            'SELECT id FROM users WHERE id = %s',
            (user_id,)
        )

        if not cursor.fetchone():
            return jsonify({'message': 'Unauthorized'}), 401

        alias_map = get_ingredient_alias_map(cursor)

        return jsonify({'aliases': alias_map}), 200

    except Exception as e:
        print('Ingredient aliases error:', e)
        return jsonify({'error': 'Unable to load ingredient aliases'}), 500

    finally:
        cursor.close()
        conn.close()

def get_ingredient_alias_map(cursor):
    """Load the admin-managed canonical names and aliases into normalized keys."""
    cursor.execute("SELECT canonical_name FROM ingredient_master")
    canonical_rows = cursor.fetchall() or []
    cursor.execute("""
        SELECT im.canonical_name, ia.alias_name
        FROM ingredient_aliases ia
        JOIN ingredient_master im ON im.id = ia.ingredient_id
    """)
    alias_rows = cursor.fetchall() or []
    mapping = {}
    for row in canonical_rows:
        name = row.get('canonical_name') if isinstance(row, dict) else row[0]
        key = ingredient_key(name)
        if key:
            mapping[key] = key
    for row in alias_rows:
        canonical = row.get('canonical_name') if isinstance(row, dict) else row[0]
        alias = row.get('alias_name') if isinstance(row, dict) else row[1]
        alias_key, canonical_key = ingredient_key(alias), ingredient_key(canonical)
        if alias_key and canonical_key:
            mapping[alias_key] = canonical_key
    return mapping


def auto_link_unmatched_recipe_ingredients(cursor, user_id):
    """
    Link previously-unmatched recipe ingredients to a unique product
    belonging to the same user. This only updates meal_ingredients.product_id;
    it never changes inventory quantities or transaction history.
    """
    alias_map = get_ingredient_alias_map(cursor)

    cursor.execute("""
        SELECT id, product_name
        FROM products
        WHERE user_id = %s
        ORDER BY id
    """, (user_id,))
    product_rows = cursor.fetchall() or []
    products = [
        {"id": row[0], "product_name": row[1]}
        for row in product_rows
    ]

    if not products:
        return 0

    cursor.execute("""
        SELECT mi.id, mi.meal_id, mi.ingredient_name
        FROM meal_ingredients mi
        INNER JOIN meals m ON m.id = mi.meal_id
        WHERE m.user_id = %s
          AND mi.product_id IS NULL
        ORDER BY mi.id
    """, (user_id,))
    ingredient_rows = cursor.fetchall() or []

    linked_count = 0
    for ingredient_id, meal_id, ingredient_name in ingredient_rows:
        matched_product = resolve_unique_product(
            ingredient_name,
            products,
            alias_map,
            name_key="product_name"
        )

        if not matched_product:
            continue

        cursor.execute("""
            UPDATE meal_ingredients mi
            INNER JOIN meals m ON m.id = mi.meal_id
            SET mi.product_id = %s
            WHERE mi.id = %s
              AND mi.meal_id = %s
              AND mi.product_id IS NULL
              AND m.user_id = %s
        """, (
            matched_product["id"],
            ingredient_id,
            meal_id,
            user_id
        ))
        linked_count += cursor.rowcount

    return linked_count

def require_admin(cursor, user_id):
    cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
    user = cursor.fetchone()
    return bool(user and str(user.get('role', '')).lower() == 'admin')

from auth import auth_bp

from dotenv import load_dotenv

load_dotenv()

app.secret_key = os.getenv("FLASK_SECRET_KEY")

if not app.secret_key:
    raise RuntimeError("FLASK_SECRET_KEY is not configured.")

# HTTPS is enabled for LAN testing so the session cookie is only sent
# over the secure frontend/backend connection.
app.config.update(
    SESSION_COOKIE_NAME="session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_PATH="/",
)

app.register_blueprint(auth_bp)
app.register_blueprint(global_recipes_bp)
app.register_blueprint(meal_planner_bp)
app.register_blueprint(cooking_prediction_bp)

CORS(
    app,
    supports_credentials=True,
    origins=[
        # Local development origins retained for existing workflows.
        "http://localhost:5173",
        "http://10.63.4.131:5173",
        "https://localhost",
        "http://localhost",
        # HTTPS origins used for Home Needs LAN testing.
        "https://localhost:5173",
        "https://10.63.4.131:5173",
        "https://home-needs.pages.dev",
        "capacitor://localhost"
    ]
)



@app.before_request
def log_incoming_post_requests():
    """Temporary diagnostic: show POST requests reaching this Flask process."""
    if request.method == "POST":
        print(
            "[REQUEST DEBUG]",
            request.method,
            request.path,
            "origin=",
            request.headers.get("Origin"),
            flush=True
        )


# -----------------------------------
# FIREBASE ADMIN SDK INITIALIZATION
# -----------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ACCOUNT_PATH = os.getenv(
    "FIREBASE_CREDENTIALS_PATH",
    os.path.join(BASE_DIR, "firebase-service-account.json")
)

if not firebase_admin._apps:
    if not os.path.isfile(SERVICE_ACCOUNT_PATH):
        raise FileNotFoundError(
            "Firebase service account file was not found. "
            "Place firebase-service-account.json inside the backend folder."
        )

    firebase_credentials = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(firebase_credentials)

print("Firebase Admin SDK initialized successfully.")


# -----------------------------------
# GET ALL PRODUCTS
# -----------------------------------

@app.route('/', methods=['GET'])
def home():

    user_id = session.get('user_id')

    if not user_id:
        return {
            "message": "Unauthorized"
        }, 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT *
            FROM products
            WHERE user_id = %s
              AND COALESCE(is_archived, 0) = 0
            ORDER BY id DESC
        """, (user_id,))

        products = cursor.fetchall()

        return products, 200

    except Exception as error:
        print("Get products error:", error)

        return {
            "message": "Failed to fetch products"
        }, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# GET PRODUCT USING BARCODE
# -----------------------------------

@app.route('/barcode-products/<barcode>', methods=['GET'])
def get_barcode_product(barcode):

    user_id = session.get('user_id')

    if not user_id:
        return {
            "message": "Unauthorized"
        }, 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        query = """
            SELECT *
            FROM products
            WHERE barcode = %s
              AND user_id = %s
            LIMIT 1
        """

        cursor.execute(query, (barcode, user_id))
        product = cursor.fetchone()

        if product:
            return product, 200

        return {
            "message": "Product not found"
        }, 404

    except Exception as error:
        print("Barcode product error:", error)

        return {
            "message": "Failed to fetch barcode product"
        }, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# ADD PRODUCT
# -----------------------------------

@app.route('/products', methods=['POST'])
def add_product():
    """Create a product and record its opening stock as its first REGULAR purchase."""
    print("🔥 UPDATED ADD_PRODUCT FUNCTION IS RUNNING", flush=True)
    user_id = session.get('user_id')
    if not user_id:
        return {"message": "Unauthorized"}, 401

    data = request.get_json(silent=True) or {}
    product_name = str(data.get('productName', '')).strip()
    quantity = data.get('quantity')
    unit = str(data.get('unit', '')).strip()
    print(
        "[ADD PRODUCT DEBUG]",
        {"productName": product_name, "quantity": quantity, "unit": unit,
         "received_keys": sorted(data.keys())},
        flush=True
    )

    if not product_name or quantity is None or not unit:
        return {"message": "Product name, quantity and unit are required"}, 400

    try:
        quantity = float(quantity)
        if not math.isfinite(quantity) or quantity <= 0:
            return {"message": "Quantity must be greater than zero"}, 400
    except (ValueError, TypeError):
        return {"message": "Invalid quantity"}, 400

    # The entered price is the total amount paid for the full quantity.
    entered_price = data.get('price')
    if entered_price in (None, ''):
        total_purchase_amount = None
        price_per_unit = None
    else:
        try:
            entered_price = float(entered_price)
            if not math.isfinite(entered_price) or entered_price < 0:
                return {"message": "Total purchase amount cannot be negative"}, 400
        except (ValueError, TypeError):
            return {"message": "Invalid total purchase amount"}, 400
        total_purchase_amount = round(entered_price, 2)
        price_per_unit = round(total_purchase_amount / quantity, 4)

    purchase_date = data.get('purchaseDate') or date.today().isoformat()
    expiry_date = data.get('expiryDate') or None
    category = str(data.get('category') or 'General').strip()
    barcode = data.get('barcode') or None

    connection = get_connection()
    cursor = connection.cursor()
    try:
        connection.start_transaction()

        # Create product and save opening stock.
        cursor.execute("""
            INSERT INTO products
            (product_name, category, quantity, unit, price, purchase_date,
             expiry_date, barcode, user_id, purchase_quantity, purchase_unit,
             total_purchase_amount, price_per_unit,
             initial_stock_quantity, initial_stock_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            product_name, category, quantity, unit, price_per_unit,
            purchase_date, expiry_date, barcode, user_id, quantity, unit,
            total_purchase_amount, price_per_unit, quantity, purchase_date
        ))
        product_id = cursor.lastrowid

        # Opening stock is a regular purchase and can be used for learning.
        cursor.execute("""
            INSERT INTO purchases
            (product_id, quantity, unit_price, total_price, purchase_date,
             expiry_date, user_id, stock_before_purchase, stock_after_purchase, purchase_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            product_id, quantity, price_per_unit, total_purchase_amount,
            purchase_date, expiry_date, user_id, 0, quantity, 'regular'
        ))

        # Link existing unmatched recipe ingredients to this user's
        # inventory where there is exactly one safe name/alias match.
        auto_linked_ingredients = auto_link_unmatched_recipe_ingredients(
            cursor, user_id
        )
        print(
            f"[INGREDIENT AUTO-LINK] Linked {auto_linked_ingredients} "
            f"existing recipe ingredient(s) for user {user_id}.",
            flush=True
        )

        connection.commit()
        return {
            "message": "Product added successfully",
            "id": product_id,
            "auto_linked_ingredients": auto_linked_ingredients,
            "purchase_quantity": quantity,
            "purchase_unit": unit,
            "total_purchase_amount": total_purchase_amount,
            "price_per_unit": price_per_unit,
            "purchase_type": "regular"
        }, 201

    except Exception as error:
        connection.rollback()
        print("Add product error:", error)
        return {"message": "Failed to add product"}, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# UPDATE PRODUCT
# -----------------------------------

@app.route('/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):

    user_id = session.get('user_id')

    if not user_id:
        return {
            "message": "Unauthorized"
        }, 401

    data = request.get_json(silent=True) or {}

    if not data:
        return {
            "message": "Product data is required"
        }, 400

    product_name = str(
        data.get('productName', '')
    ).strip()

    category = str(
        data.get('category', 'General')
    ).strip()

    quantity = data.get('quantity')
    unit = str(
        data.get('unit', '')
    ).strip()

    price = data.get('price')
    purchase_date = data.get('purchaseDate') or None
    expiry_date = data.get('expiryDate') or None
    barcode = data.get('barcode') or None

    # -------------------------------------------------
    # VALIDATION
    # -------------------------------------------------

    if not product_name:
        return {
            "message": "Product name is required"
        }, 400

    if quantity is None:
        return {
            "message": "Quantity is required"
        }, 400

    if not unit:
        return {
            "message": "Unit is required"
        }, 400

    try:
        quantity = float(quantity)

        if quantity < 0:
            return {
                "message": "Quantity cannot be negative"
            }, 400

    except (ValueError, TypeError):
        return {
            "message": "Invalid quantity"
        }, 400

    # Price is optional
    if price is not None and price != '':
        try:
            price = float(price)

            if price < 0:
                return {
                    "message": "Price cannot be negative"
                }, 400

        except (ValueError, TypeError):
            return {
                "message": "Invalid price"
            }, 400
    else:
        price = None

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # -------------------------------------------------
        # START TRANSACTION
        # -------------------------------------------------

        connection.start_transaction()

        # -------------------------------------------------
        # CHECK PRODUCT BELONGS TO LOGGED-IN USER
        # -------------------------------------------------

        cursor.execute("""
            SELECT
                id,
                product_name,
                category,
                quantity,
                unit,
                price,
                purchase_date,
                expiry_date,
                barcode
            FROM products
            WHERE id = %s
              AND user_id = %s
            FOR UPDATE
        """, (
            product_id,
            user_id
        ))

        existing_product = cursor.fetchone()

        if not existing_product:
            connection.rollback()

            return {
                "message":
                    "Product not found or does not belong to this user"
            }, 404

        # -------------------------------------------------
        # UPDATE PRODUCT
        # -------------------------------------------------

        cursor.execute("""
            UPDATE products
            SET
                product_name = %s,
                category = %s,
                quantity = %s,
                unit = %s,
                price = %s,
                purchase_date = %s,
                expiry_date = %s,
                barcode = %s
            WHERE id = %s
              AND user_id = %s
        """, (
            product_name,
            category,
            quantity,
            unit,
            price,
            purchase_date,
            expiry_date,
            barcode,
            product_id,
            user_id
        ))

        if cursor.rowcount == 0:
            connection.rollback()

            return {
                "message": "No changes were made to the product"
            }, 400

        # -------------------------------------------------
        # COMMIT
        # -------------------------------------------------

        connection.commit()

        return {
            "message": "Product updated successfully",
            "product": {
                "id": product_id,
                "product_name": product_name,
                "category": category,
                "quantity": quantity,
                "unit": unit,
                "price": price,
                "purchase_date": purchase_date,
                "expiry_date": expiry_date,
                "barcode": barcode
            }
        }, 200

    except Exception as error:

        # -------------------------------------------------
        # ROLLBACK IF ANYTHING FAILS
        # -------------------------------------------------

        connection.rollback()

        print(
            "Update product error:",
            error
        )

        return {
            "message": "Failed to update product",
            "error": str(error)
        }, 500

    finally:

        cursor.close()
        connection.close()


# -----------------------------------
# DELETE PRODUCT
# -----------------------------------

# -----------------------------------
# DELETE PRODUCT
# -----------------------------------

@app.route('/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):

    user_id = session.get('user_id')

    if not user_id:
        return {
            "message": "Unauthorized"
        }, 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Start transaction
        connection.start_transaction()

        # -------------------------------------------------
        # 1. Check that product belongs to logged-in user
        # -------------------------------------------------

        cursor.execute("""
            SELECT id, product_name
            FROM products
            WHERE id = %s
              AND user_id = %s
            FOR UPDATE
        """, (product_id, user_id))

        product = cursor.fetchone()

        if not product:
            connection.rollback()

            return {
                "message": "Product not found or does not belong to this user"
            }, 404

        # -------------------------------------------------
        # 2. Delete consumption records
        # -------------------------------------------------

        cursor.execute("""
            DELETE FROM consumption
            WHERE product_id = %s
              AND user_id = %s
        """, (product_id, user_id))

        deleted_consumption = cursor.rowcount

        # -------------------------------------------------
        # 3. Delete purchase history
        # -------------------------------------------------

        cursor.execute("""
            DELETE FROM purchases
            WHERE product_id = %s
              AND user_id = %s
        """, (product_id, user_id))

        deleted_purchases = cursor.rowcount

        # -------------------------------------------------
        # 4. Delete AI prediction history
        # -------------------------------------------------

        cursor.execute("""
            DELETE FROM ai_predictions
            WHERE product_id = %s
              AND user_id = %s
        """, (product_id, user_id))

        deleted_predictions = cursor.rowcount

        # -------------------------------------------------
        # 5. Delete shopping-list records
        # -------------------------------------------------

        cursor.execute("""
            DELETE FROM shopping_list
            WHERE product_id = %s
              AND user_id = %s
        """, (product_id, user_id))

        deleted_shopping_items = cursor.rowcount

        # -------------------------------------------------
        # 6. Delete product-specific reminder settings
        # -------------------------------------------------

        cursor.execute("""
            DELETE FROM product_reminder_settings
            WHERE product_id = %s
              AND user_id = %s
        """, (product_id, user_id))

        deleted_reminder_settings = cursor.rowcount

        # -------------------------------------------------
        # 7. Delete meal ingredient links for this product
        # -------------------------------------------------
        #
        # The meal itself is NOT deleted.
        # Only the connection between the meal and this
        # product is removed.
        #

        cursor.execute("""
            DELETE FROM meal_ingredients
            WHERE product_id = %s
        """, (product_id,))

        deleted_meal_ingredients = cursor.rowcount

        # -------------------------------------------------
        # 8. Finally delete the product itself
        # -------------------------------------------------

        cursor.execute("""
            DELETE FROM products
            WHERE id = %s
              AND user_id = %s
        """, (product_id, user_id))

        deleted_product = cursor.rowcount

        if deleted_product == 0:
            connection.rollback()

            return {
                "message": "Product could not be deleted"
            }, 404

        # -------------------------------------------------
        # 9. Commit everything together
        # -------------------------------------------------

        connection.commit()

        return {
            "message": "Product and all related records deleted successfully",
            "product_id": product_id,
            "product_name": product["product_name"],
            "deleted": {
                "product": deleted_product,
                "consumption": deleted_consumption,
                "purchases": deleted_purchases,
                "ai_predictions": deleted_predictions,
                "shopping_list": deleted_shopping_items,
                "product_reminder_settings": deleted_reminder_settings,
                "meal_ingredients": deleted_meal_ingredients
            }
        }, 200

    except Exception as error:

        # If anything fails, restore everything
        connection.rollback()

        print(
            "Delete product error:",
            error
        )

        return {
            "message": "Failed to delete product and related records",
            "error": str(error)
        }, 500

    finally:

        cursor.close()
        connection.close()


# -----------------------------------
# GET PURCHASE HISTORY
# -----------------------------------

@app.route('/purchases', methods=['GET'])
def get_purchases():

    user_id = session.get('user_id')

    if not user_id:
        return {
            "message": "Unauthorized"
        }, 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        query = """
            SELECT
                purchases.id,
                purchases.product_id,
                products.product_name,
                purchases.quantity,
                products.unit,
                purchases.unit_price,
                purchases.total_price,
                purchases.purchase_date,
                purchases.expiry_date,
                COALESCE(purchases.purchase_type, 'regular') AS purchase_type
            FROM purchases
            JOIN products
                ON purchases.product_id = products.id
            WHERE purchases.user_id = %s
              AND products.user_id = %s
            ORDER BY purchases.purchase_date DESC,
                     purchases.id DESC
        """

        cursor.execute(query, (user_id, user_id))
        purchases = cursor.fetchall()

        return purchases, 200

    except Exception as error:
        print("Get purchases error:", error)

        return {
            "message": "Failed to fetch purchase history"
        }, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# GET LATEST PRODUCT UNIT PRICES
# -----------------------------------


# -----------------------------------
# GET LATEST PRODUCT UNIT PRICES
# -----------------------------------

@app.route('/purchase-unit-prices', methods=['GET'])
def get_purchase_unit_prices():

    user_id = session.get('user_id')

    if not user_id:
        return {
            "message": "Unauthorized"
        }, 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        cursor.execute("""
            SELECT
                p.id AS product_id,
                p.product_name,
                p.unit,

                (
                    SELECT pu.unit_price
                    FROM purchases pu
                    WHERE pu.product_id = p.id
                      AND pu.user_id = %s
                      AND pu.unit_price IS NOT NULL
                      AND pu.unit_price > 0
                    ORDER BY
                        pu.purchase_date DESC,
                        pu.id DESC
                    LIMIT 1
                ) AS unit_price

            FROM products p

            WHERE p.user_id = %s

            ORDER BY p.product_name
        """, (user_id, user_id))

        prices = cursor.fetchall()

        return prices, 200

    except Exception as error:

        print(
            "Purchase unit prices error:",
            error
        )

        return {
            "message": "Failed to fetch product prices"
        }, 500

    finally:

        cursor.close()
        connection.close()
# -----------------------------------
# PREDICTION EVALUATION HELPER
# -----------------------------------

def _evaluate_pending_predictions_for_regular_purchase(cursor, product_id, user_id, purchase_date):
    """Evaluate every saved forecast that existed by the actual regular purchase date.

    A regular purchase is treated as the household's observed replenishment/run-out
    event. Additional purchases never evaluate forecasts. Forecasts created after
    the recorded purchase date are excluded to prevent look-ahead leakage.
    """
    from datetime import date, datetime

    if isinstance(purchase_date, datetime):
        purchase_day = purchase_date.date()
    elif isinstance(purchase_date, date):
        purchase_day = purchase_date
    else:
        purchase_day = date.fromisoformat(str(purchase_date)[:10])

    cursor.execute("""
        SELECT id, predicted_days_remaining, DATE(created_at) AS prediction_day
        FROM ai_predictions
        WHERE product_id = %s
          AND user_id = %s
          AND evaluated_at IS NULL
          AND predicted_days_remaining IS NOT NULL
          AND predicted_date IS NOT NULL
          AND DATE(created_at) <= %s
        ORDER BY created_at ASC, id ASC
    """, (product_id, user_id, purchase_day))
    pending = cursor.fetchall() or []
    evaluated = 0

    for row in pending:
        prediction_day = row.get('prediction_day')
        if isinstance(prediction_day, datetime):
            prediction_day = prediction_day.date()
        elif isinstance(prediction_day, str):
            prediction_day = date.fromisoformat(prediction_day[:10])
        if not prediction_day:
            continue

        actual_days = (purchase_day - prediction_day).days
        if actual_days < 0:
            continue
        predicted_days = int(row.get('predicted_days_remaining') or 0)
        absolute_error = abs(actual_days - predicted_days)

        cursor.execute("""
            UPDATE ai_predictions
            SET actual_days_remaining = %s,
                absolute_error = %s,
                evaluated_at = NOW()
            WHERE id = %s
              AND user_id = %s
              AND evaluated_at IS NULL
        """, (actual_days, absolute_error, row['id'], user_id))
        evaluated += cursor.rowcount

    return evaluated


# -----------------------------------
# ADD PURCHASE
# -----------------------------------

@app.route('/purchases', methods=['POST'])
def add_purchase():

    user_id = session.get('user_id')
    if not user_id:
        return {"message": "Unauthorized"}, 401

    data = request.get_json(silent=True) or {}
    if not data:
        return {"message": "Purchase data is required"}, 400

    product_name = str(data.get('productName') or '').strip()
    quantity = data.get('quantity')
    amount_paid = data.get('amountPaid')
    purchase_date = data.get('purchaseDate') or date.today().isoformat()
    expiry_date = data.get('expiryDate') or None
    purchase_type = str(data.get('purchase_type') or 'regular').strip().lower()
    confirm_discard_expired = data.get('confirm_discard_expired') is True

    try:
        parsed_purchase_date = date.fromisoformat(str(purchase_date))
        if parsed_purchase_date > date.today():
            return {"message": "Purchase date cannot be in the future"}, 400
        if expiry_date:
            parsed_expiry_date = date.fromisoformat(str(expiry_date))
            if parsed_expiry_date < parsed_purchase_date:
                return {"message": "Expiry date cannot be earlier than purchase date"}, 400
    except (TypeError, ValueError):
        return {"message": "Please provide valid purchase and expiry dates"}, 400

    if purchase_type not in ('regular', 'additional'):
        return {"message": "Purchase type must be regular or additional"}, 400
    if not product_name or quantity is None or amount_paid is None:
        return {"message": "Product name, quantity and amount paid are required"}, 400

    try:
        quantity = float(quantity)
        amount_paid = float(amount_paid)
        if not math.isfinite(quantity) or not math.isfinite(amount_paid) or quantity <= 0 or amount_paid < 0:
            return {"message": "Quantity must be greater than zero and amount cannot be negative"}, 400
    except (ValueError, TypeError):
        return {"message": "Invalid quantity or amount"}, 400

    unit_price = amount_paid / quantity
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        connection.start_transaction()
        cursor.execute("""
            SELECT id, product_name, quantity, unit, price, expiry_date
            FROM products
            WHERE LOWER(product_name) = LOWER(%s)
              AND user_id = %s
              AND COALESCE(is_archived, 0) = 0
            LIMIT 1
            FOR UPDATE
        """, (product_name, user_id))
        product = cursor.fetchone()

        if not product:
            connection.rollback()
            return {"message": "Product not found. Please add the product first."}, 404

        product_id = product['id']
        current_stock = float(product.get('quantity') or 0)
        current_expiry = product.get('expiry_date')
        if isinstance(current_expiry, datetime):
            current_expiry = current_expiry.date()
        is_expired_stock = bool(current_expiry and current_expiry < date.today() and current_stock > 0)

        # First request only asks for confirmation. No stock/history is changed.
        if is_expired_stock and not confirm_discard_expired:
            connection.rollback()
            return {
                "code": "EXPIRED_STOCK_CONFIRMATION_REQUIRED",
                "expired_stock": True,
                "product_id": product_id,
                "product_name": product['product_name'],
                "quantity": current_stock,
                "unit": product['unit'],
                "expiry_date": current_expiry.isoformat() if hasattr(current_expiry, 'isoformat') else str(current_expiry),
                "message": "This product has expired stock. Confirm discarding the expired quantity before adding the new purchase."
            }, 409

        # If confirmed, record the full expired quantity as wastage and clear old stock.
        if is_expired_stock and confirm_discard_expired:
            stock_before = current_stock
            cursor.execute("""
                INSERT INTO inventory_wastage
                (product_id, user_id, product_name, quantity_wasted, unit,
                 discard_date, reason, stock_before, stock_after)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                product_id, user_id, product['product_name'], stock_before,
                product['unit'], date.today(),
                f"Expired stock discarded before new purchase (expiry date: {current_expiry})",
                stock_before, 0
            ))
            cursor.execute("""
                UPDATE products
                SET quantity = 0, expiry_date = NULL
                WHERE id = %s AND user_id = %s
            """, (product_id, user_id))
            current_stock = 0

        cursor.execute("""
            INSERT INTO purchases
            (product_id, quantity, unit_price, total_price, purchase_date,
             expiry_date, user_id, purchase_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            product_id, quantity, unit_price, amount_paid, parsed_purchase_date,
            expiry_date, user_id, purchase_type
        ))
        purchase_id = cursor.lastrowid

        evaluated_predictions = 0
        if purchase_type == 'regular':
            evaluated_predictions = _evaluate_pending_predictions_for_regular_purchase(
                cursor, product_id, user_id, parsed_purchase_date
            )

        # A blank expiry date is allowed. If old stock remains, preserve its date;
        # if old stock was fully discarded/zero, blank expiry clears the old date.
        cursor.execute("""
            UPDATE products
            SET expiry_date = CASE
                    WHEN %s = 1 THEN %s
                    WHEN quantity <= 0 THEN %s
                    ELSE COALESCE(%s, expiry_date)
                END,
                quantity = quantity + %s,
                price = %s,
                purchase_date = %s
            WHERE id = %s AND user_id = %s
        """, (
            1 if is_expired_stock and confirm_discard_expired else 0,
            expiry_date, expiry_date, expiry_date,
            quantity, unit_price, parsed_purchase_date, product_id, user_id
        ))

        connection.commit()
        return {
            "message": "Purchase saved successfully",
            "id": purchase_id,
            "unit_price": unit_price,
            "purchase_type": purchase_type,
            "evaluated_predictions": evaluated_predictions,
            "expired_stock_discarded": bool(is_expired_stock and confirm_discard_expired)
        }, 201

    except Exception as error:
        connection.rollback()
        print("Error saving purchase:", error)
        return {"message": "Failed to save purchase"}, 500
    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# GET CONSUMPTION HISTORY
# -----------------------------------


@app.route('/consumption', methods=['GET'])
def get_consumption():

    user_id = session.get('user_id')

    if not user_id:
        return {
            "message": "Unauthorized"
        }, 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        query = """
            SELECT
                consumption.id,
                consumption.product_id,
                products.product_name,
                consumption.quantity_used AS quantity,
                products.unit AS unit,
                consumption.consumption_date AS usage_date
            FROM consumption
            JOIN products
                ON consumption.product_id = products.id
            WHERE consumption.user_id = %s
              AND products.user_id = %s
            ORDER BY consumption.consumption_date DESC,
                     consumption.id DESC
        """

        cursor.execute(query, (user_id, user_id))
        consumptions = cursor.fetchall()

        return consumptions, 200

    except Exception as error:
        print("Error fetching consumption:", error)

        return {
            "message": "Failed to fetch consumption history"
        }, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# ADD CONSUMPTION
# -----------------------------------


@app.route('/consumption', methods=['POST'])
def add_consumption():
    user_id = session.get('user_id')
    if not user_id:
        return {"message": "Unauthorized"}, 401

    data = request.get_json(silent=True) or {}
    product_name = str(data.get('productName') or '').strip()
    quantity = data.get('quantity')
    unit = str(data.get('unit') or '').strip()
    usage_date = data.get('usageDate') or date.today().isoformat()
    expired_exception_confirmed = data.get('expired_exception_confirmed') is True
    exception_reason = str(data.get('exception_reason') or '').strip()

    if not product_name or quantity is None or not unit:
        return {"message": "Product, quantity and unit are required"}, 400
    try:
        quantity = float(quantity)
        if not math.isfinite(quantity) or quantity <= 0:
            return {"message": "Quantity must be greater than zero"}, 400
        datetime.strptime(str(usage_date), "%Y-%m-%d")
    except (ValueError, TypeError):
        return {"message": "Invalid quantity or usage date"}, 400

    if expired_exception_confirmed and not exception_reason:
        return {"message": "A reason is required for an expired-item exception"}, 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        connection.start_transaction()
        cursor.execute("""
            SELECT id, quantity, unit, expiry_date
            FROM products
            WHERE LOWER(product_name) = LOWER(%s)
              AND user_id = %s
              AND COALESCE(is_archived, 0) = 0
            LIMIT 1
            FOR UPDATE
        """, (product_name, user_id))
        product = cursor.fetchone()
        if not product:
            connection.rollback()
            return {"message": "Active product not found"}, 404

        product_id = product['id']
        available_quantity = float(product['quantity'] or 0)
        expiry_value = product.get('expiry_date')
        is_expired = bool(expiry_value and expiry_value < date.today())

        if str(product['unit']).lower() != unit.lower():
            connection.rollback()
            return {"message": f"Please select the correct unit: {product['unit']}"}, 400
        if is_expired and not expired_exception_confirmed:
            connection.rollback()
            return {
                "message": "This product is past its recorded expiry date. Normal consumption is blocked. Discarding is the safer option. To record an exception, explicitly confirm it and provide a reason.",
                "expired": True
            }, 409
        if not is_expired and expired_exception_confirmed:
            connection.rollback()
            return {"message": "Expired-item exception can only be recorded for a product whose expiry date has passed."}, 400
        if quantity > available_quantity:
            connection.rollback()
            return {"message": f"Only {available_quantity:g} {product['unit']} available in stock"}, 400

        remaining_quantity = available_quantity - quantity
        cursor.execute("""
            INSERT INTO consumption
            (product_id, quantity_used, consumption_date, user_id,
             stock_before_consumption, stock_after_consumption, recorded_at,
             is_expired_exception, exception_reason)
            VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s, %s)
        """, (product_id, quantity, usage_date, user_id,
              available_quantity, remaining_quantity,
              1 if is_expired else 0, exception_reason if is_expired else None))
        consumption_id = cursor.lastrowid
        cursor.execute("""
            UPDATE products SET quantity = %s
            WHERE id = %s AND user_id = %s
        """, (remaining_quantity, product_id, user_id))
        connection.commit()
        return {
            "message": "Expired-item exception recorded" if is_expired else "Consumption recorded successfully",
            "id": consumption_id,
            "remainingQuantity": remaining_quantity,
            "is_expired_exception": bool(is_expired)
        }, 201
    except Exception as error:
        connection.rollback()
        print("Error recording consumption:", error)
        return {"message": "Failed to record consumption", "error": str(error)}, 500
    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# EXPIRY TRACKING APIs
# -----------------------------------

@app.route('/expiry/update/<int:product_id>', methods=['PUT'])
def update_expiry_date(product_id):
    user_id = session.get('user_id')
    if not user_id:
        return {"message": "Unauthorized"}, 401

    data = request.get_json(silent=True) or {}
    expiry_date = data.get('expiry_date') or data.get('expiryDate')
    if not expiry_date:
        return {"message": "Expiry date is required"}, 400

    try:
        parsed_expiry = datetime.strptime(str(expiry_date), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return {"message": "Expiry date must use YYYY-MM-DD format"}, 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id, purchase_date
            FROM products
            WHERE id = %s AND user_id = %s
              AND COALESCE(is_archived, 0) = 0
            LIMIT 1
        """, (product_id, user_id))
        product = cursor.fetchone()
        if not product:
            return {"message": "Product not found"}, 404

        purchase_date = product.get('purchase_date')
        if isinstance(purchase_date, datetime):
            purchase_date = purchase_date.date()
        if isinstance(purchase_date, date) and parsed_expiry < purchase_date:
            return {"message": "Expiry date cannot be earlier than purchase date"}, 400

        cursor.execute("""
            UPDATE products SET expiry_date = %s
            WHERE id = %s AND user_id = %s
        """, (parsed_expiry, product_id, user_id))
        connection.commit()
        return {"message": "Expiry date updated successfully",
                "product_id": product_id, "expiry_date": parsed_expiry.isoformat()}, 200
    except Exception as error:
        connection.rollback()
        print("Update expiry date error:", error)
        return {"message": "Failed to update expiry date"}, 500
    finally:
        cursor.close()
        connection.close()


@app.route('/expiry/discard', methods=['POST'])
def discard_expired_stock():
    user_id = session.get('user_id')
    if not user_id:
        return {"message": "Unauthorized"}, 401

    data = request.get_json(silent=True) or {}
    product_id = data.get('product_id') or data.get('productId')
    quantity = data.get('quantity')
    reason = str(data.get('reason') or 'Expired').strip()[:255]

    try:
        product_id = int(product_id)
        quantity = float(quantity)
        if product_id <= 0 or not math.isfinite(quantity) or quantity <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return {"message": "Valid product_id and positive quantity are required"}, 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        connection.start_transaction()
        cursor.execute("""
            SELECT id, product_name, quantity, unit
            FROM products
            WHERE id = %s AND user_id = %s
              AND COALESCE(is_archived, 0) = 0
            FOR UPDATE
        """, (product_id, user_id))
        product = cursor.fetchone()
        if not product:
            connection.rollback()
            return {"message": "Product not found"}, 404

        stock_before = float(product['quantity'] or 0)
        if quantity > stock_before:
            connection.rollback()
            return {"message": f"Only {stock_before:g} {product['unit']} available"}, 400

        stock_after = stock_before - quantity
        cursor.execute("""
            INSERT INTO inventory_wastage
            (product_id, user_id, product_name, quantity_wasted, unit,
             discard_date, reason, stock_before, stock_after)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (product_id, user_id, product['product_name'], quantity,
              product['unit'], date.today(), reason, stock_before, stock_after))
        wastage_id = cursor.lastrowid

        cursor.execute("""
            UPDATE products SET quantity = %s
            WHERE id = %s AND user_id = %s
        """, (stock_after, product_id, user_id))
        connection.commit()
        return {"message": "Discarded stock recorded successfully",
                "wastage_id": wastage_id, "remaining_quantity": stock_after}, 201
    except Exception as error:
        connection.rollback()
        print("Discard expired stock error:", error)
        return {"message": "Failed to record discarded stock"}, 500
    finally:
        cursor.close()
        connection.close()


@app.route('/expiry/archive/<int:product_id>', methods=['POST'])
def archive_expiry_product(product_id):
    user_id = session.get('user_id')
    if not user_id:
        return {"message": "Unauthorized"}, 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        connection.start_transaction()
        cursor.execute("""
            SELECT id, quantity FROM products
            WHERE id = %s AND user_id = %s
              AND COALESCE(is_archived, 0) = 0
            FOR UPDATE
        """, (product_id, user_id))
        product = cursor.fetchone()
        if not product:
            connection.rollback()
            return {"message": "Product not found or already archived"}, 404
        if float(product['quantity'] or 0) > 0:
            connection.rollback()
            return {"message": "Record or consume the remaining stock before archiving"}, 400

        cursor.execute("""
            UPDATE products SET is_archived = 1, archived_at = NOW()
            WHERE id = %s AND user_id = %s
        """, (product_id, user_id))
        connection.commit()
        return {"message": "Product archived successfully"}, 200
    except Exception as error:
        connection.rollback()
        print("Archive product error:", error)
        return {"message": "Failed to archive product"}, 500
    finally:
        cursor.close()
        connection.close()


@app.route('/expiry/wastage', methods=['GET'])
def get_expiry_wastage():
    user_id = session.get('user_id')
    if not user_id:
        return {"message": "Unauthorized"}, 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id, product_id, product_name, quantity_wasted, unit,
                   discard_date, reason, stock_before, stock_after, created_at
            FROM inventory_wastage
            WHERE user_id = %s
            ORDER BY discard_date DESC, id DESC
        """, (user_id,))
        rows = cursor.fetchall() or []
        for row in rows:
            for key in ('discard_date', 'created_at'):
                if row.get(key):
                    row[key] = row[key].isoformat()
        return rows, 200
    except Exception as error:
        print("Get expiry wastage error:", error)
        return {"message": "Failed to fetch wastage history"}, 500
    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# AI PREDICTION API — corrected and consistent implementation
# -----------------------------------


def _build_product_prediction(cursor, product, user_id, today=None):
    """Generate a per-user, per-product consumption prediction.

    Random Forest Regression is trained from completed intervals between
    REGULAR purchases only. Each interval's target is the estimated daily
    usage (quantity bought at the start of the interval / days until the next
    regular purchase). Features use the purchase quantity, calendar fields,
    and only earlier completed interval statistics (no future information).

    Additional purchases are excluded from training. Consumption records are
    not used as training observations. For estimated-stock reconstruction,
    manual consumption replaces AI-estimated usage on the same calendar day.

    When there are too few completed intervals for a meaningful model, the
    existing weighted interval-rate calculation is returned as an explicit
    statistical fallback. This avoids pretending a tiny dataset is a trained
    and reliable Random Forest model.
    """
    from datetime import date, datetime, timedelta
    import math
    import statistics

    today = today or date.today()
    product_id = product["product_id"]
    actual_stock = max(0.0, float(product.get("current_stock") or 0))

    result = {
        "product_id": product_id,
        "product_name": product.get("product_name") or "Product",
        "current_stock": round(actual_stock, 3),
        "actual_stock": round(actual_stock, 3),
        "estimated_stock": round(actual_stock, 3),
        "unit": product.get("unit") or "",
        "average_daily_consumption": 0.0,
        "days_remaining": None,
        "predicted_date": None,
        "status": "Insufficient data",
        "model_type": "insufficient_data",
        "training_days": 0,
        "positive_usage_days": 0,
        "training_samples": 0,
        "last_usage_date": None,
        "model_note": "Add more regular purchases to build a reliable prediction.",
    }

    # Only this logged-in user's REGULAR purchases are learning observations.
    # Additional purchases never enter this query.
    cursor.execute("""
        SELECT purchase_date, SUM(quantity) AS regular_quantity
        FROM purchases
        WHERE product_id = %s
          AND user_id = %s
          AND COALESCE(LOWER(purchase_type), 'regular') = 'regular'
          AND purchase_date <= %s
        GROUP BY purchase_date
        ORDER BY purchase_date ASC
    """, (product_id, user_id, today))

    purchase_rows = cursor.fetchall() or []
    regular_purchases = []

    for row in purchase_rows:
        purchase_day = row.get("purchase_date")
        if isinstance(purchase_day, datetime):
            purchase_day = purchase_day.date()
        elif isinstance(purchase_day, str):
            try:
                purchase_day = date.fromisoformat(purchase_day[:10])
            except ValueError:
                continue

        if purchase_day:
            try:
                quantity = max(0.0, float(row.get("regular_quantity") or 0))
            except (TypeError, ValueError):
                quantity = 0.0
            regular_purchases.append((purchase_day, quantity))

    if len(regular_purchases) < 2:
        result["last_usage_date"] = (
            regular_purchases[-1][0].isoformat() if regular_purchases else None
        )
        return result

    # Build completed interval observations. The target for each interval is
    # the daily rate inferred from its opening regular purchase quantity.
    intervals = []
    for index in range(len(regular_purchases) - 1):
        start_day, opening_quantity = regular_purchases[index]
        next_day, _ = regular_purchases[index + 1]
        elapsed_days = (next_day - start_day).days
        if elapsed_days <= 0 or opening_quantity <= 0:
            continue
        intervals.append({
            "start": start_day,
            "days": elapsed_days,
            "quantity": opening_quantity,
            "rate": opening_quantity / elapsed_days,
        })

    if not intervals:
        result["last_usage_date"] = regular_purchases[-1][0].isoformat()
        return result

    # Baseline is retained for cold-start products and is also the safety
    # fallback if sklearn is unavailable or the trained model gives an invalid
    # result. Weighted by interval duration, matching the previous behaviour.
    total_quantity = sum(item["quantity"] for item in intervals)
    total_days = sum(item["days"] for item in intervals)
    baseline_daily = total_quantity / total_days if total_days > 0 else 0.0

    def make_features(purchase, previous_intervals):
        purchase_day, purchase_quantity = purchase
        previous_rates = [item["rate"] for item in previous_intervals]
        previous_days = [item["days"] for item in previous_intervals]
        features = [
            float(purchase_quantity),
            float(purchase_day.month),
            float(purchase_day.weekday()),
        ]
        # Recent historical rates/durations are lag features. Missing history
        # is zero-padded so training and prediction use the same feature shape.
        for lag in range(1, 4):
            features.append(float(previous_rates[-lag]) if len(previous_rates) >= lag else 0.0)
        for lag in range(1, 4):
            features.append(float(previous_days[-lag]) if len(previous_days) >= lag else 0.0)
        features.append(float(statistics.mean(previous_rates)) if previous_rates else 0.0)
        features.append(float(statistics.pstdev(previous_rates)) if len(previous_rates) > 1 else 0.0)
        return features

    X_train = []
    y_train = []
    valid_intervals = []
    # For each completed interval, features are known at its start; its rate
    # is the target observed only after the next regular purchase.
    for index, interval in enumerate(intervals):
        purchase = (interval["start"], interval["quantity"])
        previous = intervals[:index]
        X_train.append(make_features(purchase, previous))
        y_train.append(float(interval["rate"]))
        valid_intervals.append(interval)

    predicted_daily = baseline_daily
    model_type = "statistical_fallback"
    model_note = (
        "Using the existing regular-purchase statistical baseline until "
        "enough purchase history is available for Random Forest training."
    )

    # A minimum of 5 completed interval observations is required. For a
    # stronger family-specific model, more history (10+ intervals) is better.
    minimum_training_samples = 5
    if len(X_train) >= minimum_training_samples:
        try:
            from sklearn.ensemble import RandomForestRegressor

            latest_purchase = regular_purchases[-1]
            latest_features = make_features(latest_purchase, intervals)
            model = RandomForestRegressor(
                n_estimators=200,
                max_depth=5,
                min_samples_leaf=2,
                random_state=42,
                n_jobs=-1,
            )
            model.fit(X_train, y_train)
            rf_prediction = float(model.predict([latest_features])[0])

            if math.isfinite(rf_prediction) and rf_prediction > 0:
                predicted_daily = rf_prediction
                model_type = "random_forest_regression"
                model_note = (
                    "Random Forest trained on this user's regular-purchase "
                    "history for this product. Additional purchases and "
                    "consumption transactions were excluded from training."
                )
            else:
                model_note = "Random Forest returned an invalid rate; statistical baseline used."
        except ImportError:
            model_note = "scikit-learn is not installed; statistical baseline used. Install scikit-learn to enable Random Forest."
        except Exception as error:
            print("Random Forest prediction error:", error)
            model_note = "Random Forest training failed; statistical baseline used. Check backend logs."

    if not math.isfinite(predicted_daily) or predicted_daily <= 0:
        result.update({
            "status": "Insufficient data",
            "model_type": "insufficient_data",
            "last_usage_date": regular_purchases[-1][0].isoformat(),
        })
        return result

    # Rebuild estimated stock chronologically from dated purchases and usage.
    # OPTION A: manual consumption REPLACES AI-estimated consumption on that
    # calendar date. If manual consumption exists, subtract only that recorded
    # amount. If there is no manual record, subtract the AI daily estimate.
    # Purchases (regular + additional) are still added on their recorded date.
    # The ledger is rebuilt from history, so refreshing this API never applies
    # a second deduction to the same date.
    cursor.execute("""
        SELECT purchase_date AS event_date, quantity AS amount, 'purchase' AS event_type
        FROM purchases
        WHERE product_id = %s
          AND user_id = %s
          AND purchase_date <= %s

        UNION ALL

        SELECT consumption_date AS event_date, quantity_used AS amount, 'consumption' AS event_type
        FROM consumption
        WHERE product_id = %s
          AND user_id = %s
          AND consumption_date <= %s

        ORDER BY event_date ASC
    """, (product_id, user_id, today, product_id, user_id, today))
    stock_events = cursor.fetchall() or []

    purchases_by_day = {}
    manual_consumption_by_day = {}
    first_purchase_day = None

    for event in stock_events:
        event_day = event.get("event_date")
        if isinstance(event_day, datetime):
            event_day = event_day.date()
        elif isinstance(event_day, str):
            try:
                event_day = date.fromisoformat(event_day[:10])
            except ValueError:
                continue
        if not event_day:
            continue

        try:
            amount = max(0.0, float(event.get("amount") or 0))
        except (TypeError, ValueError):
            amount = 0.0

        if event.get("event_type") == "purchase":
            purchases_by_day[event_day] = purchases_by_day.get(event_day, 0.0) + amount
            if first_purchase_day is None or event_day < first_purchase_day:
                first_purchase_day = event_day
        else:
            manual_consumption_by_day[event_day] = (
                manual_consumption_by_day.get(event_day, 0.0) + amount
            )

    if first_purchase_day is not None:
        estimated_stock = purchases_by_day.get(first_purchase_day, 0.0)
        # If consumption was manually recorded on the opening-purchase date,
        # subtract that actual amount. The opening date has no AI deduction.
        opening_manual = manual_consumption_by_day.get(first_purchase_day, 0.0)
        if opening_manual > 0:
            estimated_stock = max(0.0, estimated_stock - opening_manual)
        current_day = first_purchase_day

        # The first purchase establishes opening stock. For every following
        # calendar day, use exactly one consumption source:
        #   - manual amount, when one or more manual records exist that day;
        #   - otherwise the AI-estimated daily amount.
        # Add purchases made on that date as a separate stock event.
        while current_day < today:
            current_day += timedelta(days=1)

            # Add purchases first so same-day consumption can use stock bought
            # on that date, matching the existing transaction ordering.
            estimated_stock += purchases_by_day.get(current_day, 0.0)

            manual_amount = manual_consumption_by_day.get(current_day, 0.0)

            if manual_amount > 0:
                # A manual record is the actual usage for this date; do not
                # also deduct the AI estimate.
                daily_consumption = manual_amount
            else:
                # No manual entry exists, so use the AI-estimated usage.
                daily_consumption = predicted_daily

            estimated_stock = max(0.0, estimated_stock - daily_consumption)

        estimated_stock = round(max(0.0, estimated_stock), 3)
    else:
        # Older products without purchase history retain their real DB stock.
        estimated_stock = round(actual_stock, 3)

    days_remaining = (
        math.ceil(estimated_stock / predicted_daily)
        if estimated_stock > 0 else 0
    )
    predicted_date = today + timedelta(days=days_remaining)

    result.update({
        "current_stock": estimated_stock,
        "actual_stock": round(actual_stock, 3),
        "estimated_stock": estimated_stock,
        "average_daily_consumption": round(predicted_daily, 3),
        "days_remaining": days_remaining,
        "predicted_date": predicted_date.isoformat(),
        "status": "Available" if estimated_stock > 0 else "Out of stock",
        "model_type": model_type,
        "training_days": total_days,
        "positive_usage_days": len(valid_intervals),
        "training_samples": len(X_train),
        "last_usage_date": regular_purchases[-1][0].isoformat(),
        "model_note": (
            model_note
            + " Estimated stock is calculated from the dated purchase and "
              "manual-consumption history, with AI usage applied once per "
              "calendar day. A manual-consumption entry replaces AI usage "
              "for that date to prevent double deduction."
        ),
    })
    return result


@app.route('/ai-predictions', methods=['GET'])
def get_ai_predictions():
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({"message": "Unauthorized"}), 401

        cursor.execute("""
            SELECT id AS product_id, product_name,
                   quantity AS current_stock, unit
            FROM products
            WHERE user_id = %s
            ORDER BY product_name
        """, (user_id,))
        products = cursor.fetchall()
        predictions = []
        snapshots_saved = 0
        for product in products:
            prediction = _build_product_prediction(cursor, product, user_id)
            predictions.append(prediction)

            # Save a forecast snapshot before the next purchase occurs. Do not
            # create duplicates on every page refresh: save only when the
            # latest snapshot for this product has a different predicted date.
            if (prediction.get("predicted_date")
                    and prediction.get("days_remaining") is not None
                    and float(prediction.get("average_daily_consumption") or 0) > 0):
                cursor.execute("""
                    SELECT predicted_date
                    FROM ai_predictions
                    WHERE product_id = %s AND user_id = %s
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                """, (prediction["product_id"], user_id))
                latest_snapshot = cursor.fetchone()
                latest_date = latest_snapshot.get("predicted_date") if latest_snapshot else None
                if hasattr(latest_date, "isoformat"):
                    latest_date = latest_date.isoformat()
                if str(latest_date or "")[:10] != prediction["predicted_date"]:
                    cursor.execute("""
                        INSERT INTO ai_predictions
                            (product_id, predicted_quantity, predicted_date,
                             prediction_type, predicted_days_remaining, user_id)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (
                        prediction["product_id"],
                        prediction["current_stock"],
                        prediction["predicted_date"],
                        "consumption_based",
                        prediction["days_remaining"],
                        user_id,
                    ))
                    snapshots_saved += 1

            cursor.execute("""
                SELECT
                    product_id,
                    COUNT(*) AS evaluated_count,
                    AVG(absolute_error) AS mean_absolute_error,
                    AVG(
                        CASE
                            WHEN predicted_days_remaining > 0
                                THEN GREATEST(0, 100 - (absolute_error / predicted_days_remaining * 100))
                            WHEN absolute_error = 0 THEN 100
                            ELSE 0
                        END
                    ) AS accuracy_percentage,
                    MAX(DATE_ADD(DATE(created_at), INTERVAL actual_days_remaining DAY)) AS latest_actual_purchase_date
                FROM ai_predictions
                WHERE user_id = %s
                  AND actual_days_remaining IS NOT NULL
                  AND absolute_error IS NOT NULL
                  AND evaluated_at IS NOT NULL
                GROUP BY product_id
            """, (user_id,))
            accuracy_rows = cursor.fetchall() or []
            accuracy_by_product = {}
            for accuracy_row in accuracy_rows:
                pid = accuracy_row["product_id"]
                actual_date = accuracy_row.get("latest_actual_purchase_date")
                accuracy_by_product[pid] = {
                    "prediction_accuracy": round(float(accuracy_row.get("accuracy_percentage") or 0), 1),
                    "prediction_mae_days": round(float(accuracy_row.get("mean_absolute_error") or 0), 2),
                    "evaluated_predictions": int(accuracy_row.get("evaluated_count") or 0),
                    "last_actual_purchase_date": actual_date.isoformat() if hasattr(actual_date, "isoformat") else actual_date,
                }

            for prediction in predictions:
                product_accuracy = accuracy_by_product.get(prediction["product_id"], {})
                prediction.update({
                    "prediction_accuracy": product_accuracy.get("prediction_accuracy"),
                    "prediction_mae_days": product_accuracy.get("prediction_mae_days"),
                    "evaluated_predictions": product_accuracy.get("evaluated_predictions", 0),
                    "last_actual_purchase_date": product_accuracy.get("last_actual_purchase_date"),
                })

        if snapshots_saved:
            connection.commit()
        return jsonify({
            "predictions": predictions,
            "total_products": len(predictions),
            "message": "Predictions generated successfully",
        }), 200
    except Exception as error:
        print("AI Prediction Error:", error)
        return jsonify({"message": "Failed to generate predictions"}), 500
    finally:
        cursor.close()
        connection.close()


@app.route('/ai-predictions/save', methods=['POST'])
def save_ai_predictions():
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({"message": "Unauthorized"}), 401

        cursor.execute("""
            SELECT id AS product_id, product_name,
                   quantity AS current_stock, unit
            FROM products
            WHERE user_id = %s
            ORDER BY product_name
        """, (user_id,))
        products = cursor.fetchall()
        saved_count = 0
        skipped_count = 0

        for product in products:
            prediction = _build_product_prediction(cursor, product, user_id)
            if (prediction["predicted_date"] is None
                    or prediction["days_remaining"] is None
                    or prediction["average_daily_consumption"] <= 0):
                skipped_count += 1
                continue

            cursor.execute("""
                SELECT predicted_date
                FROM ai_predictions
                WHERE product_id = %s AND user_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT 1
            """, (prediction["product_id"], user_id))
            latest_snapshot = cursor.fetchone()
            latest_date = latest_snapshot.get("predicted_date") if latest_snapshot else None
            if hasattr(latest_date, "isoformat"):
                latest_date = latest_date.isoformat()

            if str(latest_date or "")[:10] == prediction["predicted_date"]:
                skipped_count += 1
                continue

            cursor.execute("""
                INSERT INTO ai_predictions
                    (product_id, predicted_quantity, predicted_date,
                     prediction_type, predicted_days_remaining, user_id)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                prediction["product_id"],
                prediction["current_stock"],
                prediction["predicted_date"],
                "consumption_based",
                prediction["days_remaining"],
                user_id,
            ))
            saved_count += 1

        connection.commit()
        return jsonify({
            "message": "Prediction history processed",
            "saved_predictions": saved_count,
            "skipped_predictions": skipped_count,
        }), 200
    except Exception as error:
        connection.rollback()
        print("Save prediction error:", error)
        return jsonify({"message": "Failed to save prediction history"}), 500
    finally:
        cursor.close()
        connection.close()


@app.route('/ai-predictions/evaluate/<int:prediction_id>', methods=['POST'])
def evaluate_prediction(prediction_id):
    """Do not calculate accuracy without a verified real-world outcome."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id
            FROM ai_predictions
            WHERE id = %s AND user_id = %s
        """, (prediction_id, user_id))
        prediction = cursor.fetchone()
        if not prediction:
            return jsonify({"error": "Prediction not found"}), 404

        # The previous implementation incorrectly treated elapsed days since
        # forecast creation as actual days remaining. That is not a valid label.
        return jsonify({
            "message": (
                "Cannot evaluate accurately without a verified actual run-out "
                "date. No accuracy value has been fabricated."
            ),
            "prediction_id": prediction_id,
            "evaluated": False,
        }), 409
    except Exception as error:
        print("Error evaluating prediction:", error)
        return jsonify({"error": "Failed to check prediction"}), 500
    finally:
        cursor.close()
        connection.close()


@app.route('/ai-predictions/accuracy', methods=['GET'])
def get_ai_prediction_accuracy():
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

        cursor.execute("""
            SELECT COUNT(*) AS total_evaluated,
                   AVG(absolute_error) AS average_error
            FROM ai_predictions
            WHERE user_id = %s
              AND actual_days_remaining IS NOT NULL
              AND absolute_error IS NOT NULL
        """, (user_id,))
        result = cursor.fetchone() or {}
        total = int(result.get("total_evaluated") or 0)
        avg_error = result.get("average_error")
        avg_error = round(float(avg_error), 2) if avg_error is not None else None
        return jsonify({
            "total_evaluated": total,
            "average_error": avg_error,
            "evaluated_predictions": total,
            "mean_absolute_error": avg_error,
            "message": "Accuracy based on evaluated outcomes" if total else "No valid evaluated outcomes yet",
        }), 200
    except Exception as error:
        print("Accuracy calculation error:", error)
        return jsonify({"error": "Failed to retrieve prediction accuracy"}), 500
    finally:
        cursor.close()
        connection.close()


@app.route('/ai-predictions/history/<int:product_id>', methods=['GET'])
def get_ai_prediction_history(product_id):
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Verify that this product belongs to the logged-in user.
        cursor.execute("""
            SELECT id, product_name, unit
            FROM products
            WHERE id = %s AND user_id = %s
            LIMIT 1
        """, (product_id, user_id))

        product = cursor.fetchone()

        if not product:
            return jsonify({"message": "Product not found"}), 404

        # Return genuine evaluated prediction records.
        cursor.execute("""
            SELECT
                id,
                DATE(created_at) AS prediction_date,
                predicted_days_remaining,
                actual_days_remaining,
                absolute_error,
                predicted_date,
                evaluated_at
            FROM ai_predictions
            WHERE product_id = %s
              AND user_id = %s
              AND actual_days_remaining IS NOT NULL
              AND absolute_error IS NOT NULL
              AND evaluated_at IS NOT NULL
            ORDER BY created_at ASC, id ASC
        """, (product_id, user_id))

        history = cursor.fetchall()

        for row in history:
            for field in ('prediction_date', 'predicted_date', 'evaluated_at'):
                value = row.get(field)
                if hasattr(value, 'isoformat'):
                    row[field] = value.isoformat()

            row['predicted_days_remaining'] = int(
                row['predicted_days_remaining']
            )
            row['actual_days_remaining'] = int(
                row['actual_days_remaining']
            )
            row['absolute_error'] = float(row['absolute_error'])

        return jsonify({
            "product": product,
            "history": history,
            "total_evaluated": len(history)
        }), 200

    except Exception as error:
        print("AI prediction history error:", error)
        return jsonify({
            "message": "Failed to fetch prediction history"
        }), 500

    finally:
        cursor.close()
        connection.close()

# -----------------------------------
# ADD AI PREDICTION TO SHOPPING LIST
# -----------------------------------

@app.route('/shopping-list/add-prediction', methods=['POST'])
def add_prediction_to_shopping_list():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    data = request.get_json(silent=True) or {}

    product_id = data.get('product_id')
    requested_quantity = data.get('required_quantity')

    if not product_id:
        return {
            "message": "Product ID is required"
        }, 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # Get product only if it belongs to logged-in user
        cursor.execute("""
            SELECT
                id,
                product_name,
                quantity
            FROM products
            WHERE id = %s
              AND user_id = %s
            FOR UPDATE
        """, (product_id, user_id))

        product = cursor.fetchone()

        if not product:
            connection.rollback()

            return {
                "message": "Product not found"
            }, 404

        current_stock = float(product['quantity'] or 0)

        # Use recommended quantity sent from React
        if requested_quantity is not None:

            try:
                required_quantity = float(requested_quantity)

            except (TypeError, ValueError):

                connection.rollback()

                return {
                    "message": "Invalid recommended quantity"
                }, 400

            if required_quantity <= 0:

                connection.rollback()

                return {
                    "message": "Recommended quantity must be greater than zero"
                }, 400

        else:
            required_quantity = current_stock if current_stock > 0 else 1

        # Find existing Pending rows ONLY for this user
        cursor.execute("""
            SELECT id
            FROM shopping_list
            WHERE product_id = %s
              AND user_id = %s
              AND status = 'Pending'
            ORDER BY id ASC
            FOR UPDATE
        """, (product_id, user_id))

        pending_items = cursor.fetchall()

        if pending_items:

            keep_id = pending_items[0]['id']

            # Update existing pending item
            cursor.execute("""
                UPDATE shopping_list
                SET required_quantity = %s
                WHERE id = %s
                  AND user_id = %s
            """, (
                required_quantity,
                keep_id,
                user_id
            ))

            # Remove duplicate pending rows
            duplicate_ids = [
                row['id']
                for row in pending_items[1:]
            ]

            if duplicate_ids:

                placeholders = ','.join(
                    ['%s'] * len(duplicate_ids)
                )

                cursor.execute(
                    f"""
                        DELETE FROM shopping_list
                        WHERE id IN ({placeholders})
                          AND user_id = %s
                    """,
                    tuple(duplicate_ids) + (user_id,)
                )

            message = (
                "Existing pending item updated; "
                "duplicate pending rows removed"
            )

        else:

            # Add new shopping list item with user_id
            cursor.execute("""
                INSERT INTO shopping_list
                    (
                        product_id,
                        required_quantity,
                        status,
                        user_id
                    )
                VALUES (%s, %s, 'Pending', %s)
            """, (
                product_id,
                required_quantity,
                user_id
            ))

            message = "Product added to shopping list"

        connection.commit()

        return {
            "message": message,
            "product_id": int(product_id),
            "product_name": product['product_name'],
            "required_quantity": required_quantity
        }, 200

    except Exception as error:

        connection.rollback()

        print(
            "Shopping list add-prediction error:",
            error
        )

        return {
            "message": "Failed to add product to shopping list"
        }, 500

    finally:

        cursor.close()
        connection.close()

# -----------------------------------
# GET SHOPPING LIST
# -----------------------------------

@app.route('/shopping-list', methods=['GET'])
def get_shopping_list():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                shopping_list.id,
                shopping_list.product_id,
                products.product_name,
                shopping_list.required_quantity,
                products.unit,
                shopping_list.status,
                shopping_list.created_at
            FROM shopping_list
            JOIN products
                ON shopping_list.product_id = products.id
            WHERE shopping_list.user_id = %s
              AND products.user_id = %s
            ORDER BY shopping_list.created_at DESC,
                     shopping_list.id DESC
        """, (user_id, user_id))

        items = cursor.fetchall()

        return {
            "shopping_list": items
        }, 200

    except Exception as error:

        print("Get shopping list error:", error)

        return {
            "message": "Failed to fetch shopping list"
        }, 500

    finally:
        cursor.close()
        connection.close()

# -----------------------------------
# UPDATE SHOPPING LIST STATUS
# -----------------------------------

@app.route('/shopping-list/<int:item_id>', methods=['PUT'])
def update_shopping_list_status(item_id):

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    data = request.get_json(silent=True) or {}
    status = data.get('status')

    if status not in ['Pending', 'Purchased']:
        return {
            "message": "Status must be Pending or Purchased"
        }, 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # Get shopping item only for the logged-in user
        cursor.execute("""
            SELECT
                id,
                product_id,
                status
            FROM shopping_list
            WHERE id = %s
              AND user_id = %s
            FOR UPDATE
        """, (item_id, user_id))

        item = cursor.fetchone()

        if not item:
            connection.rollback()

            return {
                "message": "Shopping list item not found"
            }, 404

        # If changing back to Pending,
        # check for another Pending item belonging to this user
        if status == 'Pending':

            cursor.execute("""
                SELECT
                    id,
                    required_quantity
                FROM shopping_list
                WHERE product_id = %s
                  AND user_id = %s
                  AND status = 'Pending'
                  AND id <> %s
                ORDER BY id ASC
                FOR UPDATE
            """, (
                item['product_id'],
                user_id,
                item_id
            ))

            other_pending = cursor.fetchone()

            if other_pending:

                cursor.execute("""
                    DELETE FROM shopping_list
                    WHERE id = %s
                      AND user_id = %s
                """, (
                    item_id,
                    user_id
                ))

                connection.commit()

                return {
                    "message": "An existing pending entry already exists; duplicate was removed",
                    "merged_into": other_pending['id']
                }, 200

        # Update status only for this user's item
        cursor.execute("""
            UPDATE shopping_list
            SET status = %s
            WHERE id = %s
              AND user_id = %s
        """, (
            status,
            item_id,
            user_id
        ))

        connection.commit()

        return {
            "message": "Shopping list status updated successfully"
        }, 200

    except Exception as error:

        connection.rollback()

        print(
            "Update shopping list error:",
            error
        )

        return {
            "message": "Failed to update shopping list"
        }, 500

    finally:
        cursor.close()
        connection.close()

# -----------------------------------
# DELETE SHOPPING LIST ITEM
# -----------------------------------

@app.route('/shopping-list/<int:item_id>', methods=['DELETE'])
def delete_shopping_list_item(item_id):

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            DELETE FROM shopping_list
            WHERE id = %s
              AND user_id = %s
        """, (
            item_id,
            user_id
        ))

        if cursor.rowcount == 0:
            connection.rollback()

            return {
                "message": "Shopping list item not found"
            }, 404

        connection.commit()

        return {
            "message": "Shopping list item deleted successfully"
        }, 200

    except Exception as error:

        connection.rollback()

        print(
            "Delete shopping list error:",
            error
        )

        return {
            "message": "Failed to delete shopping list item"
        }, 500

    finally:
        cursor.close()
        connection.close()



# ================= MEAL RECOMMENDATION APIs =================

# ================= MEAL RECOMMENDATION APIs =================


# -----------------------------------
# GET USER'S MEALS
# -----------------------------------

@app.route('/meals', methods=['GET'])
def get_meals():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:

        cursor.execute("""
            SELECT
                id,
                meal_name,
                description,
                category,
                preparation_time,
                difficulty,
                cooking_type,
                meal_type,
                servings
            FROM meals
            WHERE user_id = %s
            ORDER BY id DESC
        """, (user_id,))

        meals = cursor.fetchall()

        for meal in meals:

            cursor.execute("""
                SELECT
                    id,
                    product_id,
                    ingredient_name,
                    required_quantity AS quantity,
                    unit
                FROM meal_ingredients
                WHERE meal_id = %s
                ORDER BY id
            """, (meal['id'],))

            meal['ingredients'] = cursor.fetchall()

            cursor.execute("""
                SELECT step_text
                FROM meal_preparation_steps
                WHERE meal_id = %s
                ORDER BY step_order, id
            """, (meal['id'],))

            meal['steps'] = [
                row['step_text'] for row in cursor.fetchall()
            ]

        return jsonify(meals), 200

    except Exception as e:

        print("Get meals error:", e)

        return jsonify({
            "error": "Failed to fetch meals"
        }), 500

    finally:

        cursor.close()
        conn.close()


# -----------------------------------
# ADD USER MEAL
# -----------------------------------

@app.route('/meals', methods=['POST'])
def add_meal():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    data = request.get_json(silent=True) or {}

    meal_name = str(
        data.get('meal_name', '')
    ).strip()

    ingredients = data.get('ingredients', [])

    difficulty = str(
        data.get('difficulty', 'Easy')
    ).strip().title()

    category = str(
        data.get('category', '')
    ).strip().title()

    cooking_type = str(
        data.get('cooking_type', '')
    ).strip().title()

    meal_type = str(data.get('meal_type', '')).strip().title()

    try:
        original_servings = int(data.get('servings', 1))
        if original_servings < 1 or original_servings > 100:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({
            "error": "Servings must be a whole number between 1 and 100"
        }), 400

    if not meal_name:
        return jsonify({
            "error": "Meal name is required"
        }), 400

    if len(meal_name) > 100:
        return jsonify({
            "error": "Meal name must be 100 characters or fewer"
        }), 400

    if meal_type not in ('Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverages'):
        return jsonify({
            "error": "Meal type must be Breakfast, Lunch, Dinner, Snacks or Beverages"
        }), 400

    if category not in ('Vegetarian', 'Non-Vegetarian', 'Beverages'):
        return jsonify({
            "error": "Category must be Vegetarian, Non-Vegetarian or Beverages"
        }), 400

    allowed_cooking_types = (
        ('Quick Drink', 'Healthy Drink', 'Traditional Drink')
        if meal_type == 'Beverages'
        else ('Quick Meals', 'Healthy Meals', 'Traditional Meals')
    )
    if cooking_type not in allowed_cooking_types:
        return jsonify({
            "error": "Choose a cooking type that matches the selected meal type"
        }), 400

    if not isinstance(ingredients, list) or not ingredients:

        return jsonify({
            "error": "At least one ingredient is required"
        }), 400

    raw_steps = data.get('steps', [])
    if not isinstance(raw_steps, list):
        return jsonify({"error": "Preparation steps must be a list"}), 400

    cleaned_steps = []
    for step in raw_steps:
        step_text = str(step or '').strip()
        if step_text:
            if len(step_text) > 500:
                return jsonify({
                    "error": "Each preparation step must be 500 characters or fewer"
                }), 400
            cleaned_steps.append(step_text)

    if not cleaned_steps:
        return jsonify({
            "error": "At least one preparation step is required"
        }), 400

    if len(cleaned_steps) > 30:
        return jsonify({
            "error": "A meal can have at most 30 preparation steps"
        }), 400

    try:

        preparation_time = int(
            data.get('preparation_time')
        )

        if preparation_time <= 0:
            raise ValueError

    except (ValueError, TypeError):

        return jsonify({
            "error": (
                "Preparation time must be a positive "
                "number of minutes"
            )
        }), 400

    if difficulty not in (
        'Easy',
        'Medium',
        'Hard'
    ):
        return jsonify({
            "error": "Difficulty must be Easy, Medium or Hard"
        }), 400

    # -----------------------------------
    # CLEAN INGREDIENTS
    # -----------------------------------

    cleaned = []

    try:

        for item in ingredients:

            if not isinstance(item, dict):

                raise ValueError(
                    "Each ingredient must be an object."
                )

            name = str(
                item.get('ingredient_name', '')
            ).strip()

            unit = str(
                item.get('unit', '')
            ).strip()

            quantity = float(
                item.get('quantity', 0)
            )

            if not name or len(name) > 150:

                raise ValueError(
                    "Ingredient name is required "
                    "(maximum 150 characters)."
                )

            if not unit or len(unit) > 30:

                raise ValueError(
                    "Ingredient unit is required "
                    "(maximum 30 characters)."
                )

            if quantity <= 0:

                raise ValueError(
                    "Ingredient quantity must be greater than zero."
                )

            cleaned.append({
                "ingredient_name": name,
                "quantity": quantity,
                "unit": unit
            })

    except (ValueError, TypeError) as e:

        return jsonify({
            "error": str(e) or "Invalid ingredient quantity"
        }), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:

        conn.start_transaction()

        # -----------------------------------
        # CHECK DUPLICATE MEAL
        # ONLY FOR THIS USER
        # -----------------------------------

        cursor.execute("""
            SELECT id
            FROM meals
            WHERE user_id = %s
              AND LOWER(TRIM(meal_name))
                  = LOWER(TRIM(%s))
            LIMIT 1
            FOR UPDATE
        """, (
            user_id,
            meal_name
        ))

        if cursor.fetchone():

            conn.rollback()

            return jsonify({
                "error": "A meal with this name already exists"
            }), 409

        # -----------------------------------
        # INSERT MEAL WITH USER ID
        # -----------------------------------

        cursor.execute("""
            INSERT INTO meals (
                meal_name,
                preparation_time,
                difficulty,
                category,
                cooking_type,
                meal_type,
                user_id,
                servings
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s
            )
        """, (
            meal_name,
            preparation_time,
            difficulty,
            category,
            cooking_type,
            meal_type,
            user_id,
            original_servings
        ))

        meal_id = cursor.lastrowid

        # -----------------------------------
        # GET ONLY THIS USER'S PRODUCTS
        # -----------------------------------

        cursor.execute("""
            SELECT
                id,
                product_name,
                unit
            FROM products
            WHERE user_id = %s
        """, (user_id,))

        products = cursor.fetchall()
        alias_map = get_ingredient_alias_map(cursor)

        # -----------------------------------
        # SAVE INGREDIENTS (exact match, then admin-approved alias)
        # -----------------------------------

        for item in cleaned:

            matched_product = resolve_unique_product(
                item['ingredient_name'], products, alias_map
            )
            product_id = matched_product['id'] if matched_product else None

            cursor.execute("""
                INSERT INTO meal_ingredients (
                    meal_id,
                    product_id,
                    required_quantity,
                    ingredient_name,
                    unit
                )
                VALUES (%s, %s, %s, %s, %s)
            """, (
                meal_id,
                product_id,
                item['quantity'],
                item['ingredient_name'],
                item['unit']
            ))

        for step_index, step_text in enumerate(cleaned_steps, start=1):
            cursor.execute("""
                INSERT INTO meal_preparation_steps
                    (meal_id, step_order, step_text)
                VALUES (%s, %s, %s)
            """, (meal_id, step_index, step_text))

        conn.commit()

        return jsonify({
            "message": "Meal added successfully",
            "meal_id": meal_id
        }), 201

    except Exception as e:

        conn.rollback()

        print(
            "Add meal error:",
            e
        )

        if getattr(e, 'errno', None) == 1062:

            return jsonify({
                "error": "A meal with this name already exists"
            }), 409

        return jsonify({
            "error": "Failed to add meal"
        }), 500

    finally:

        cursor.close()
        conn.close()


# -----------------------------------
# DELETE USER'S MEAL
# -----------------------------------

@app.route('/meals/<int:meal_id>/meal-type', methods=['PUT'])
def update_meal_type(meal_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    meal_type = str(data.get('meal_type', '')).strip().title()
    if meal_type not in ('Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverages'):
        return jsonify({"error": "Meal type must be Breakfast, Lunch, Dinner, Snacks or Beverages"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            UPDATE meals SET meal_type = %s
            WHERE id = %s AND user_id = %s
        """, (meal_type, meal_id, user_id))
        if cursor.rowcount == 0:
            cursor.execute("SELECT id FROM meals WHERE id = %s AND user_id = %s", (meal_id, user_id))
            if not cursor.fetchone():
                return jsonify({"error": "Meal not found"}), 404
        conn.commit()
        return jsonify({"message": "Meal type updated successfully", "meal_id": meal_id, "meal_type": meal_type}), 200
    except Exception as error:
        conn.rollback()
        print("Update meal type error:", error)
        return jsonify({"error": "Unable to update meal type"}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/meals/<int:meal_id>', methods=['DELETE'])
def delete_meal(meal_id):

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:

        conn.start_transaction()

        # -----------------------------------
        # CHECK MEAL BELONGS TO USER
        # -----------------------------------

        cursor.execute("""
            SELECT
                id,
                meal_name
            FROM meals
            WHERE id = %s
              AND user_id = %s
            FOR UPDATE
        """, (
            meal_id,
            user_id
        ))

        meal = cursor.fetchone()

        if not meal:

            conn.rollback()

            return jsonify({
                "error": "Meal not found"
            }), 404

        # -----------------------------------
        # DELETE INGREDIENTS
        # -----------------------------------

        cursor.execute("""
            DELETE FROM meal_preparation_steps
            WHERE meal_id = %s
        """, (meal_id,))

        cursor.execute("""
            DELETE FROM meal_ingredients
            WHERE meal_id = %s
        """, (meal_id,))

        deleted_ingredients = cursor.rowcount

        # -----------------------------------
        # DELETE MEAL
        # -----------------------------------

        cursor.execute("""
            DELETE FROM meals
            WHERE id = %s
              AND user_id = %s
        """, (
            meal_id,
            user_id
        ))

        if cursor.rowcount == 0:

            conn.rollback()

            return jsonify({
                "error": "Meal could not be deleted"
            }), 404

        conn.commit()

        return jsonify({
            "message": "Meal and its ingredients deleted successfully",
            "meal_id": meal_id,
            "meal_name": meal['meal_name'],
            "deleted_ingredients": deleted_ingredients
        }), 200

    except Exception as e:

        conn.rollback()

        print(
            "Delete meal error:",
            e
        )

        return jsonify({
            "error": "Failed to delete meal"
        }), 500

    finally:

        cursor.close()
        conn.close()


# -----------------------------------
# COOK MEAL
# -----------------------------------

@app.route('/admin/ingredient-unit-conversions', methods=['GET', 'POST'])
def admin_ingredient_unit_conversions():
    """Admin-managed conversion factors for individual ingredients."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if not require_admin(cursor, user_id):
            return jsonify({'message': 'Admin access required'}), 403

        if request.method == 'GET':
            cursor.execute("""
                SELECT iuc.id, iuc.ingredient_id, im.canonical_name,
                       iuc.from_unit, iuc.to_unit, iuc.conversion_factor
                FROM ingredient_unit_conversions iuc
                JOIN ingredient_master im ON im.id = iuc.ingredient_id
                ORDER BY im.canonical_name, iuc.from_unit, iuc.to_unit
            """)
            return jsonify({'conversions': cursor.fetchall() or []}), 200

        data = request.get_json(silent=True) or {}
        ingredient_id = data.get('ingredient_id')
        from_unit = str(data.get('from_unit', '')).strip()
        to_unit = str(data.get('to_unit', '')).strip()
        try:
            factor = float(data.get('conversion_factor'))
            ingredient_id = int(ingredient_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'ingredient_id and a positive conversion_factor are required'}), 400
        if not from_unit or not to_unit or from_unit.lower() == to_unit.lower() or factor <= 0:
            return jsonify({'error': 'Enter two different units and a conversion factor greater than zero'}), 400
        cursor.execute('SELECT id FROM ingredient_master WHERE id = %s', (ingredient_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Ingredient not found'}), 404
        cursor.execute("""
            INSERT INTO ingredient_unit_conversions
                (ingredient_id, from_unit, to_unit, conversion_factor, updated_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON DUPLICATE KEY UPDATE
                conversion_factor = VALUES(conversion_factor), updated_at = NOW()
        """, (ingredient_id, from_unit, to_unit, factor))
        conn.commit()
        return jsonify({'message': 'Ingredient conversion saved successfully'}), 201
    except Exception as e:
        conn.rollback()
        print('Admin ingredient conversion error:', e)
        return jsonify({'error': 'Unable to manage ingredient conversions'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/admin/ingredient-unit-conversions/<int:conversion_id>', methods=['DELETE'])
def delete_admin_ingredient_unit_conversion(conversion_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if not require_admin(cursor, user_id):
            return jsonify({'message': 'Admin access required'}), 403
        cursor.execute('DELETE FROM ingredient_unit_conversions WHERE id = %s', (conversion_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Conversion not found'}), 404
        return jsonify({'message': 'Conversion deleted successfully'}), 200
    except Exception as e:
        conn.rollback()
        print('Delete ingredient conversion error:', e)
        return jsonify({'error': 'Unable to delete conversion'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/admin/product-unit-conversions', methods=['GET', 'POST'])
def admin_product_unit_conversions():
    """Admin-managed package-size mappings shared by product name."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if not require_admin(cursor, user_id):
            return jsonify({'message': 'Admin access required'}), 403

        if request.method == 'GET':
            cursor.execute("""
                SELECT id, product_name, package_unit, base_unit, base_quantity
                FROM product_unit_conversions
                ORDER BY product_name, package_unit
            """)
            return jsonify({'conversions': cursor.fetchall() or []}), 200

        data = request.get_json(silent=True) or {}
        product_name = str(data.get('product_name', '')).strip()
        package_unit = str(data.get('package_unit', '')).strip()
        base_unit = str(data.get('base_unit', '')).strip()
        try:
            base_quantity = float(data.get('base_quantity'))
        except (TypeError, ValueError):
            return jsonify({'error': 'base_quantity must be a positive number'}), 400
        if not product_name or not package_unit or not base_unit or base_quantity <= 0:
            return jsonify({'error': 'product_name, package_unit, base_unit and positive base_quantity are required'}), 400
        cursor.execute("""
            INSERT INTO product_unit_conversions
                (product_name, package_unit, base_unit, base_quantity, updated_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON DUPLICATE KEY UPDATE
                base_unit = VALUES(base_unit),
                base_quantity = VALUES(base_quantity), updated_at = NOW()
        """, (product_name, package_unit, base_unit, base_quantity))
        conn.commit()
        return jsonify({'message': 'Product package conversion saved successfully'}), 201
    except Exception as e:
        conn.rollback()
        print('Admin product conversion error:', e)
        return jsonify({'error': 'Unable to manage product conversions'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/admin/product-unit-conversions/<int:conversion_id>', methods=['DELETE'])
def delete_admin_product_unit_conversion(conversion_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if not require_admin(cursor, user_id):
            return jsonify({'message': 'Admin access required'}), 403
        cursor.execute('DELETE FROM product_unit_conversions WHERE id = %s', (conversion_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Conversion not found'}), 404
        return jsonify({'message': 'Conversion deleted successfully'}), 200
    except Exception as e:
        conn.rollback()
        print('Delete product conversion error:', e)
        return jsonify({'error': 'Unable to delete conversion'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/admin/register-recipe-ingredients', methods=['POST'])
def admin_register_recipe_ingredients():
    """Register every distinct recipe ingredient once and attach safe spelling aliases.

    This creates ingredient identities only. It deliberately does not create
    physical unit-conversion factors or change household inventory quantities.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    # Known equivalent names from the current Home Needs recipe catalog.
    # Similar-looking but genuinely different ingredients are kept separate.
    canonical_overrides = {
        'cumins': 'Cumin Seeds',
        'jeera': 'Cumin Seeds',
        'termericpowder': 'Turmeric Powder',
        'salt': 'Salt',
        'water': 'Water',
        'rice': 'Rice',
        'curd': 'Curd',
        'dosasour': 'Dosa Sour',
        'idlysour': 'Idly Sour',
        'egg': 'Egg',
        'maggi': 'Maggi',
        'paper': 'Paper',
    }

    try:
        if not require_admin(cursor, user_id):
            return jsonify({'message': 'Admin access required'}), 403

        cursor.execute("SELECT DISTINCT ingredient_name FROM meal_ingredients ORDER BY ingredient_name")
        recipe_names = [str(r.get('ingredient_name') or '').strip() for r in (cursor.fetchall() or [])]
        recipe_names = [n for n in recipe_names if n]

        cursor.execute("SELECT id, canonical_name FROM ingredient_master")
        existing_rows = cursor.fetchall() or []
        existing_by_key = {ingredient_key(r['canonical_name']): int(r['id']) for r in existing_rows}

        cursor.execute("SELECT ingredient_id, alias_name FROM ingredient_aliases")
        alias_rows = cursor.fetchall() or []
        existing_alias_by_key = {ingredient_key(r['alias_name']): int(r['ingredient_id']) for r in alias_rows}

        registered = []
        aliases_added = []
        skipped_alias_conflicts = []

        for original_name in recipe_names:
            source_key = ingredient_key(original_name)
            canonical_name = canonical_overrides.get(source_key)
            if not canonical_name:
                # Preserve meaningful ingredient names while standardizing case.
                canonical_name = ' '.join(word.capitalize() for word in original_name.split())
                if source_key == 'basmatirice':
                    canonical_name = 'Basmati Rice'
                elif source_key == 'greenchilli':
                    canonical_name = 'Green Chilli'
                elif source_key == 'gingergarlicpaste':
                    canonical_name = 'Ginger Garlic Paste'
                elif source_key == 'garammasala':
                    canonical_name = 'Garam Masala'
                elif source_key == 'greenpeas':
                    canonical_name = 'Green Peas'
                elif source_key == 'mustardseeds':
                    canonical_name = 'Mustard Seeds'
                elif source_key == 'corianderleaves':
                    canonical_name = 'Coriander Leaves'

            canonical_key = ingredient_key(canonical_name)
            ingredient_id = existing_by_key.get(canonical_key)
            if ingredient_id is None:
                cursor.execute(
                    "INSERT INTO ingredient_master (canonical_name) VALUES (%s)",
                    (canonical_name,)
                )
                ingredient_id = int(cursor.lastrowid)
                existing_by_key[canonical_key] = ingredient_id
                registered.append(canonical_name)

            # Add original recipe spelling as an alias only when it differs.
            # If it already belongs to another canonical ingredient, do not
            # silently reassign it.
            if source_key != canonical_key:
                prior_owner = existing_alias_by_key.get(source_key)
                if prior_owner is None:
                    cursor.execute(
                        "INSERT INTO ingredient_aliases (ingredient_id, alias_name) VALUES (%s, %s)",
                        (ingredient_id, original_name)
                    )
                    existing_alias_by_key[source_key] = ingredient_id
                    aliases_added.append({'alias': original_name, 'canonical_name': canonical_name})
                elif prior_owner != ingredient_id:
                    skipped_alias_conflicts.append(original_name)

        conn.commit()
        return jsonify({
            'message': 'Recipe ingredients registered. No conversion factors or inventory quantities were changed.',
            'recipe_ingredient_count': len(recipe_names),
            'new_canonical_ingredients': registered,
            'aliases_added': aliases_added,
            'alias_conflicts_skipped': skipped_alias_conflicts
        }), 200
    except Exception as e:
        conn.rollback()
        print('Admin recipe ingredient registration error:', e)
        return jsonify({'error': 'Unable to register recipe ingredients'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/admin/unit-conversion-catalog', methods=['GET'])
def admin_unit_conversion_catalog():
    """Show recipe ingredients and inventory units alongside configured rules.

    This endpoint does not invent conversions. It gives the admin one catalog
    to identify which ingredient/unit pairs still need measured settings.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if not require_admin(cursor, user_id):
            return jsonify({'message': 'Admin access required'}), 403

        cursor.execute("""
            SELECT ingredient_name, unit
            FROM meal_ingredients
            ORDER BY ingredient_name, unit
        """)
        recipe_rows = cursor.fetchall() or []

        cursor.execute("""
            SELECT product_name, unit
            FROM products
            ORDER BY product_name, unit
        """)
        product_rows = cursor.fetchall() or []

        cursor.execute("""
            SELECT im.id, im.canonical_name, ia.alias_name
            FROM ingredient_master im
            LEFT JOIN ingredient_aliases ia ON ia.ingredient_id = im.id
            ORDER BY im.canonical_name, ia.alias_name
        """)
        master_rows = cursor.fetchall() or []

        cursor.execute("""
            SELECT ingredient_id, from_unit, to_unit, conversion_factor
            FROM ingredient_unit_conversions
        """)
        conversion_rows = cursor.fetchall() or []

        cursor.execute("""
            SELECT product_name, package_unit, base_unit, base_quantity
            FROM product_unit_conversions
        """)
        package_rows = cursor.fetchall() or []

        # Build a normalized lookup from canonical names and aliases.
        master_lookup = {}
        master_by_id = {}
        for item in master_rows:
            iid = int(item['id'])
            master_by_id[iid] = {
                'id': iid,
                'canonical_name': item['canonical_name'],
                'aliases': []
            }
            canonical_key = ingredient_key(item['canonical_name'])
            if canonical_key:
                master_lookup[canonical_key] = iid
            alias = item.get('alias_name')
            if alias:
                master_by_id[iid]['aliases'].append(alias)
                alias_key = ingredient_key(alias)
                if alias_key:
                    master_lookup[alias_key] = iid

        recipe_map = {}
        for item in recipe_rows:
            name = str(item.get('ingredient_name') or '').strip()
            key = ingredient_key(name)
            if not key:
                continue
            entry = recipe_map.setdefault(key, {
                'ingredient_name': name,
                'recipe_units': set(),
                'inventory_matches': set()
            })
            entry['recipe_units'].add(str(item.get('unit') or '').strip())

        # Match inventory names using the same canonical/alias key logic.
        for item in product_rows:
            product_name = str(item.get('product_name') or '').strip()
            key = ingredient_key(product_name)
            if key in recipe_map:
                recipe_map[key]['inventory_matches'].add(
                    f"{product_name} ({item.get('unit') or ''})"
                )
                continue
            canonical_id = master_lookup.get(key)
            if canonical_id is not None:
                canonical_key = ingredient_key(master_by_id[canonical_id]['canonical_name'])
                if canonical_key in recipe_map:
                    recipe_map[canonical_key]['inventory_matches'].add(
                        f"{product_name} ({item.get('unit') or ''})"
                    )

        conversions_by_id = {}
        for rule in conversion_rows:
            conversions_by_id.setdefault(int(rule['ingredient_id']), []).append({
                'from_unit': rule['from_unit'],
                'to_unit': rule['to_unit'],
                'conversion_factor': float(rule['conversion_factor'])
            })

        package_by_name = {}
        for rule in package_rows:
            package_by_name.setdefault(ingredient_key(rule['product_name']), []).append({
                'package_unit': rule['package_unit'],
                'base_unit': rule['base_unit'],
                'base_quantity': float(rule['base_quantity'])
            })

        catalog = []
        for key, entry in sorted(recipe_map.items(), key=lambda pair: pair[1]['ingredient_name'].casefold()):
            ingredient_id = master_lookup.get(key)
            if ingredient_id is None:
                # Try a canonical match through a known alias key only; never
                # fuzzy-match two different ingredients.
                for iid, master in master_by_id.items():
                    if ingredient_key(master['canonical_name']) == key:
                        ingredient_id = iid
                        break
            catalog.append({
                'ingredient_name': entry['ingredient_name'],
                'ingredient_id': ingredient_id,
                'canonical_name': master_by_id[ingredient_id]['canonical_name'] if ingredient_id else None,
                'recipe_units': sorted(entry['recipe_units']),
                'inventory_matches': sorted(entry['inventory_matches']),
                'ingredient_conversions': conversions_by_id.get(ingredient_id, []) if ingredient_id else [],
                'package_conversions': package_by_name.get(key, []),
                'needs_ingredient_registration': ingredient_id is None,
                'needs_conversion_setup': not bool(conversions_by_id.get(ingredient_id, [])) if ingredient_id else True
            })

        return jsonify({
            'ingredients': catalog,
            'ingredient_count': len(catalog),
            'message': 'Catalog loaded. Missing physical conversions must be measured or verified; none are guessed.'
        }), 200
    except Exception as e:
        print('Admin unit conversion catalog error:', e)
        return jsonify({'error': 'Unable to load unit conversion catalog'}), 500
    finally:
        cursor.close()
        conn.close()






# -----------------------------------
# FAMILY MEAL COOKING HISTORY
# -----------------------------------

@app.route('/meal-cooking-history', methods=['GET'])
def get_meal_cooking_history():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "success": False,
            "message": "Unauthorized"
        }), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Pagination
        try:
            limit = int(request.args.get('limit', 20))
            offset = int(request.args.get('offset', 0))

            limit = max(1, min(limit, 100))
            offset = max(0, offset)

        except (TypeError, ValueError):
            return jsonify({
                "success": False,
                "message": "Invalid pagination values"
            }), 400

        # Optional date filters
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        conditions = ["user_id = %s"]
        params = [user_id]
        recipe_type = request.args.get('recipe_type')

        if recipe_type in ('custom', 'global'):
            conditions.append("recipe_type = %s")
            params.append(recipe_type)

        if start_date:
            conditions.append("DATE(cooked_at) >= %s")
            params.append(start_date)

        if end_date:
            conditions.append("DATE(cooked_at) <= %s")
            params.append(end_date)

        where_clause = " AND ".join(conditions)

        # Total matching records
        cursor.execute(f"""
            SELECT COUNT(*) AS total
            FROM meal_cooking_history
            WHERE {where_clause}
        """, tuple(params))

        total = cursor.fetchone()['total']

        # Fetch only this user's cooking history
        cursor.execute(f"""
            SELECT
                id,
                meal_id,
                global_recipe_id,
                recipe_type,
                recipe_name_snapshot,
                servings,
                cooked_at
            FROM meal_cooking_history
            WHERE {where_clause}
            ORDER BY cooked_at DESC, id DESC
            LIMIT %s OFFSET %s
        """, tuple(params + [limit, offset]))

        history = cursor.fetchall()

        for item in history:
            if item.get('cooked_at'):
                item['cooked_at'] = item['cooked_at'].isoformat(
                    sep=' ',
                    timespec='seconds'
                )

            item['servings'] = int(item['servings'])

        return jsonify({
            "success": True,
            "history": history,
            "pagination": {
                "total": int(total),
                "limit": limit,
                "offset": offset,
                "has_more": offset + len(history) < total
            },
            "message": "Cooking history loaded successfully"
        }), 200

    except Exception as error:
        print("Meal cooking history error:", error)

        return jsonify({
            "success": False,
            "message": "Failed to load cooking history"
        }), 500

    finally:
        cursor.close()
        connection.close()
@app.route('/test-meal-cooking-history', methods=['GET'])
def test_meal_cooking_history():

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                id,
                user_id,
                meal_id,
                global_recipe_id,
                recipe_type,
                recipe_name_snapshot,
                servings,
                cooked_at
            FROM meal_cooking_history
            ORDER BY cooked_at DESC, id DESC
        """)

        history = cursor.fetchall()

        for item in history:
            if item.get('cooked_at'):
                item['cooked_at'] = item['cooked_at'].isoformat(
                    sep=' ',
                    timespec='seconds'
                )

        return jsonify({
            'success': True,
            'total': len(history),
            'history': history
        }), 200

    except Exception as e:
        print("Test cooking history error:", e)

        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

    finally:
        cursor.close()
        conn.close()

@app.route('/meals/<int:meal_id>/cook', methods=['POST'])
def cook_meal(meal_id):

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    request_data = request.get_json(silent=True) or {}
    try:
        requested_servings = int(request_data.get('servings', 1))
        if requested_servings < 1 or requested_servings > 100:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({
            "error": "Servings must be a whole number between 1 and 100."
        }), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:

        conn.start_transaction()

        # -----------------------------------
        # GET MEAL ONLY FOR LOGGED-IN USER
        # -----------------------------------

        cursor.execute("""
            SELECT
                id,
                meal_name,
                servings
            FROM meals
            WHERE id = %s
              AND user_id = %s
            FOR UPDATE
        """, (
            meal_id,
            user_id
        ))

        meal = cursor.fetchone()

        if not meal:

            conn.rollback()

            return jsonify({
                "error": "Meal not found"
            }), 404

        # -----------------------------------
        # GET MEAL INGREDIENTS
        # -----------------------------------

        cursor.execute("""
            SELECT
                mi.id,
                mi.product_id,
                mi.ingredient_name,
                mi.required_quantity,
                mi.unit,

                p.id AS actual_product_id,
                p.product_name,
                p.quantity AS stock_quantity,
                p.unit AS stock_unit,
                p.expiry_date AS stock_expiry_date

            FROM meal_ingredients mi

            LEFT JOIN products p
                ON p.id = mi.product_id
                AND p.user_id = %s

            WHERE mi.meal_id = %s

            ORDER BY mi.id
        """, (
            user_id,
            meal_id
        ))

        rows = cursor.fetchall()

        if not rows:

            conn.rollback()

            return jsonify({
                "error": "This meal has no ingredients"
            }), 400

        # -----------------------------------
        # UNIVERSAL UNIT CONVERSION
        # -----------------------------------

        import re

        def normalize_unit(unit):
            """Normalize unit labels, ignoring display hints such as '(250 ml)'."""
            raw_value = str(unit or '').strip().lower()
            # Frontend labels may include display hints, for example
            # 'Cup (250 ml)' or 'Piece (130 g)'. These are not part of the
            # actual unit name and must not block backend conversion.
            raw_value = re.sub(r'\([^)]*\)', '', raw_value)
            value = re.sub(r'[^a-z0-9]', '', raw_value)
            aliases = {
                'milligram': 'mg', 'milligrams': 'mg',
                'gram': 'g', 'grams': 'g',
                'kilogram': 'kg', 'kilograms': 'kg',
                'milliliter': 'ml', 'milliliters': 'ml',
                'millilitre': 'ml', 'millilitres': 'ml',
                'liter': 'l', 'liters': 'l', 'litre': 'l', 'litres': 'l',
                'teaspoon': 'tsp', 'teaspoons': 'tsp',
                'tablespoon': 'tbsp', 'tablespoons': 'tbsp',
                'cups': 'cup',
                'pc': 'piece', 'pcs': 'piece', 'pieces': 'piece',
                'each': 'piece', 'unit': 'piece', 'units': 'piece',
                'no': 'piece', 'nos': 'piece',
                'dozens': 'dozen',
                'pack': 'packet', 'packs': 'packet', 'packets': 'packet',
                'bottles': 'bottle', 'boxes': 'box'
            }
            return aliases.get(value, value)

        # Quantity of each unit expressed in its dimension's base unit.
        # Mass base = gram; volume base = ml; count base = piece.
        standard_units = {
            'mg': ('mass', 0.001),
            'g': ('mass', 1.0),
            'kg': ('mass', 1000.0),
            'ml': ('volume', 1.0),
            'l': ('volume', 1000.0),
            'tsp': ('volume', 5.0),
            'tbsp': ('volume', 15.0),
            'cup': ('volume', 250.0),
            'piece': ('count', 1.0),
            'dozen': ('count', 12.0)
        }

        ingredient_conversion_cache = {}
        ingredient_id_cache = {}
        package_conversion_cache = {}

        def get_ingredient_id(ingredient_name):
            key = ingredient_key(ingredient_name)
            if not key:
                return None
            if key in ingredient_id_cache:
                return ingredient_id_cache[key]

            cursor.execute("""
                SELECT im.id, im.canonical_name, ia.alias_name
                FROM ingredient_master im
                LEFT JOIN ingredient_aliases ia
                    ON ia.ingredient_id = im.id
            """)
            found_id = None
            for item in cursor.fetchall() or []:
                canonical_key = ingredient_key(item.get('canonical_name'))
                alias_key = ingredient_key(item.get('alias_name')) if item.get('alias_name') else None
                if key == canonical_key or key == alias_key:
                    found_id = int(item['id'])
                    break
            ingredient_id_cache[key] = found_id
            return found_id

        def get_ingredient_rules(ingredient_name):
            ingredient_id = get_ingredient_id(ingredient_name)
            if not ingredient_id:
                return []
            if ingredient_id not in ingredient_conversion_cache:
                cursor.execute("""
                    SELECT from_unit, to_unit, conversion_factor
                    FROM ingredient_unit_conversions
                    WHERE ingredient_id = %s
                """, (ingredient_id,))
                ingredient_conversion_cache[ingredient_id] = cursor.fetchall() or []
            return ingredient_conversion_cache[ingredient_id]

        def get_package_rule(product_name, package_unit):
            cache_key = (ingredient_key(product_name), normalize_unit(package_unit))
            if cache_key in package_conversion_cache:
                return package_conversion_cache[cache_key]
            cursor.execute("""
                SELECT package_unit, base_unit, base_quantity
                FROM product_unit_conversions
                WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(%s))
            """, (product_name,))
            result = None
            for rule in cursor.fetchall() or []:
                if normalize_unit(rule.get('package_unit')) == cache_key[1]:
                    try:
                        amount = float(rule.get('base_quantity'))
                    except (TypeError, ValueError):
                        amount = 0
                    if amount > 0:
                        result = (normalize_unit(rule.get('base_unit')), amount)
                        break
            package_conversion_cache[cache_key] = result
            return result

        def unit_to_base(quantity, unit, product_name):
            """Return (dimension, base quantity), including configured package sizes."""
            normalized = normalize_unit(unit)
            if normalized in standard_units:
                dimension, factor = standard_units[normalized]
                return dimension, quantity * factor

            package_rule = get_package_rule(product_name, normalized)
            if package_rule:
                base_unit, package_quantity = package_rule
                if base_unit in standard_units:
                    dimension, factor = standard_units[base_unit]
                    return dimension, quantity * package_quantity * factor
            return None, None

        def convert_quantity(quantity, from_unit, to_unit, ingredient_name, product_name):
            """Convert using a graph of standard, ingredient and package rules.

            Each edge means: 1 unit_from = factor unit_to. This allows
            chained conversions such as cup -> ml -> gram when an
            ingredient-specific ml-to-gram rule is configured.
            """
            source = normalize_unit(from_unit)
            target = normalize_unit(to_unit)
            try:
                quantity = float(quantity)
            except (TypeError, ValueError):
                return None
            if not source or not target or quantity <= 0:
                return None
            if source == target:
                return quantity

            graph = {}

            def add_edge(left, right, factor):
                if not left or not right or left == right:
                    return
                try:
                    factor = float(factor)
                except (TypeError, ValueError):
                    return
                if factor <= 0:
                    return
                graph.setdefault(left, []).append((right, factor))

            # Standard conversions: connect all units within the same
            # dimension through their common base unit.
            units_by_dimension = {}
            for unit_name, (dimension, base_factor) in standard_units.items():
                units_by_dimension.setdefault(dimension, []).append((unit_name, base_factor))
            for dimension_units in units_by_dimension.values():
                for from_name, from_factor in dimension_units:
                    for to_name, to_factor in dimension_units:
                        if from_name != to_name:
                            add_edge(from_name, to_name, from_factor / to_factor)

            # Ingredient-specific rules. Factor semantics:
            # 1 from_unit = conversion_factor to_unit.
            ingredient_rules = get_ingredient_rules(ingredient_name)
            if not ingredient_rules and product_name:
                ingredient_rules = get_ingredient_rules(product_name)
            for rule in ingredient_rules:
                rule_from = normalize_unit(rule.get('from_unit'))
                rule_to = normalize_unit(rule.get('to_unit'))
                try:
                    factor = float(rule.get('conversion_factor'))
                except (TypeError, ValueError):
                    continue
                add_edge(rule_from, rule_to, factor)
                if factor > 0:
                    add_edge(rule_to, rule_from, 1.0 / factor)

            # Default kitchen measuring estimates requested for Home Needs.
            # These allow cooking spoons/cups to convert directly to mass
            # when the inventory is stored in g/kg. Ingredient-specific rules
            # above are added first and therefore take priority.
            # IMPORTANT: these are approximate kitchen defaults, not physical
            # density measurements. Different ingredients can weigh more or
            # less than these values for the same spoon/cup volume.
            kitchen_mass_estimates = {
                'tsp': ('g', 5.0),
                'tbsp': ('g', 15.0),
                'cup': ('g', 250.0),
                'piece': ('g', 130.0),
            }
            for measure_unit, (mass_unit, grams_per_measure) in kitchen_mass_estimates.items():
                add_edge(measure_unit, mass_unit, grams_per_measure)
                add_edge(mass_unit, measure_unit, 1.0 / grams_per_measure)

            # Product-specific package mappings. Factor semantics:
            # 1 package_unit = base_quantity base_unit.
            cursor.execute("""
                SELECT package_unit, base_unit, base_quantity
                FROM product_unit_conversions
                WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(%s))
            """, (product_name,))
            for rule in cursor.fetchall() or []:
                package_unit = normalize_unit(rule.get('package_unit'))
                base_unit = normalize_unit(rule.get('base_unit'))
                try:
                    base_quantity = float(rule.get('base_quantity'))
                except (TypeError, ValueError):
                    continue
                if base_quantity > 0:
                    add_edge(package_unit, base_unit, base_quantity)
                    add_edge(base_unit, package_unit, 1.0 / base_quantity)

            # Breadth-first search finds a valid chain without guessing.
            # The graph is small (only configured units), so this is cheap.
            from collections import deque
            queue = deque([(source, 1.0)])
            visited = {source}
            while queue:
                current, multiplier = queue.popleft()
                for next_unit, edge_factor in graph.get(current, []):
                    if next_unit in visited:
                        continue
                    next_multiplier = multiplier * edge_factor
                    if next_unit == target:
                        return quantity * next_multiplier
                    visited.add(next_unit)
                    queue.append((next_unit, next_multiplier))
            return None

        # -----------------------------------
        # CALCULATE REQUIRED STOCK
        # -----------------------------------

        required_by_product = {}

        for row in rows:

            pid = row['actual_product_id']

            # -----------------------------------
            # FALLBACK BY PRODUCT NAME
            # ONLY WITHIN CURRENT USER
            # -----------------------------------

            if not pid:

                name = str(
                    row['ingredient_name'] or ''
                ).strip()

                cursor.execute("""
                    SELECT
                        id,
                        product_name,
                        quantity,
                        unit,
                        expiry_date
                    FROM products
                    WHERE user_id = %s
                    ORDER BY id
                """, (user_id,))

                all_user_products = cursor.fetchall()
                # Resolve only against products owned by the logged-in user.
                # Prefer an exact normalized name. If none exists, use the
                # conservative canonical/alias matcher. Never select the first
                # of several possible products.
                requested_key = ingredient_key(name)
                exact_matches = [
                    item for item in all_user_products
                    if ingredient_key(item.get('product_name')) == requested_key
                ]

                if exact_matches:
                    candidate_matches = exact_matches
                else:
                    target_key = canonical_ingredient_name(name)
                    candidate_matches = [
                        item for item in all_user_products
                        if canonical_ingredient_name(item.get('product_name')) == target_key
                    ]

                # The database alias table is authoritative for Home Needs
                # aliases such as Cumins/Jeera -> Cumin Seeds. Apply it as a
                # second exact canonical-key pass when the helper module does
                # not already know a database-managed alias.
                if not candidate_matches:
                    alias_map = get_ingredient_alias_map(cursor)
                    target_key = alias_map.get(requested_key, requested_key)
                    candidate_matches = [
                        item for item in all_user_products
                        if alias_map.get(
                            ingredient_key(item.get('product_name')),
                            ingredient_key(item.get('product_name'))
                        ) == target_key
                    ]

                if len(candidate_matches) == 0:
                    conn.rollback()
                    return jsonify({
                        "error": (
                            f"No inventory product matches '{name}' "
                            "in your family account. Add the product or "
                            "select the correct inventory product for this ingredient. "
                            "No stock was changed."
                        ),
                        "ingredient": name,
                        "match_count": 0
                    }), 400

                if len(candidate_matches) > 1:
                    conn.rollback()
                    return jsonify({
                        "error": (
                            f"More than one inventory product matches '{name}'. "
                            "Please choose the intended product for this recipe "
                            "ingredient; the system will not guess. No stock was changed."
                        ),
                        "ingredient": name,
                        "match_count": len(candidate_matches),
                        "candidates": [
                            {
                                "id": item.get('id'),
                                "product_name": item.get('product_name'),
                                "unit": item.get('unit'),
                                "quantity": float(item.get('quantity') or 0)
                            }
                            for item in candidate_matches
                        ]
                    }), 409

                product = candidate_matches[0]

            else:

                product = {
                    'id': pid,
                    'product_name': row['product_name'],
                    'quantity': row['stock_quantity'],
                    'unit': row['stock_unit']
                }

            # -----------------------------------
            # VALIDATE RECIPE QUANTITY
            # -----------------------------------

            try:

                qty = float(
                    row['required_quantity']
                )

            except (TypeError, ValueError):

                qty = 0

            if qty <= 0:

                conn.rollback()

                return jsonify({
                    "error": (
                        f"Invalid recipe quantity "
                        f"for {row['ingredient_name']}"
                    )
                }), 400

            # Scale the original stored ingredient quantity for the
            # requested number of members. Never modify the saved recipe.
            base_servings = max(1, int(meal.get('servings') or 1))
            qty = qty * requested_servings / base_servings

            # -----------------------------------
            # CONVERT RECIPE QUANTITY TO STOCK UNIT
            # -----------------------------------

            ingredient_name = row['ingredient_name'] or product['product_name']
            qty_stock_units = convert_quantity(
                qty,
                row['unit'],
                product['unit'],
                ingredient_name,
                product['product_name']
            )

            if qty_stock_units is None or qty_stock_units <= 0:
                conn.rollback()
                return jsonify({
                    "error": (
                        f"Cannot safely convert {row['unit']} to "
                        f"{product['unit']} for {product['product_name']}. "
                        "Add a valid conversion in the ingredient or product "
                        "unit conversion settings. No stock was changed."
                    )
                }), 400

            pid = int(product['id'])

            if pid not in required_by_product:

                required_by_product[pid] = {
                    'product': product,
                    'quantity': 0.0
                }

            required_by_product[pid]['quantity'] += (
                qty_stock_units
            )

        # -----------------------------------
        # LOCK AND VALIDATE PRODUCTS
        # -----------------------------------

        for pid in sorted(required_by_product):

            cursor.execute("""
                SELECT
                    id,
                    product_name,
                    quantity,
                    unit,
                    expiry_date
                FROM products
                WHERE id = %s
                  AND user_id = %s
                FOR UPDATE
            """, (
                pid,
                user_id
            ))

            product = cursor.fetchone()

            if not product:

                conn.rollback()

                return jsonify({
                    "error": (
                        "An ingredient product no "
                        "longer exists"
                    )
                }), 404

            # Expiry is checked on the locked, user-owned inventory row.
            # This server-side check is authoritative even if the browser
            # warning is bypassed or inventory changed after the UI loaded.
            expiry_value = product.get('expiry_date')
            if expiry_value:
                if hasattr(expiry_value, 'date'):
                    expiry_date_value = expiry_value.date()
                else:
                    expiry_date_value = expiry_value

                if isinstance(expiry_date_value, str):
                    try:
                        expiry_date_value = date.fromisoformat(expiry_date_value[:10])
                    except (TypeError, ValueError):
                        expiry_date_value = None

                if expiry_date_value and expiry_date_value < date.today():
                    conn.rollback()
                    return jsonify({
                        "error": (
                            f"Cannot cook this meal because "
                            f"{product['product_name']} has expired. "
                            "Update the inventory first. No stock was changed "
                            "and no cooking history was recorded."
                        ),
                        "code": "EXPIRED_INGREDIENT",
                        "expired_products": [{
                            "product_id": int(product['id']),
                            "product_name": product['product_name'],
                            "expiry_date": (
                                expiry_date_value.isoformat()
                                if hasattr(expiry_date_value, 'isoformat')
                                else str(expiry_date_value)
                            )
                        }]
                    }), 409

            need = required_by_product[pid]['quantity']

            have = float(
                product['quantity'] or 0
            )

            if need > have + 1e-9:

                conn.rollback()

                return jsonify({
                    "error": (
                        f"Not enough "
                        f"{product['product_name']}. "
                        f"Required {need:g} "
                        f"{product['unit']}; "
                        f"available {have:g} "
                        f"{product['unit']}. "
                        "No stock was changed."
                    )
                }), 400

            required_by_product[pid]['product'] = product

        # -----------------------------------
        # RECORD CONSUMPTION
        # AND REDUCE STOCK
        # -----------------------------------

        today = date.today().isoformat()

        consumed = []

        for pid, item in required_by_product.items():

            product = item['product']

            qty = item['quantity']

            # -----------------------------------
            # SAVE CONSUMPTION WITH USER ID
            # -----------------------------------

            cursor.execute("""
                INSERT INTO consumption (
                    product_id,
                    quantity_used,
                    consumption_date,
                    user_id
                )
                VALUES (%s, %s, %s, %s)
            """, (
                pid,
                qty,
                today,
                user_id
            ))

            # -----------------------------------
            # UPDATE STOCK ONLY FOR USER
            # -----------------------------------

            cursor.execute("""
                UPDATE products
                SET quantity = quantity - %s
                WHERE id = %s
                  AND user_id = %s
            """, (
                qty,
                pid,
                user_id
            ))

            consumed.append({
                "product_id": pid,
                "product_name": product['product_name'],
                "quantity_used": qty,
                "unit": product['unit'],
                "remaining_quantity": (
                    float(product['quantity']) - qty
                )
            })

        # -----------------------------------
        # IDENTIFY WHETHER THIS IS A COMMUNITY RECIPE
        # -----------------------------------
        # Community recipes are copied into the user's meals table.
        # The mapping table keeps the original global recipe ID.
        cursor.execute("""
            SELECT global_recipe_id
            FROM user_global_recipe_imports
            WHERE user_id = %s
              AND meal_id = %s
            LIMIT 1
        """, (
            user_id,
            meal_id
        ))

        imported_recipe = cursor.fetchone()

        if imported_recipe:
            recipe_type = 'global'
            global_recipe_id = imported_recipe['global_recipe_id']
        else:
            recipe_type = 'custom'
            global_recipe_id = None

        # -----------------------------------
        # RECORD SUCCESSFUL MEAL COOKING
        # -----------------------------------
        # This insert is part of the same transaction as inventory
        # deduction and consumption recording. If it fails, the whole
        # cook operation rolls back and stock remains unchanged.
        cursor.execute("""
            INSERT INTO meal_cooking_history (
                user_id,
                meal_id,
                global_recipe_id,
                recipe_type,
                recipe_name_snapshot,
                servings
            )
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            user_id,
            meal_id,
            global_recipe_id,
            recipe_type,
            meal['meal_name'],
            requested_servings
        ))

        # Commit inventory, consumption and cooking history together.
        conn.commit()

        return jsonify({
            "message": (
                f"{meal['meal_name']} cooked successfully. "
                "Stock, consumption and cooking history updated."
            ),
            "meal_id": meal_id,
            "servings": requested_servings,
            "recipe_type": recipe_type,
            "consumed": consumed
        }), 200

    except Exception as e:

        conn.rollback()

        print(
            "Cook meal error:",
            e
        )

        return jsonify({
            "error": (
                "Failed to cook meal. "
                "No stock was changed."
            )
        }), 500

    finally:

        cursor.close()
        conn.close()


# -----------------------------------
# REGISTER FIREBASE CLOUD MESSAGING TOKEN
# -----------------------------------

@app.route('/register-fcm-token', methods=['POST'])
def register_fcm_token():
    connection = None
    cursor = None

    try:
        # FCM tokens must belong to the currently logged-in family/user.
        user_id = session.get('user_id')

        if not user_id:
            return jsonify({
                "success": False,
                "message": "Unauthorized"
            }), 401

        data = request.get_json(silent=True) or {}
        fcm_token = data.get('token')
        device_name = data.get(
            'device_name',
            'Home Needs Browser'
        )

        if not fcm_token:
            return jsonify({
                "success": False,
                "message": "FCM token is required"
            }), 400

        connection = get_connection()
        cursor = connection.cursor()

        # A browser/device token belongs to the currently
        # authenticated user. If the same browser is later used
        # by another account, its ownership is updated.
        cursor.execute(
            """
            SELECT id
            FROM notification_tokens
            WHERE fcm_token = %s
            LIMIT 1
            """,
            (fcm_token,)
        )

        existing_token = cursor.fetchone()

        if existing_token:
            cursor.execute(
                """
                UPDATE notification_tokens
                SET
                    device_name = %s,
                    user_id = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    device_name,
                    user_id,
                    existing_token[0]
                )
            )
        else:
            cursor.execute(
                """
                INSERT INTO notification_tokens
                    (
                        fcm_token,
                        device_name,
                        created_at,
                        updated_at,
                        user_id
                    )
                VALUES
                    (%s, %s, NOW(), NOW(), %s)
                """,
                (
                    fcm_token,
                    device_name,
                    user_id
                )
            )

        connection.commit()

        return jsonify({
            "success": True,
            "message": "FCM token registered successfully"
        }), 200

    except Exception as error:
        if connection:
            connection.rollback()

        print(
            "FCM token registration error:",
            error
        )

        return jsonify({
            "success": False,
            "message": "Failed to register FCM token"
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


# -----------------------------------
# SEND TEST PUSH NOTIFICATION
# Local development endpoint; protect or remove before public deployment.
# -----------------------------------

@app.route('/send-test-notification', methods=['POST'])
def send_test_notification():
    connection = None
    cursor = None

    try:
        # Send only to a token belonging to the logged-in user.
        user_id = session.get('user_id')

        if not user_id:
            return jsonify({
                "success": False,
                "message": "Unauthorized"
            }), 401

        connection = get_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT id, fcm_token
            FROM notification_tokens
            WHERE user_id = %s
            ORDER BY updated_at DESC, id DESC
            LIMIT 1
            """,
            (user_id,)
        )

        token_row = cursor.fetchone()

        if not token_row:
            return jsonify({
                "success": False,
                "message": "No registered FCM token found for this user"
            }), 404

        token_id, fcm_token = token_row

        message = messaging.Message(
            notification=messaging.Notification(
                title="Home Needs Test",
                body=(
                    "Success! Your Home Needs push "
                    "notifications are working."
                )
            ),
            token=fcm_token
        )

        message_id = messaging.send(message)

        # Refresh the token's last-used time.
        cursor.execute(
            """
            UPDATE notification_tokens
            SET updated_at = NOW()
            WHERE id = %s
              AND user_id = %s
            """,
            (token_id, user_id)
        )
        connection.commit()

        print(
            "Test notification sent:",
            message_id,
            "for user:",
            user_id
        )

        return jsonify({
            "success": True,
            "message": "Test notification sent successfully"
        }), 200

    except Exception as error:
        if connection:
            connection.rollback()

        print(
            "Test notification error:",
            error
        )

        return jsonify({
            "success": False,
            "message": str(error)
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


# ============================================================
# HOME NEEDS - PERSISTENT SMART NOTIFICATIONS
# ============================================================


def _notification_category(notification_type):
    if notification_type.startswith("expiry"):
        return "Expiry"
    if notification_type == "low_stock":
        return "Low Stock"
    if notification_type.startswith("ai_runout"):
        return "AI Prediction"
    return "Reminder"


def _create_user_notification(
    cursor, user_id, product_id, notification_type, title, message
):
    """Save one user-scoped alert per product/type/day and send best-effort FCM."""
    today = datetime.now(IST).date()

    # INSERT IGNORE is safe when two requests generate the same alert together.
    # The matching unique key must include user_id (see SQL migration).
    cursor.execute("""
        INSERT IGNORE INTO notification_history
            (user_id, product_id, notification_type, title, message,
             is_read, notification_date)
        VALUES (%s, %s, %s, %s, %s, 0, %s)
    """, (user_id, product_id, notification_type, title, message, today))

    # A duplicate means the alert already exists; do not send another push.
    if cursor.rowcount == 0:
        return False

    # Push delivery is best-effort. A stale FCM token is removed so it is not
    # retried on every later notification. History remains saved regardless.
    try:
        cursor.execute("""
            SELECT id, fcm_token
            FROM notification_tokens
            WHERE user_id = %s
        """, (user_id,))
        token_rows = cursor.fetchall() or []

        for token_row in token_rows:
            if isinstance(token_row, dict):
                token_id = token_row.get("id")
                token = token_row.get("fcm_token")
            else:
                token_id, token = token_row[0], token_row[1]

            if not token:
                continue

            try:
                push = messaging.Message(
                    notification=messaging.Notification(title=title, body=message),
                    data={
                        "type": str(notification_type),
                        "product_id": str(product_id)
                    },
                    token=token
                )
                messaging.send(push)
            except Exception as push_error:
                error_code = str(getattr(push_error, "code", "") or "")
                error_text = str(push_error).lower()
                token_is_invalid = (
                    "registration-token-not-registered" in error_code
                    or "invalid-registration-token" in error_code
                    or "device unregistered" in error_text
                    or "registration token is not a valid" in error_text
                )

                if token_is_invalid and token_id is not None:
                    cursor.execute("""
                        DELETE FROM notification_tokens
                        WHERE id = %s AND user_id = %s
                    """, (token_id, user_id))
                    print("Removed unregistered FCM token for user:", user_id)
                else:
                    print("FCM notification delivery failed:", push_error)

    except Exception as token_error:
        print("FCM token lookup failed:", token_error)

    return True


def _ensure_user_reminder_settings(cursor, user_id):
    cursor.execute("""
        SELECT *
        FROM reminder_settings
        WHERE user_id = %s
        LIMIT 1
    """, (user_id,))
    settings = cursor.fetchone()

    if settings:
        return settings

    cursor.execute("""
        INSERT INTO reminder_settings
            (expiry_reminder_days, low_stock_threshold,
             expiry_notifications_enabled, low_stock_notifications_enabled,
             ai_notifications_enabled, reminder_time,
             created_at, updated_at, user_id)
        VALUES (3, 1.00, TRUE, TRUE, TRUE, '08:00:00', NOW(), NOW(), %s)
    """, (user_id,))

    cursor.execute("""
        SELECT *
        FROM reminder_settings
        WHERE user_id = %s
        LIMIT 1
    """, (user_id,))
    return cursor.fetchone()


def _generate_notifications_for_user(cursor, user_id):
    """Generate expiry, low-stock and existing-model AI alerts for one user."""
    today = datetime.now(IST).date()
    created_count = 0
    settings = _ensure_user_reminder_settings(cursor, user_id)

    # Product-specific settings override general settings where supplied.
    cursor.execute("""
        SELECT
            p.id AS product_id,
            p.product_name,
            p.quantity,
            p.unit,
            p.expiry_date,
            COALESCE(prs.expiry_reminder_days, rs.expiry_reminder_days)
                AS effective_expiry_days,
            COALESCE(prs.low_stock_threshold, rs.low_stock_threshold)
                AS effective_low_stock_threshold,
            COALESCE(prs.expiry_notifications_enabled, rs.expiry_notifications_enabled)
                AS expiry_enabled,
            COALESCE(prs.low_stock_notifications_enabled, rs.low_stock_notifications_enabled)
                AS low_stock_enabled
        FROM products p
        JOIN reminder_settings rs ON rs.user_id = p.user_id
        LEFT JOIN product_reminder_settings prs
            ON prs.product_id = p.id AND prs.user_id = p.user_id
        WHERE p.user_id = %s
          AND COALESCE(p.is_archived, 0) = 0
        ORDER BY p.product_name
    """, (user_id,))
    products = cursor.fetchall() or []

    for product in products:
        product_id = product["product_id"]
        product_name = product.get("product_name") or "Product"

        # 1. EXPIRY
        expiry = product.get("expiry_date")
        if product.get("expiry_enabled") and expiry is not None and float(product.get("quantity") or 0) > 0:
            if isinstance(expiry, datetime):
                expiry = expiry.date()
            elif isinstance(expiry, str):
                try:
                    expiry = date.fromisoformat(expiry[:10])
                except ValueError:
                    expiry = None

            if expiry:
                days_left = (expiry - today).days
                expiry_alert = None
                if days_left < 0:
                    expiry_alert = (
                        "expiry_expired", product_name + " has expired",
                        product_name + " expired " + str(abs(days_left)) + " day(s) ago. Please check it."
                    )
                elif days_left == 0:
                    expiry_alert = (
                        "expiry_today", product_name + " expires today",
                        "Please use or check " + product_name + " today."
                    )
                elif days_left == 1:
                    expiry_alert = (
                        "expiry_1_day", product_name + " expires tomorrow",
                        product_name + " will expire tomorrow."
                    )
                elif days_left in (3, 7):
                    expiry_alert = (
                        "expiry_" + str(days_left) + "_days",
                        product_name + " expires in " + str(days_left) + " days",
                        product_name + " will expire in " + str(days_left) + " days."
                    )
                elif 1 < days_left <= int(product.get("effective_expiry_days") or 0):
                    expiry_alert = (
                        "expiry_custom_" + str(days_left),
                        product_name + " is nearing expiry",
                        product_name + " expires in " + str(days_left) + " day(s)."
                    )

                if expiry_alert and _create_user_notification(
                    cursor, user_id, product_id, *expiry_alert
                ):
                    created_count += 1

        # 2. LOW STOCK - notify once per low-stock episode.
        try:
            quantity = float(product.get("quantity") or 0)
            threshold = float(product.get("effective_low_stock_threshold") or 0)
        except (TypeError, ValueError):
            quantity, threshold = 0, 0

        cursor.execute("""
            SELECT id, is_active
            FROM notification_states
            WHERE user_id = %s AND product_id = %s
              AND notification_type = 'low_stock'
            LIMIT 1
        """, (user_id, product_id))
        state = cursor.fetchone()

        if quantity > threshold:
            if state and state.get("is_active"):
                cursor.execute("""
                    UPDATE notification_states
                    SET is_active = 0
                    WHERE id = %s AND user_id = %s
                """, (state["id"], user_id))
        elif product.get("low_stock_enabled"):
            if not (state and state.get("is_active")):
                low_stock_created = _create_user_notification(
                    cursor,
                    user_id,
                    product_id,
                    "low_stock",
                    product_name + " is running low",
                    "Current stock: " + str(quantity) + " " + str(product.get("unit") or "") + ". Please consider purchasing more."
                )
                if state:
                    cursor.execute("""
                        UPDATE notification_states
                        SET is_active = 1,
                            last_notified_at = NOW()
                        WHERE id = %s AND user_id = %s
                    """, (state["id"], user_id))
                else:
                    cursor.execute("""
                        INSERT INTO notification_states
                            (user_id, product_id, notification_type, is_active, last_notified_at)
                        VALUES (%s, %s, 'low_stock', 1, NOW())
                    """, (user_id, product_id))
                if low_stock_created:
                    created_count += 1

    # 3. AI PREDICTION - reuse the existing per-user prediction function.
    if settings.get("ai_notifications_enabled"):
        for product in products:
            try:
                available_quantity = float(product.get("quantity") or 0)
            except (TypeError, ValueError):
                print(
                    "Skipping AI notification for product with invalid quantity:",
                    product.get("product_id")
                )
                continue

            if available_quantity <= 0:
                continue

            prediction_product = {
                "product_id": product["product_id"],
                "product_name": product.get("product_name"),
                "current_stock": product.get("quantity"),
                "unit": product.get("unit")
            }
            prediction = _build_product_prediction(
                cursor, prediction_product, user_id, today=today
            )
            days = prediction.get("days_remaining")
            if days is None:
                continue
            days = int(days)

            if days <= 1:
                stage = "ai_runout_1_day"
                title = prediction_product["product_name"] + " may run out soon"
                message = prediction_product["product_name"] + " may run out tomorrow or earlier based on its consumption history."
            elif days == 3:
                stage = "ai_runout_3_days"
                title = prediction_product["product_name"] + " may run out in 3 days"
                message = prediction_product["product_name"] + " may run out in about " + str(days) + " day(s), based on its consumption history."
            elif days == 7:
                stage = "ai_runout_7_days"
                title = prediction_product["product_name"] + " may run out this week"
                message = prediction_product["product_name"] + " may run out in about " + str(days) + " day(s), based on its consumption history."
            else:
                continue

            if _create_user_notification(
                cursor, user_id, prediction_product["product_id"],
                stage, title, message
            ):
                created_count += 1

    return created_count


@app.route('/notifications', methods=['GET'])
def get_notifications():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        # Notifications are generated by the separate IST scheduler.
        # This endpoint only returns already-saved notification history.
        cursor.execute("""
            SELECT nh.id, nh.product_id, nh.notification_type,
                   nh.title, nh.message, nh.is_read, nh.read_at,
                   nh.notification_date, nh.created_at, p.product_name
            FROM notification_history nh
            LEFT JOIN products p
                ON p.id = nh.product_id AND p.user_id = nh.user_id
            WHERE nh.user_id = %s
            ORDER BY nh.created_at DESC, nh.id DESC
            LIMIT 200
        """, (user_id,))
        rows = cursor.fetchall() or []
        for row in rows:
            row["category"] = _notification_category(row.get("notification_type") or "")
            row["is_read"] = bool(row.get("is_read"))
            for field in ("notification_date", "read_at", "created_at"):
                value = row.get(field)
                if hasattr(value, "isoformat"):
                    row[field] = value.isoformat()

        cursor.execute("""
            SELECT COUNT(*) AS unread_count
            FROM notification_history
            WHERE user_id = %s AND is_read = 0
        """, (user_id,))
        unread = cursor.fetchone() or {}
        return jsonify({
            "notifications": rows,
            "unread_count": int(unread.get("unread_count") or 0)
        }), 200
    except Exception as error:
        connection.rollback()
        print("Get notifications error:", error)
        return jsonify({"message": "Failed to fetch notifications"}), 500
    finally:
        cursor.close()
        connection.close()


@app.route('/notifications/<int:notification_id>/read', methods=['PUT'])
def mark_notification_read(notification_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401
    connection = get_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("""
            UPDATE notification_history
            SET is_read = 1, read_at = NOW()
            WHERE id = %s AND user_id = %s
        """, (notification_id, user_id))
        connection.commit()
        if cursor.rowcount == 0:
            return jsonify({"message": "Notification not found"}), 404
        return jsonify({"success": True, "message": "Notification marked as read"}), 200
    except Exception as error:
        connection.rollback()
        print("Mark notification read error:", error)
        return jsonify({"message": "Unable to update notification"}), 500
    finally:
        cursor.close()
        connection.close()


@app.route('/notifications/read-all', methods=['PUT'])
def mark_all_notifications_read():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401
    connection = get_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("""
            UPDATE notification_history
            SET is_read = 1, read_at = NOW()
            WHERE user_id = %s AND is_read = 0
        """, (user_id,))
        connection.commit()
        return jsonify({"success": True, "message": "All notifications marked as read"}), 200
    except Exception as error:
        connection.rollback()
        print("Mark all notifications error:", error)
        return jsonify({"message": "Unable to update notifications"}), 500
    finally:
        cursor.close()
        connection.close()


@app.route('/notifications/<int:notification_id>', methods=['DELETE'])
def delete_notification(notification_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401
    connection = get_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("""
            DELETE FROM notification_history
            WHERE id = %s AND user_id = %s
        """, (notification_id, user_id))
        connection.commit()
        if cursor.rowcount == 0:
            return jsonify({"message": "Notification not found"}), 404
        return jsonify({"success": True, "message": "Notification deleted"}), 200
    except Exception as error:
        connection.rollback()
        print("Delete notification error:", error)
        return jsonify({"message": "Unable to delete notification"}), 500
    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# GENERAL REMINDER SETTINGS
# -----------------------------------

@app.route('/reminder-settings', methods=['GET'])
def get_reminder_settings():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Get settings only for the logged-in user.
        cursor.execute(
            """
            SELECT
                id,
                expiry_reminder_days,
                low_stock_threshold,
                expiry_notifications_enabled,
                low_stock_notifications_enabled,
                ai_notifications_enabled,
                reminder_time
            FROM reminder_settings
            WHERE user_id = %s
            LIMIT 1
            """,
            (user_id,)
        )

        settings = cursor.fetchone()

        # First-time users receive their own default settings.
        if not settings:
            cursor.execute(
                """
                INSERT INTO reminder_settings
                    (
                        expiry_reminder_days,
                        low_stock_threshold,
                        expiry_notifications_enabled,
                        low_stock_notifications_enabled,
                        ai_notifications_enabled,
                        reminder_time,
                        created_at,
                        updated_at,
                        user_id
                    )
                VALUES
                    (3, 1.00, TRUE, TRUE, TRUE,
                     '08:00:00', NOW(), NOW(), %s)
                """,
                (user_id,)
            )

            connection.commit()

            cursor.execute(
                """
                SELECT
                    id,
                    expiry_reminder_days,
                    low_stock_threshold,
                    expiry_notifications_enabled,
                    low_stock_notifications_enabled,
                    ai_notifications_enabled,
                    reminder_time
                FROM reminder_settings
                WHERE user_id = %s
                LIMIT 1
                """,
                (user_id,)
            )

            settings = cursor.fetchone()

        # MySQL Connector may return a TIME column as either
        # datetime.time or datetime.timedelta. Convert both
        # forms to a JSON-safe HH:MM:SS string.
        if settings and settings.get('reminder_time') is not None:
            reminder_time = settings['reminder_time']

            if hasattr(reminder_time, 'strftime'):
                settings['reminder_time'] = reminder_time.strftime('%H:%M:%S')
            elif isinstance(reminder_time, timedelta):
                total_seconds = int(reminder_time.total_seconds())
                hours = (total_seconds // 3600) % 24
                minutes = (total_seconds % 3600) // 60
                seconds = total_seconds % 60

                settings['reminder_time'] = (
                    f'{hours:02d}:{minutes:02d}:{seconds:02d}'
                )
            else:
                settings['reminder_time'] = str(reminder_time)

        return jsonify(settings), 200

    except Exception as error:
        print(
            "Get reminder settings error:",
            error
        )

        return jsonify({
            "message": "Failed to fetch reminder settings"
        }), 500

    finally:
        cursor.close()
        connection.close()


@app.route('/reminder-settings', methods=['PUT'])
def update_reminder_settings():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    data = request.get_json(silent=True) or {}

    try:
        expiry_days = int(
            data.get(
                'expiry_reminder_days',
                3
            )
        )

        low_stock_threshold = float(
            data.get(
                'low_stock_threshold',
                1
            )
        )

        reminder_time = str(
            data.get(
                'reminder_time',
                '08:00'
            )
        ).strip()

        from datetime import datetime

        if len(reminder_time) == 5:
            datetime.strptime(
                reminder_time,
                '%H:%M'
            )
            reminder_time += ':00'
        else:
            datetime.strptime(
                reminder_time,
                '%H:%M:%S'
            )

        if expiry_days < 0 or expiry_days > 365:
            return jsonify({
                "message": (
                    "Expiry reminder days must be "
                    "between 0 and 365"
                )
            }), 400

        if low_stock_threshold < 0:
            return jsonify({
                "message": (
                    "Low-stock threshold cannot "
                    "be negative"
                )
            }), 400

    except (TypeError, ValueError):
        return jsonify({
            "message": (
                "Invalid reminder settings values"
            )
        }), 400

    expiry_enabled = bool(
        data.get(
            'expiry_notifications_enabled',
            True
        )
    )

    low_stock_enabled = bool(
        data.get(
            'low_stock_notifications_enabled',
            True
        )
    )

    ai_enabled = bool(
        data.get(
            'ai_notifications_enabled',
            True
        )
    )

    connection = get_connection()
    cursor = connection.cursor()

    try:
        # Each user/family has its own settings row.
        cursor.execute(
            """
            SELECT id
            FROM reminder_settings
            WHERE user_id = %s
            LIMIT 1
            """,
            (user_id,)
        )

        existing = cursor.fetchone()

        if existing:
            cursor.execute(
                """
                UPDATE reminder_settings
                SET
                    expiry_reminder_days = %s,
                    low_stock_threshold = %s,
                    expiry_notifications_enabled = %s,
                    low_stock_notifications_enabled = %s,
                    ai_notifications_enabled = %s,
                    reminder_time = %s,
                    updated_at = NOW()
                WHERE id = %s
                  AND user_id = %s
                """,
                (
                    expiry_days,
                    low_stock_threshold,
                    expiry_enabled,
                    low_stock_enabled,
                    ai_enabled,
                    reminder_time,
                    existing[0],
                    user_id
                )
            )
        else:
            cursor.execute(
                """
                INSERT INTO reminder_settings
                    (
                        expiry_reminder_days,
                        low_stock_threshold,
                        expiry_notifications_enabled,
                        low_stock_notifications_enabled,
                        ai_notifications_enabled,
                        reminder_time,
                        created_at,
                        updated_at,
                        user_id
                    )
                VALUES
                    (%s, %s, %s, %s, %s, %s,
                     NOW(), NOW(), %s)
                """,
                (
                    expiry_days,
                    low_stock_threshold,
                    expiry_enabled,
                    low_stock_enabled,
                    ai_enabled,
                    reminder_time,
                    user_id
                )
            )

        connection.commit()

        return jsonify({
            "message": (
                "Reminder settings saved successfully"
            )
        }), 200

    except Exception as error:
        connection.rollback()

        print(
            "Update reminder settings error:",
            error
        )

        return jsonify({
            "message": "Failed to save reminder settings"
        }), 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# PRODUCT-SPECIFIC REMINDER SETTINGS
# NULL values inherit the general setting.
# -----------------------------------

@app.route('/product-reminder-settings', methods=['GET'])
def get_product_reminder_settings():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Make sure this user has a general reminder row.
        cursor.execute(
            """
            SELECT
                id,
                expiry_reminder_days,
                low_stock_threshold,
                expiry_notifications_enabled,
                low_stock_notifications_enabled
            FROM reminder_settings
            WHERE user_id = %s
            LIMIT 1
            """,
            (user_id,)
        )

        general_settings = cursor.fetchone()

        if not general_settings:
            cursor.execute(
                """
                INSERT INTO reminder_settings
                    (
                        expiry_reminder_days,
                        low_stock_threshold,
                        expiry_notifications_enabled,
                        low_stock_notifications_enabled,
                        reminder_time,
                        created_at,
                        updated_at,
                        user_id
                    )
                VALUES
                    (3, 1.00, TRUE, TRUE,
                     '08:00:00', NOW(), NOW(), %s)
                """,
                (user_id,)
            )

            connection.commit()

        cursor.execute(
            """
            SELECT
                p.id AS product_id,
                p.product_name,
                p.quantity,
                p.unit,

                prs.expiry_reminder_days,
                prs.low_stock_threshold,
                prs.expiry_notifications_enabled,
                prs.low_stock_notifications_enabled,

                COALESCE(
                    prs.expiry_reminder_days,
                    rs.expiry_reminder_days
                ) AS effective_expiry_reminder_days,

                COALESCE(
                    prs.low_stock_threshold,
                    rs.low_stock_threshold
                ) AS effective_low_stock_threshold,

                COALESCE(
                    prs.expiry_notifications_enabled,
                    rs.expiry_notifications_enabled
                ) AS effective_expiry_notifications_enabled,

                COALESCE(
                    prs.low_stock_notifications_enabled,
                    rs.low_stock_notifications_enabled
                ) AS effective_low_stock_notifications_enabled

            FROM products p

            JOIN reminder_settings rs
                ON rs.user_id = %s

            LEFT JOIN product_reminder_settings prs
                ON prs.product_id = p.id
               AND prs.user_id = %s

            WHERE p.user_id = %s

            ORDER BY p.product_name
            """,
            (
                user_id,
                user_id,
                user_id
            )
        )

        return jsonify(cursor.fetchall()), 200

    except Exception as error:
        print(
            "Get product reminder settings error:",
            error
        )

        return jsonify({
            "message": (
                "Failed to fetch product "
                "reminder settings"
            )
        }), 500

    finally:
        cursor.close()
        connection.close()


@app.route('/product-reminder-settings/<int:product_id>', methods=['PUT'])
def update_product_reminder_settings(product_id):

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Unauthorized"
        }), 401

    data = request.get_json(silent=True) or {}

    def optional_int(value, field):
        if value is None or value == '':
            return None

        number = int(value)

        if number < 0 or number > 365:
            raise ValueError(
                f"{field} must be between 0 and 365"
            )

        return number

    def optional_float(value, field):
        if value is None or value == '':
            return None

        number = float(value)

        if number < 0:
            raise ValueError(
                f"{field} cannot be negative"
            )

        return number

    try:
        expiry_days = optional_int(
            data.get('expiry_reminder_days'),
            'Expiry reminder days'
        )

        low_stock_threshold = optional_float(
            data.get('low_stock_threshold'),
            'Low-stock threshold'
        )

    except (TypeError, ValueError) as error:
        return jsonify({
            "message": str(error) or "Invalid settings"
        }), 400

    expiry_enabled = data.get(
        'expiry_notifications_enabled'
    )

    low_stock_enabled = data.get(
        'low_stock_notifications_enabled'
    )

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Product must belong to the logged-in user.
        cursor.execute(
            """
            SELECT id
            FROM products
            WHERE id = %s
              AND user_id = %s
            LIMIT 1
            """,
            (
                product_id,
                user_id
            )
        )

        if not cursor.fetchone():
            return jsonify({
                "message": (
                    "Product not found or does "
                    "not belong to this user"
                )
            }), 404

        # product_id is UNIQUE in this table. Look up the row by
        # product_id so legacy rows with a NULL user_id can be safely
        # claimed by the verified owner of the product.
        cursor.execute(
            """
            SELECT id
            FROM product_reminder_settings
            WHERE product_id = %s
            LIMIT 1
            """,
            (product_id,)
        )

        existing = cursor.fetchone()

        if existing:
            # When a toggle is omitted, keep its current value.
            cursor.execute(
                """
                UPDATE product_reminder_settings
                SET
                    expiry_reminder_days = %s,
                    low_stock_threshold = %s,
                    expiry_notifications_enabled =
                        COALESCE(
                            %s,
                            expiry_notifications_enabled
                        ),
                    low_stock_notifications_enabled =
                        COALESCE(
                            %s,
                            low_stock_notifications_enabled
                        ),
                    updated_at = NOW()
                WHERE id = %s
                  AND product_id = %s
                """,
                (
                    expiry_days,
                    low_stock_threshold,
                    expiry_enabled,
                    low_stock_enabled,
                    existing['id'],
                    product_id
                )
            )
        else:
            # New product-specific rows inherit the global
            # notification toggles as enabled by default.
            cursor.execute(
                """
                INSERT INTO product_reminder_settings
                    (
                        product_id,
                        expiry_reminder_days,
                        low_stock_threshold,
                        expiry_notifications_enabled,
                        low_stock_notifications_enabled,
                        created_at,
                        updated_at,
                        user_id
                    )
                VALUES
                    (
                        %s, %s, %s,
                        COALESCE(%s, TRUE),
                        COALESCE(%s, TRUE),
                        NOW(), NOW(), %s
                    )
                """,
                (
                    product_id,
                    expiry_days,
                    low_stock_threshold,
                    expiry_enabled,
                    low_stock_enabled,
                    user_id
                )
            )

        connection.commit()

        return jsonify({
            "message": (
                "Product reminder settings "
                "saved successfully"
            )
        }), 200

    except Exception as error:
        connection.rollback()

        print(
            "Update product reminder settings error:",
            error
        )

        return jsonify({
            "message": (
                "Failed to save product "
                "reminder settings"
            )
        }), 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# ANALYTICS DASHBOARD API
# -----------------------------------

from datetime import date


# -----------------------------------
# USER / FAMILY FOOD PREFERENCES
# -----------------------------------

@app.route('/user-preferences', methods=['GET'])
def get_user_preferences():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT *
            FROM user_preferences
            WHERE user_id = %s
            LIMIT 1
        """, (user_id,))

        preferences = cursor.fetchone()

        # Create a separate default preference record
        # for each new user's account.
        if not preferences:
            cursor.execute("""
                INSERT INTO user_preferences (
                    user_id,
                    household_name,
                    family_members,
                    food_preference,
                    cooking_preference,
                    non_veg_restriction_days,
                    meal_suggestions,
                    created_at,
                    updated_at
                )
                VALUES (
                    %s, '', '1', 'Vegetarian',
                    'Quick Meals', '[]', TRUE, NOW(), NOW()
                )
            """, (user_id,))

            connection.commit()

            cursor.execute("""
                SELECT *
                FROM user_preferences
                WHERE user_id = %s
                LIMIT 1
            """, (user_id,))

            preferences = cursor.fetchone()

        # Convert stored TEXT into a Python list.
        try:
            preferences['non_veg_restriction_days'] = json.loads(
                preferences.get('non_veg_restriction_days') or '[]'
            )
        except (TypeError, ValueError):
            preferences['non_veg_restriction_days'] = []

        # Convert database dates into JSON-safe strings.
        for field in ('non_veg_start_date', 'non_veg_end_date'):
            value = preferences.get(field)
            preferences[field] = value.isoformat() if value else ''

        preferences['meal_suggestions'] = bool(
            preferences.get('meal_suggestions', True)
        )

        return jsonify({
            "success": True,
            "preferences": preferences
        }), 200

    except Exception as error:
        connection.rollback()
        print("Get user preferences error:", error)

        return jsonify({
            "message": "Failed to load user preferences"
        }), 500

    finally:
        cursor.close()
        connection.close()


@app.route('/user-preferences', methods=['PUT'])
def update_user_preferences():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}

    # Validate preference values.
    food_preference = str(
        data.get('foodPreference', 'Vegetarian')
    ).strip()

    cooking_preference = str(
        data.get('cookingPreference', 'Quick Meals')
    ).strip()

    allowed_food_preferences = [
        'Vegetarian',
        'Non-Vegetarian',
        'Both'
    ]

    allowed_cooking_preferences = [
        'Quick Meals',
        'Healthy Meals',
        'Traditional Meals',
        'All Types'
    ]

    if food_preference not in allowed_food_preferences:
        return jsonify({"message": "Invalid food preference"}), 400

    if cooking_preference not in allowed_cooking_preferences:
        return jsonify({"message": "Invalid cooking preference"}), 400

    household_name = str(
        data.get('householdName', '')
    ).strip()

    family_members = str(
        data.get('familyMembers', '1')
    ).strip()

    if family_members not in ['1', '2', '3', '4', '5+']:
        return jsonify({"message": "Invalid family member count"}), 400

    restriction_days = data.get('nonVegRestrictionDays', [])

    allowed_days = [
        'Monday', 'Tuesday', 'Wednesday', 'Thursday',
        'Friday', 'Saturday', 'Sunday'
    ]

    if not isinstance(restriction_days, list):
        return jsonify({"message": "Restriction days must be a list"}), 400

    if any(day not in allowed_days for day in restriction_days):
        return jsonify({"message": "Invalid restriction day"}), 400

    start_date = data.get('nonVegStartDate') or None
    end_date = data.get('nonVegEndDate') or None

    try:
        if bool(start_date) != bool(end_date):
            return jsonify({
                "message": "Please provide both restriction dates"
            }), 400

        if start_date and end_date:
            start_date = datetime.strptime(
                start_date, '%Y-%m-%d'
            ).date()

            end_date = datetime.strptime(
                end_date, '%Y-%m-%d'
            ).date()

            if end_date < start_date:
                return jsonify({
                    "message": "End date must be on or after start date"
                }), 400

    except (TypeError, ValueError):
        return jsonify({"message": "Invalid restriction date"}), 400

    meal_suggestions = bool(
        data.get('mealSuggestions', True)
    )

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            INSERT INTO user_preferences (
                user_id,
                household_name,
                family_members,
                food_preference,
                cooking_preference,
                non_veg_restriction_days,
                non_veg_start_date,
                non_veg_end_date,
                meal_suggestions,
                created_at,
                updated_at
            )
            VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, NOW(), NOW()
            )
            ON DUPLICATE KEY UPDATE
                household_name = VALUES(household_name),
                family_members = VALUES(family_members),
                food_preference = VALUES(food_preference),
                cooking_preference = VALUES(cooking_preference),
                non_veg_restriction_days = VALUES(non_veg_restriction_days),
                non_veg_start_date = VALUES(non_veg_start_date),
                non_veg_end_date = VALUES(non_veg_end_date),
                meal_suggestions = VALUES(meal_suggestions),
                updated_at = NOW()
        """, (
            user_id,
            household_name,
            family_members,
            food_preference,
            cooking_preference,
            json.dumps(restriction_days),
            start_date,
            end_date,
            meal_suggestions
        ))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Family preferences saved successfully"
        }), 200

    except Exception as error:
        connection.rollback()
        print("Update user preferences error:", error)

        return jsonify({
            "message": "Failed to save family preferences"
        }), 500

    finally:
        cursor.close()
        connection.close()





@app.route('/analytics', methods=['GET'])
def get_analytics():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            "message": "Authentication required"
        }), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        today = date.today()

        # 1. Monthly spending and purchase count
        # Only purchases belonging to the logged-in user are included.
        cursor.execute("""
            SELECT
                COALESCE(SUM(total_price), 0)
                    AS monthly_spending,
                COUNT(*) AS products_purchased
            FROM purchases
            WHERE user_id = %s
              AND purchase_date >= DATE_FORMAT(
                    CURDATE(), '%Y-%m-01'
              )
              AND purchase_date < DATE_ADD(
                    DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                    INTERVAL 1 MONTH
              )
        """, (user_id,))

        summary = cursor.fetchone()

        # 2. Total consumption records
        # Only consumption belonging to the logged-in user is included.
        cursor.execute("""
            SELECT
                COUNT(*) AS products_consumed,
                COALESCE(SUM(quantity_used), 0)
                    AS total_quantity_used,
                MIN(consumption_date) AS first_usage_date
            FROM consumption
            WHERE user_id = %s
        """, (user_id,))

        consumption_data = cursor.fetchone()

        total_consumed = int(
            consumption_data['products_consumed'] or 0
        )

        total_quantity = float(
            consumption_data['total_quantity_used'] or 0
        )

        first_usage = consumption_data['first_usage_date']

        average_daily_usage = 0

        if first_usage:
            days_recorded = (
                today - first_usage
            ).days + 1

            if days_recorded > 0:
                average_daily_usage = (
                    total_quantity / days_recorded
                )

        # 3. Monthly spending for the last 5 months
        # Only the logged-in user's purchases are included.
        cursor.execute("""
            SELECT
                DATE_FORMAT(
                    purchase_date, '%Y-%m'
                ) AS month_key,

                DATE_FORMAT(
                    purchase_date, '%b'
                ) AS month,

                COALESCE(SUM(total_price), 0)
                    AS spending

            FROM purchases

            WHERE user_id = %s
              AND purchase_date >= DATE_SUB(
                    DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                    INTERVAL 4 MONTH
              )
              AND purchase_date < DATE_ADD(
                    DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                    INTERVAL 1 MONTH
              )

            GROUP BY
                DATE_FORMAT(purchase_date, '%Y-%m'),
                DATE_FORMAT(purchase_date, '%b')

            ORDER BY month_key
        """, (user_id,))

        monthly_rows = cursor.fetchall()

        # Fill missing months with zero spending
        monthly_spending = []

        for offset in range(4, -1, -1):

            cursor.execute("""
                SELECT
                    DATE_FORMAT(
                        DATE_SUB(
                            DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                            INTERVAL %s MONTH
                        ),
                        '%Y-%m'
                    ) AS month_key,

                    DATE_FORMAT(
                        DATE_SUB(
                            DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                            INTERVAL %s MONTH
                        ),
                        '%b'
                    ) AS month
            """, (offset, offset))

            month_info = cursor.fetchone()

            matching = next(
                (
                    row for row in monthly_rows
                    if str(row['month_key'])
                    == str(month_info['month_key'])
                ),
                None
            )

            monthly_spending.append({
                "month": month_info['month'],
                "spending": round(
                    float(matching['spending'] or 0)
                    if matching else 0,
                    2
                )
            })

        # 4. Most frequently purchased products
        # Join to products and scope BOTH tables to the logged-in user.
        cursor.execute("""
            SELECT
                p.product_name,
                COUNT(*) AS purchase_count,
                COALESCE(SUM(pr.quantity), 0)
                    AS total_quantity

            FROM purchases pr

            JOIN products p
                ON pr.product_id = p.id
               AND p.user_id = %s

            WHERE pr.user_id = %s

            GROUP BY
                p.id,
                p.product_name

            ORDER BY purchase_count DESC,
                     total_quantity DESC

            LIMIT 5
        """, (user_id, user_id))

        most_purchased = cursor.fetchall()

        for item in most_purchased:
            item['purchase_count'] = int(
                item['purchase_count'] or 0
            )

            item['total_quantity'] = float(
                item['total_quantity'] or 0
            )

        # 5. Previous month spending for insight
        # Only the logged-in user's purchases are included.
        cursor.execute("""
            SELECT
                COALESCE(SUM(total_price), 0)
                    AS previous_spending

            FROM purchases

            WHERE user_id = %s
              AND purchase_date >= DATE_SUB(
                    DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                    INTERVAL 1 MONTH
              )
              AND purchase_date < DATE_FORMAT(
                    CURDATE(), '%Y-%m-01'
              )
        """, (user_id,))

        previous_data = cursor.fetchone()

        current_spending = float(
            summary['monthly_spending'] or 0
        )

        previous_spending = float(
            previous_data['previous_spending'] or 0
        )

        spending_change = None

        if previous_spending > 0:
            spending_change = round(
                (
                    (current_spending - previous_spending)
                    / previous_spending
                ) * 100,
                1
            )

        # 6. Cooking patterns for the authenticated family.
        cursor.execute("""
            SELECT recipe_name_snapshot AS recipe_name, recipe_type,
                   COUNT(*) AS cook_count,
                   COALESCE(SUM(servings), 0) AS total_servings,
                   MAX(cooked_at) AS last_cooked_at
            FROM meal_cooking_history
            WHERE user_id = %s
            GROUP BY recipe_name_snapshot, recipe_type
            ORDER BY cook_count DESC, total_servings DESC
            LIMIT 5
        """, (user_id,))
        most_cooked_recipes = cursor.fetchall() or []
        for item in most_cooked_recipes:
            item["cook_count"] = int(item["cook_count"] or 0)
            item["total_servings"] = int(item["total_servings"] or 0)
            if item.get("last_cooked_at"):
                item["last_cooked_at"] = item["last_cooked_at"].isoformat(
                    sep=" ", timespec="seconds"
                )

        cursor.execute("""
            SELECT p.product_name, p.unit,
                   COUNT(*) AS usage_count,
                   COALESCE(SUM(c.quantity_used), 0) AS total_quantity_used
            FROM consumption c
            JOIN products p ON p.id = c.product_id AND p.user_id = %s
            WHERE c.user_id = %s
            GROUP BY p.id, p.product_name, p.unit
            ORDER BY total_quantity_used DESC, usage_count DESC
            LIMIT 5
        """, (user_id, user_id))
        most_consumed_ingredients = cursor.fetchall() or []
        for item in most_consumed_ingredients:
            item["usage_count"] = int(item["usage_count"] or 0)
            item["total_quantity_used"] = round(
                float(item["total_quantity_used"] or 0), 2
            )

        cursor.execute("""
            SELECT DATE_FORMAT(cooked_at, '%Y-%m') AS month_key,
                   DATE_FORMAT(cooked_at, '%b %Y') AS month,
                   COUNT(*) AS cooking_count,
                   COALESCE(SUM(servings), 0) AS servings
            FROM meal_cooking_history
            WHERE user_id = %s
              AND cooked_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
              AND cooked_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
            GROUP BY DATE_FORMAT(cooked_at, '%Y-%m'),
                     DATE_FORMAT(cooked_at, '%b %Y')
            ORDER BY month_key
        """, (user_id,))
        cooking_rows = cursor.fetchall() or []
        cooking_map = {str(row["month_key"]): row for row in cooking_rows}
        monthly_cooking_frequency = []
        for offset in range(5, -1, -1):
            cursor.execute("""
                SELECT
                    DATE_FORMAT(DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                        INTERVAL %s MONTH), '%Y-%m') AS month_key,
                    DATE_FORMAT(DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'),
                        INTERVAL %s MONTH), '%b %Y') AS month
            """, (offset, offset))
            month_info = cursor.fetchone()
            match = cooking_map.get(str(month_info["month_key"]))
            monthly_cooking_frequency.append({
                "month": month_info["month"],
                "cooking_count": int(match["cooking_count"] or 0) if match else 0,
                "servings": int(match["servings"] or 0) if match else 0
            })

        cursor.execute("""
            SELECT COUNT(*) AS total_cooking_events,
                   COALESCE(SUM(servings), 0) AS total_servings,
                   COUNT(DISTINCT recipe_name_snapshot) AS unique_recipes
            FROM meal_cooking_history
            WHERE user_id = %s
        """, (user_id,))
        cooking_summary = cursor.fetchone() or {}

        return jsonify({
            "monthly_spending": round(
                current_spending, 2
            ),

            "products_purchased": int(
                summary['products_purchased'] or 0
            ),

            "products_consumed": total_consumed,

            "average_daily_usage": round(
                average_daily_usage, 2
            ),

            "monthly_spending_chart": monthly_spending,

            "most_purchased": most_purchased,

            "spending_change": spending_change,

            "cooking_summary": {
                "total_cooking_events": int(cooking_summary.get("total_cooking_events") or 0),
                "total_servings": int(cooking_summary.get("total_servings") or 0),
                "unique_recipes": int(cooking_summary.get("unique_recipes") or 0)
            },
            "most_cooked_recipes": most_cooked_recipes,
            "most_consumed_ingredients": most_consumed_ingredients,
            "monthly_cooking_frequency": monthly_cooking_frequency,

            "message": "Analytics loaded successfully"
        }), 200

    except Exception as error:

        print("Analytics error:", error)

        return jsonify({
            "message": "Failed to load analytics data"
        }), 500

    finally:
        cursor.close()
        connection.close()



# -----------------------------------
# PRODUCT IMAGE GALLERY
# -----------------------------------

# 1. GET all shared gallery images
# -----------------------------------
# ADMIN INGREDIENT MASTER MANAGEMENT
# -----------------------------------

def _clean_ingredient_name(value):
    value = str(value or '').strip()
    if not value or len(value) > 150:
        raise ValueError('Ingredient names must contain 1 to 150 characters.')
    return value

def _ingredient_name_conflict(cursor, names, exclude_id=None):
    """Prevent a name from being canonical in one row and an alias elsewhere."""
    wanted = {ingredient_key(name) for name in names if ingredient_key(name)}
    cursor.execute("SELECT id, canonical_name FROM ingredient_master")
    for row in cursor.fetchall() or []:
        if exclude_id is not None and row['id'] == exclude_id:
            continue
        if ingredient_key(row['canonical_name']) in wanted:
            return True
    cursor.execute("""
        SELECT ia.ingredient_id, ia.alias_name
        FROM ingredient_aliases ia
    """)
    for row in cursor.fetchall() or []:
        if exclude_id is not None and row['ingredient_id'] == exclude_id:
            continue
        if ingredient_key(row['alias_name']) in wanted:
            return True
    return False

def _admin_ingredient_response(cursor):
    cursor.execute("""
        SELECT im.id, im.canonical_name, ia.id AS alias_id, ia.alias_name
        FROM ingredient_master im
        LEFT JOIN ingredient_aliases ia ON ia.ingredient_id = im.id
        ORDER BY im.canonical_name, ia.alias_name
    """)
    rows = cursor.fetchall() or []
    result = {}
    for row in rows:
        item = result.setdefault(row['id'], {
            'id': row['id'], 'canonical_name': row['canonical_name'], 'aliases': []
        })
        if row.get('alias_id') is not None:
            item['aliases'].append(row['alias_name'])
    return list(result.values())

@app.route('/admin/ingredient-master', methods=['GET'])
def admin_get_ingredient_master():
    user_id = session.get('user_id')
    if not user_id: return jsonify({'message': 'Unauthorized'}), 401
    conn = get_connection(); cursor = conn.cursor(dictionary=True)
    try:
        if not require_admin(cursor, user_id): return jsonify({'message': 'Forbidden: Admin access required'}), 403
        return jsonify(_admin_ingredient_response(cursor)), 200
    except Exception as e:
        print('Admin ingredient list error:', e)
        return jsonify({'error': 'Unable to load ingredients'}), 500
    finally:
        cursor.close(); conn.close()

@app.route('/ingredient-aliases', methods=['GET'])
def get_public_ingredient_aliases():
    user_id = session.get('user_id')
    if not user_id: return jsonify({'message': 'Unauthorized'}), 401
    conn = get_connection(); cursor = conn.cursor(dictionary=True)
    try:
        return jsonify({'aliases': get_ingredient_alias_map(cursor)}), 200
    except Exception as e:
        print('Ingredient alias lookup error:', e)
        return jsonify({'error': 'Unable to load ingredient aliases'}), 500
    finally:
        cursor.close(); conn.close()


@app.route('/admin/ingredient-master', methods=['POST'])
def admin_add_ingredient_master():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    data = request.get_json(silent=True) or {}

    try:
        canonical = _clean_ingredient_name(data.get('canonical_name'))
        aliases = data.get('aliases', [])

        if isinstance(aliases, str):
            aliases = aliases.split(',')

        if not isinstance(aliases, list):
            raise ValueError(
                'Aliases must be a list or comma-separated text.'
            )

        aliases = list(dict.fromkeys(
            _clean_ingredient_name(v)
            for v in aliases
            if str(v or '').strip()
        ))

        names = [canonical] + aliases
        keys = [ingredient_key(v) for v in names]

        if len(keys) != len(set(keys)):
            raise ValueError(
                'Canonical name and aliases must be different.'
            )

    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Start the transaction BEFORE executing SQL queries.
        conn.start_transaction()

        if not require_admin(cursor, user_id):
            conn.rollback()
            return jsonify({
                'message': 'Forbidden: Admin access required'
            }), 403

        if _ingredient_name_conflict(cursor, [canonical] + aliases):
            conn.rollback()
            return jsonify({
                'error': 'A canonical name or alias is already used by another ingredient.'
            }), 409

        cursor.execute(
            'INSERT INTO ingredient_master (canonical_name) VALUES (%s)',
            (canonical,)
        )

        ingredient_id = cursor.lastrowid

        for alias in aliases:
            cursor.execute(
                '''INSERT INTO ingredient_aliases
                   (ingredient_id, alias_name)
                   VALUES (%s, %s)''',
                (ingredient_id, alias)
            )

        conn.commit()

        return jsonify({
            'message': 'Ingredient added successfully',
            'id': ingredient_id
        }), 201

    except Exception as e:
        conn.rollback()
        print('Admin add ingredient error:', e)

        if getattr(e, 'errno', None) == 1062:
            return jsonify({
                'error': 'That ingredient name or alias is already registered.'
            }), 409

        return jsonify({
            'error': 'Unable to add ingredient'
        }), 500

    finally:
        cursor.close()
        conn.close()


@app.route('/admin/ingredient-master/<int:ingredient_id>', methods=['PUT'])
def admin_update_ingredient_master(ingredient_id):
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    data = request.get_json(silent=True) or {}

    try:
        canonical = _clean_ingredient_name(data.get('canonical_name'))
        aliases = data.get('aliases', [])

        if isinstance(aliases, str):
            aliases = aliases.split(',')

        if not isinstance(aliases, list):
            raise ValueError(
                'Aliases must be a list or comma-separated text.'
            )

        aliases = list(dict.fromkeys(
            _clean_ingredient_name(v)
            for v in aliases
            if str(v or '').strip()
        ))

        keys = [
            ingredient_key(v)
            for v in [canonical] + aliases
        ]

        if len(keys) != len(set(keys)):
            raise ValueError(
                'Canonical name and aliases must be different.'
            )

    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Start transaction before executing SQL queries.
        conn.start_transaction()

        if not require_admin(cursor, user_id):
            conn.rollback()
            return jsonify({
                'message': 'Forbidden: Admin access required'
            }), 403

        cursor.execute(
            'SELECT id FROM ingredient_master WHERE id = %s FOR UPDATE',
            (ingredient_id,)
        )

        if not cursor.fetchone():
            conn.rollback()
            return jsonify({
                'error': 'Ingredient not found'
            }), 404

        if _ingredient_name_conflict(
            cursor,
            [canonical] + aliases,
            exclude_id=ingredient_id
        ):
            conn.rollback()
            return jsonify({
                'error': 'A canonical name or alias is already used by another ingredient.'
            }), 409

        cursor.execute(
            '''UPDATE ingredient_master
               SET canonical_name = %s
               WHERE id = %s''',
            (canonical, ingredient_id)
        )

        cursor.execute(
            'DELETE FROM ingredient_aliases WHERE ingredient_id = %s',
            (ingredient_id,)
        )

        for alias in aliases:
            cursor.execute(
                '''INSERT INTO ingredient_aliases
                   (ingredient_id, alias_name)
                   VALUES (%s, %s)''',
                (ingredient_id, alias)
            )

        conn.commit()

        return jsonify({
            'message': 'Ingredient updated successfully'
        }), 200

    except Exception as e:
        conn.rollback()
        print('Admin update ingredient error:', e)

        if getattr(e, 'errno', None) == 1062:
            return jsonify({
                'error': 'That ingredient name or alias is already registered.'
            }), 409

        return jsonify({
            'error': 'Unable to update ingredient'
        }), 500

    finally:
        cursor.close()
        conn.close()

@app.route('/admin/ingredient-master/<int:ingredient_id>', methods=['DELETE'])
def admin_delete_ingredient_master(ingredient_id):
    user_id = session.get('user_id')
    if not user_id: return jsonify({'message': 'Unauthorized'}), 401
    conn = get_connection(); cursor = conn.cursor(dictionary=True)
    try:
        if not require_admin(cursor, user_id): return jsonify({'message': 'Forbidden: Admin access required'}), 403
        cursor.execute('DELETE FROM ingredient_master WHERE id = %s', (ingredient_id,))
        if cursor.rowcount == 0: return jsonify({'error': 'Ingredient not found'}), 404
        conn.commit()
        return jsonify({'message': 'Ingredient deleted successfully'}), 200
    except Exception as e:
        conn.rollback(); print('Admin delete ingredient error:', e)
        return jsonify({'error': 'Unable to delete ingredient'}), 500
    finally:
        cursor.close(); conn.close()


@app.route('/product-image-gallery', methods=['GET'])
def get_product_image_gallery():
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        category = request.args.get('category')

        if category:
            cursor.execute("""
                SELECT id, product_name, category, image_url
                FROM product_image_gallery
                WHERE category = %s
                ORDER BY product_name
            """, (category,))
        else:
            cursor.execute("""
                SELECT id, product_name, category, image_url
                FROM product_image_gallery
                ORDER BY category, product_name
            """)

        return jsonify(cursor.fetchall()), 200

    except Exception as error:
        print("Product image gallery error:", error)
        return jsonify({
            "message": "Failed to load image gallery"
        }), 500

    finally:
        cursor.close()
        connection.close()


# 2. ADD an image to the shared gallery - ADMIN ONLY
@app.route('/product-image-gallery', methods=['POST'])
def add_product_gallery_image():
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT role
            FROM users
            WHERE id = %s
        """, (user_id,))

        user = cursor.fetchone()

        if not user or str(user.get('role', '')).lower() != 'admin':
            return jsonify({
                "message": "Forbidden: Admin access required"
            }), 403

        data = request.get_json(silent=True) or {}

        product_name = str(data.get('product_name', '')).strip()
        category = str(data.get('category', '')).strip()
        image_url = str(data.get('image_url', '')).strip()

        if not product_name or not image_url:
            return jsonify({
                "message": "Product name and image URL are required"
            }), 400

        if not image_url.startswith('https://'):
            return jsonify({
                "message": "Only HTTPS image URLs are allowed"
            }), 400

        cursor.execute("""
            INSERT INTO product_image_gallery
                (product_name, category, image_url)
            VALUES (%s, %s, %s)
        """, (product_name, category or None, image_url))

        connection.commit()

        return jsonify({
            "message": "Image added to gallery",
            "id": cursor.lastrowid
        }), 201

    except Exception as error:
        connection.rollback()
        print("Add gallery image error:", error)
        return jsonify({
            "message": "Failed to add gallery image"
        }), 500

    finally:
        cursor.close()
        connection.close()


# 3. GET the logged-in user's selected product images
@app.route('/product-images', methods=['GET'])
def get_user_product_images():
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                upi.product_id,
                upi.image_url,
                p.product_name
            FROM user_product_images upi
            INNER JOIN products p ON p.id = upi.product_id
            WHERE upi.user_id = %s
              AND p.user_id = %s
        """, (user_id, user_id))

        return jsonify(cursor.fetchall()), 200

    except Exception as error:
        print("Get selected product images error:", error)
        return jsonify({
            "message": "Failed to load selected images"
        }), 500

    finally:
        cursor.close()
        connection.close()


# 4. SAVE or change the image for a user's product
@app.route('/products/<int:product_id>/image', methods=['PUT'])
def save_user_product_image(product_id):
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    image_url = str(data.get('image_url', '')).strip()

    if not image_url.startswith(('https://', 'http://')):
        return jsonify({
            "message": "A valid image URL is required"
        }), 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT id
            FROM products
            WHERE id = %s AND user_id = %s
        """, (product_id, user_id))

        if not cursor.fetchone():
            return jsonify({"message": "Product not found"}), 404

        cursor.execute("""
            SELECT id
            FROM product_image_gallery
            WHERE image_url = %s
            LIMIT 1
        """, (image_url,))

        if not cursor.fetchone():
            return jsonify({
                "message": "Select an image from the shared gallery"
            }), 400

        cursor.execute("""
            INSERT INTO user_product_images
                (user_id, product_id, image_url)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
                image_url = VALUES(image_url)
        """, (user_id, product_id, image_url))

        connection.commit()

        return jsonify({
            "message": "Product image saved"
        }), 200

    except Exception as error:
        connection.rollback()
        print("Save product image error:", error)
        return jsonify({
            "message": "Failed to save product image"
        }), 500

    finally:
        cursor.close()
        connection.close()


# 5. REMOVE a user's image selection
# This does not delete the shared gallery image.
@app.route('/products/<int:product_id>/image', methods=['DELETE'])
def remove_user_product_image(product_id):
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT id
            FROM products
            WHERE id = %s AND user_id = %s
        """, (product_id, user_id))

        if not cursor.fetchone():
            return jsonify({"message": "Product not found"}), 404

        cursor.execute("""
            DELETE FROM user_product_images
            WHERE product_id = %s AND user_id = %s
        """, (product_id, user_id))

        connection.commit()

        return jsonify({
            "message": "Product image selection removed"
        }), 200

    except Exception as error:
        connection.rollback()
        print("Remove product image error:", error)
        return jsonify({
            "message": "Failed to remove image selection"
        }), 500

    finally:
        cursor.close()
        connection.close()

# Add this route in app.py in the PRODUCT IMAGE GALLERY section, after the
# existing POST /product-image-gallery route.
# It deletes only the selected shared gallery entry, never household products.

@app.route('/product-image-gallery/<int:image_id>', methods=['DELETE'])
def delete_product_gallery_image(image_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        # Enforce admin permissions on the server.
        cursor.execute("""
            SELECT role FROM users WHERE id = %s LIMIT 1
        """, (user_id,))
        user = cursor.fetchone()
        if not user or str(user.get('role', '')).lower() != 'admin':
            return jsonify({"message": "Forbidden: Admin access required"}), 403

        cursor.execute("""
            SELECT id, product_name, image_url
            FROM product_image_gallery WHERE id = %s LIMIT 1
        """, (image_id,))
        image = cursor.fetchone()
        if not image:
            return jsonify({"message": "Gallery image not found"}), 404

        # Clear selections referencing this exact URL so the removed image is
        # no longer retained as a saved selection. Products themselves remain.
        cursor.execute("""
            DELETE FROM user_product_images WHERE image_url = %s
        """, (image['image_url'],))
        cursor.execute("""
            DELETE FROM product_image_gallery WHERE id = %s
        """, (image_id,))
        connection.commit()
        return jsonify({
            "message": "Gallery image deleted successfully",
            "id": image_id,
            "product_name": image['product_name']
        }), 200
    except Exception as error:
        connection.rollback()
        print("Delete gallery image error:", error)
        return jsonify({"message": "Failed to delete gallery image"}), 500
    finally:
        cursor.close()
        connection.close()



# ==========================================
# MEAL IMAGE GALLERY
# Completely separate from Product Images
# ==========================================


# 1. GET SHARED MEAL IMAGE GALLERY
@app.route('/meal-image-gallery', methods=['GET'])
def get_meal_image_gallery():
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        category = request.args.get('category')

        if category:
            cursor.execute("""
                SELECT id, meal_name, category, image_url, created_at
                FROM meal_image_gallery
                WHERE category = %s
                ORDER BY meal_name
            """, (category,))
        else:
            cursor.execute("""
                SELECT id, meal_name, category, image_url, created_at
                FROM meal_image_gallery
                ORDER BY category, meal_name
            """)

        return jsonify(cursor.fetchall()), 200

    except Exception as error:
        print("Meal image gallery error:", error)
        return jsonify({
            "message": "Failed to load meal image gallery"
        }), 500

    finally:
        cursor.close()
        connection.close()


# 2. ADD SHARED MEAL IMAGE - ADMIN ONLY
@app.route('/meal-image-gallery', methods=['POST'])
def add_meal_gallery_image():
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT role FROM users WHERE id = %s LIMIT 1
        """, (user_id,))
        user = cursor.fetchone()

        if not user or str(user.get('role', '')).lower() != 'admin':
            return jsonify({
                "message": "Forbidden: Admin access required"
            }), 403

        data = request.get_json(silent=True) or {}

        meal_name = str(data.get('meal_name', '')).strip()
        category = str(data.get('category', 'General')).strip()
        image_url = str(data.get('image_url', '')).strip()

        if not meal_name or len(meal_name) > 150:
            return jsonify({
                "message": "Meal name is required (maximum 150 characters)"
            }), 400

        if not image_url.startswith('https://'):
            return jsonify({
                "message": "Only HTTPS image URLs are allowed"
            }), 400

        cursor.execute("""
            INSERT INTO meal_image_gallery
                (meal_name, category, image_url)
            VALUES (%s, %s, %s)
        """, (meal_name, category or 'General', image_url))

        connection.commit()

        return jsonify({
            "message": "Meal image added to gallery",
            "id": cursor.lastrowid
        }), 201

    except Exception as error:
        connection.rollback()
        print("Add meal gallery image error:", error)
        return jsonify({
            "message": "Failed to add meal gallery image"
        }), 500

    finally:
        cursor.close()
        connection.close()


# 3. GET CURRENT USER'S SAVED MEAL IMAGES
@app.route('/meal-images', methods=['GET'])
def get_user_meal_images():
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                umi.meal_id,
                umi.image_url,
                m.meal_name
            FROM user_meal_images umi
            INNER JOIN meals m ON m.id = umi.meal_id
            WHERE umi.user_id = %s
              AND m.user_id = %s
        """, (user_id, user_id))

        return jsonify(cursor.fetchall()), 200

    except Exception as error:
        print("Get selected meal images error:", error)
        return jsonify({
            "message": "Failed to load selected meal images"
        }), 500

    finally:
        cursor.close()
        connection.close()


# 4. SAVE OR CHANGE IMAGE FOR A USER'S MEAL
@app.route('/meals/<int:meal_id>/image', methods=['PUT'])
def save_user_meal_image(meal_id):
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    image_url = str(data.get('image_url', '')).strip()

    if not image_url.startswith(('https://', 'http://')):
        return jsonify({
            "message": "A valid image URL is required"
        }), 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Verify this meal belongs to the logged-in user.
        cursor.execute("""
            SELECT id FROM meals
            WHERE id = %s AND user_id = %s
            LIMIT 1
        """, (meal_id, user_id))

        if not cursor.fetchone():
            return jsonify({"message": "Meal not found"}), 404

        # Only images from the shared MEAL gallery are accepted.
        cursor.execute("""
            SELECT id FROM meal_image_gallery
            WHERE image_url = %s
            LIMIT 1
        """, (image_url,))

        if not cursor.fetchone():
            return jsonify({
                "message": "Select an image from the shared meal gallery"
            }), 400

        cursor.execute("""
            INSERT INTO user_meal_images
                (user_id, meal_id, image_url)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
                image_url = VALUES(image_url)
        """, (user_id, meal_id, image_url))

        connection.commit()

        return jsonify({
            "message": "Meal image saved successfully"
        }), 200

    except Exception as error:
        connection.rollback()
        print("Save meal image error:", error)
        return jsonify({
            "message": "Failed to save meal image"
        }), 500

    finally:
        cursor.close()
        connection.close()


# 5. REMOVE USER'S MEAL IMAGE SELECTION
# Does not delete the meal or shared gallery image.
@app.route('/meals/<int:meal_id>/image', methods=['DELETE'])
def remove_user_meal_image(meal_id):
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT id FROM meals
            WHERE id = %s AND user_id = %s
            LIMIT 1
        """, (meal_id, user_id))

        if not cursor.fetchone():
            return jsonify({"message": "Meal not found"}), 404

        cursor.execute("""
            DELETE FROM user_meal_images
            WHERE meal_id = %s AND user_id = %s
        """, (meal_id, user_id))

        connection.commit()

        return jsonify({
            "message": "Meal image selection removed"
        }), 200

    except Exception as error:
        connection.rollback()
        print("Remove meal image error:", error)
        return jsonify({
            "message": "Failed to remove meal image selection"
        }), 500

    finally:
        cursor.close()
        connection.close()


# 6. DELETE SHARED MEAL GALLERY IMAGE - ADMIN ONLY
# Clears selections for this image but never deletes meals or ingredients.
@app.route('/meal-image-gallery/<int:image_id>', methods=['DELETE'])
def delete_meal_gallery_image(image_id):
    user_id = session.get('user_id')

    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT role FROM users WHERE id = %s LIMIT 1
        """, (user_id,))
        user = cursor.fetchone()

        if not user or str(user.get('role', '')).lower() != 'admin':
            return jsonify({
                "message": "Forbidden: Admin access required"
            }), 403

        cursor.execute("""
            SELECT id, meal_name, image_url
            FROM meal_image_gallery
            WHERE id = %s
            LIMIT 1
        """, (image_id,))

        image = cursor.fetchone()

        if not image:
            return jsonify({
                "message": "Meal gallery image not found"
            }), 404

        cursor.execute("""
            DELETE FROM user_meal_images
            WHERE image_url = %s
        """, (image['image_url'],))

        cursor.execute("""
            DELETE FROM meal_image_gallery
            WHERE id = %s
        """, (image_id,))

        connection.commit()

        return jsonify({
            "message": "Meal gallery image deleted successfully",
            "id": image_id,
            "meal_name": image['meal_name']
        }), 200

    except Exception as error:
        connection.rollback()
        print("Delete meal gallery image error:", error)
        return jsonify({
            "message": "Failed to delete meal gallery image"
        }), 500

    finally:
        cursor.close()
        connection.close()



# -----------------------------------
# RUN FLASK SERVER
# -----------------------------------

if __name__ == '__main__':
    print(app.url_map)

    # Locate the mkcert certificate and private key created for LAN HTTPS.
    # You can override these paths with HOME_NEEDS_SSL_CERT and
    # HOME_NEEDS_SSL_KEY environment variables if your files are elsewhere.
    cert_folder = os.path.join(
        os.path.expanduser("~"),
        "home-needs-certs"
    )

    cert_candidates = [
        os.environ.get("HOME_NEEDS_SSL_CERT"),
        os.path.join(cert_folder, "home-needs.pem"),
        os.path.join(cert_folder, "cert.pem"),
    ]
    key_candidates = [
        os.environ.get("HOME_NEEDS_SSL_KEY"),
        os.path.join(cert_folder, "home-needs-key.pem"),
        os.path.join(cert_folder, "key.pem"),
    ]

    ssl_cert = next(
        (path for path in cert_candidates if path and os.path.isfile(path)),
        None
    )
    ssl_key = next(
        (path for path in key_candidates if path and os.path.isfile(path)),
        None
    )

    if not ssl_cert or not ssl_key:
        raise FileNotFoundError(
            "Home Needs HTTPS certificate/key not found. Expected either "
            "home-needs.pem + home-needs-key.pem or cert.pem + key.pem "
            f"inside: {cert_folder}. You can also set HOME_NEEDS_SSL_CERT "
            "and HOME_NEEDS_SSL_KEY to the exact file paths."
        )

    print(f"Starting Home Needs HTTPS server with certificate: {ssl_cert}")
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        ssl_context=(ssl_cert, ssl_key)
    )