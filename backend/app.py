
from flask import Flask, request, jsonify
from flask_cors import CORS
from database import get_connection

app = Flask(__name__)
CORS(app)


# -----------------------------------
# GET ALL PRODUCTS
# -----------------------------------

@app.route('/', methods=['GET'])
def home():
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("SELECT * FROM products ORDER BY id DESC")
    products = cursor.fetchall()

    cursor.close()
    connection.close()

    return products


# -----------------------------------
# GET PRODUCT USING BARCODE
# -----------------------------------

@app.route('/barcode-products/<barcode>', methods=['GET'])
def get_barcode_product(barcode):
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    query = """
        SELECT *
        FROM products
        WHERE barcode = %s
        LIMIT 1
    """

    cursor.execute(query, (barcode,))
    product = cursor.fetchone()

    cursor.close()
    connection.close()

    if product:
        return product, 200

    return {
        "message": "Product not found"
    }, 404


# -----------------------------------
# ADD PRODUCT
# -----------------------------------

@app.route('/products', methods=['POST'])
def add_product():
    data = request.json

    if not data:
        return {
            "message": "Product data is required"
        }, 400

    product_name = data.get('productName')
    quantity = data.get('quantity')
    unit = data.get('unit')

    if not product_name or quantity is None or not unit:
        return {
            "message": "Product name, quantity and unit are required"
        }, 400

    connection = get_connection()
    cursor = connection.cursor()

    query = """
        INSERT INTO products
        (
            product_name,
            category,
            quantity,
            unit,
            price,
            purchase_date,
            expiry_date,
            barcode
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """

    values = (
        product_name,
        data.get('category', 'General'),
        quantity,
        unit,
        data.get('price') or None,
        data.get('purchaseDate') or None,
        data.get('expiryDate') or None,
        data.get('barcode') or None
    )

    cursor.execute(query, values)
    connection.commit()

    product_id = cursor.lastrowid

    cursor.close()
    connection.close()

    return {
        "message": "Product added successfully",
        "id": product_id
    }, 201


# -----------------------------------
# UPDATE PRODUCT
# -----------------------------------

@app.route('/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    data = request.json

    if not data:
        return {
            "message": "Product data is required"
        }, 400

    connection = get_connection()
    cursor = connection.cursor()

    query = """
        UPDATE products
        SET product_name = %s,
            category = %s,
            quantity = %s,
            unit = %s,
            price = %s,
            purchase_date = %s,
            expiry_date = %s,
            barcode = %s
        WHERE id = %s
    """

    values = (
        data['productName'],
        data.get('category', 'General'),
        data['quantity'],
        data['unit'],
        data.get('price') or None,
        data.get('purchaseDate') or None,
        data.get('expiryDate') or None,
        data.get('barcode') or None,
        product_id
    )

    cursor.execute(query, values)
    connection.commit()

    updated_rows = cursor.rowcount

    cursor.close()
    connection.close()

    if updated_rows == 0:
        return {
            "message": "Product not found or no changes made"
        }, 404

    return {
        "message": "Product updated successfully"
    }, 200


# -----------------------------------
# DELETE PRODUCT
# -----------------------------------

@app.route('/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        "DELETE FROM products WHERE id = %s",
        (product_id,)
    )

    connection.commit()

    deleted_rows = cursor.rowcount

    cursor.close()
    connection.close()

    if deleted_rows == 0:
        return {
            "message": "Product not found"
        }, 404

    return {
        "message": "Product deleted successfully"
    }, 200


# -----------------------------------
# GET PURCHASE HISTORY
# -----------------------------------

@app.route('/purchases', methods=['GET'])
def get_purchases():
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    query = """
        SELECT
            purchases.id,
            purchases.product_id,
            products.product_name,
            purchases.quantity,
            products.unit,
            purchases.unit_price,
            purchases.total_price,
            purchases.purchase_date
        FROM purchases
        JOIN products
        ON purchases.product_id = products.id
        ORDER BY purchases.purchase_date DESC,
                 purchases.id DESC
    """

    cursor.execute(query)
    purchases = cursor.fetchall()

    cursor.close()
    connection.close()

    return purchases


# -----------------------------------
# GET LATEST PRODUCT UNIT PRICES
# -----------------------------------

@app.route('/purchase-unit-prices', methods=['GET'])
def get_purchase_unit_prices():

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                id AS product_id,
                price AS unit_price
            FROM products
            WHERE price IS NOT NULL
              AND price > 0
        """)

        prices = cursor.fetchall()

        return prices, 200

    except Exception as error:
        print("Purchase unit prices error:", error)
        return {
            "message": "Failed to fetch product prices"
        }, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# ADD PURCHASE
# -----------------------------------

@app.route('/purchases', methods=['POST'])
def add_purchase():
    data = request.json

    if not data:
        return {
            "message": "Purchase data is required"
        }, 400

    product_name = data.get('productName')
    quantity = data.get('quantity')
    amount_paid = data.get('amountPaid')
    purchase_date = data.get('purchaseDate') or None

    if (
        not product_name
        or quantity is None
        or amount_paid is None
    ):
        return {
            "message": "Product name, quantity and amount paid are required"
        }, 400

    try:
        quantity = float(quantity)
        amount_paid = float(amount_paid)

        if quantity <= 0 or amount_paid < 0:
            return {
                "message": "Quantity must be greater than zero and amount cannot be negative"
            }, 400

    except (ValueError, TypeError):
        return {
            "message": "Invalid quantity or amount"
        }, 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Find the existing product
        cursor.execute(
            """
            SELECT id, quantity, price
            FROM products
            WHERE LOWER(product_name) = LOWER(%s)
            LIMIT 1
            """,
            (product_name,)
        )

        product = cursor.fetchone()

        if not product:
            connection.rollback()

            return {
                "message": "Product not found. Please add the product first."
            }, 404

        product_id = product['id']

        # Calculate the unit price
        unit_price = amount_paid / quantity

        # Insert purchase record
        query = """
            INSERT INTO purchases
            (
                product_id,
                quantity,
                unit_price,
                total_price,
                purchase_date
            )
            VALUES (%s, %s, %s, %s, %s)
        """

        values = (
            product_id,
            quantity,
            unit_price,
            amount_paid,
            purchase_date
        )

        cursor.execute(query, values)

        purchase_id = cursor.lastrowid

        # Update available product quantity and latest purchase details
        update_query = """
            UPDATE products
            SET quantity = quantity + %s,
                price = %s,
                purchase_date = %s
            WHERE id = %s
        """

        cursor.execute(
            update_query,
            (
                quantity,
                amount_paid,
                purchase_date,
                product_id
            )
        )

        connection.commit()

        return {
            "message": "Purchase saved successfully",
            "id": purchase_id
        }, 201

    except Exception as error:
        connection.rollback()

        print("Error saving purchase:", error)

        return {
            "message": "Failed to save purchase"
        }, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# GET CONSUMPTION HISTORY
# -----------------------------------


@app.route('/consumption', methods=['GET'])
def get_consumption():
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
            ORDER BY consumption.consumption_date DESC,
                     consumption.id DESC
        """

        cursor.execute(query)
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
    data = request.json

    if not data:
        return {
            "message": "Consumption data is required"
        }, 400

    product_name = data.get('productName')
    quantity = data.get('quantity')
    unit = data.get('unit')
    usage_date = data.get('usageDate') or None

    if (
        not product_name
        or quantity is None
        or not unit
        or not usage_date
    ):
        return {
            "message": "Product, quantity, unit and usage date are required"
        }, 400

    try:
        quantity = float(quantity)

        if quantity <= 0:
            return {
                "message": "Quantity must be greater than zero"
            }, 400

    except (ValueError, TypeError):
        return {
            "message": "Invalid quantity"
        }, 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Find product and check available stock
        cursor.execute(
            """
            SELECT id, quantity, unit
            FROM products
            WHERE LOWER(product_name) = LOWER(%s)
            LIMIT 1
            """,
            (product_name,)
        )

        product = cursor.fetchone()

        if not product:
            return {
                "message": "Product not found"
            }, 404

        product_id = product['id']
        available_quantity = float(product['quantity'])

        # Validate unit
        if product['unit'].lower() != unit.lower():
            return {
                "message": f"Please select the correct unit: {product['unit']}"
            }, 400

        # Validate stock
        if quantity > available_quantity:
            return {
                "message": (
                    f"Only {available_quantity} {product['unit']} "
                    f"available in stock"
                )
            }, 400

        # Insert using your actual MySQL column names
        cursor.execute(
            """
            INSERT INTO consumption
            (
                product_id,
                quantity_used,
                consumption_date
            )
            VALUES (%s, %s, %s)
            """,
            (
                product_id,
                quantity,
                usage_date
            )
        )

        consumption_id = cursor.lastrowid

        # Reduce product stock
        cursor.execute(
            """
            UPDATE products
            SET quantity = quantity - %s
            WHERE id = %s
            """,
            (
                quantity,
                product_id
            )
        )

        connection.commit()

        return {
            "message": "Consumption recorded successfully",
            "id": consumption_id,
            "remainingQuantity": available_quantity - quantity
        }, 201

    except Exception as error:
        connection.rollback()

        print("Error recording consumption:", error)

        return {
            "message": "Failed to record consumption"
        }, 500

    finally:
        cursor.close()
        connection.close()

# -----------------------------------
# AI PREDICTION API
# -----------------------------------

from datetime import date, timedelta
import math


@app.route('/ai-predictions', methods=['GET'])
def get_ai_predictions():

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        query = """
            SELECT
                p.id AS product_id,
                p.product_name,
                p.quantity AS current_stock,
                p.unit,

                COUNT(DISTINCT c.consumption_date) AS usage_days,

                COALESCE(SUM(c.quantity_used), 0)
                    AS total_consumed,

                MIN(c.consumption_date) AS first_usage_date

            FROM products p

            LEFT JOIN consumption c
                ON p.id = c.product_id

            GROUP BY
                p.id,
                p.product_name,
                p.quantity,
                p.unit

            ORDER BY p.product_name
        """

        cursor.execute(query)
        products = cursor.fetchall()

        predictions = []

        today = date.today()

        for product in products:

            stock = float(product['current_stock'] or 0)
            total_consumed = float(
                product['total_consumed'] or 0
            )

            usage_days = product['usage_days']
            first_usage = product['first_usage_date']

            average_daily_consumption = 0
            days_remaining = None
            predicted_date = None
            prediction_status = "Insufficient data"

            if usage_days >= 2 and first_usage:

                days_recorded = (
                    today - first_usage
                ).days + 1

                if days_recorded > 0:

                    average_daily_consumption = (
                        total_consumed / days_recorded
                    )

                    if average_daily_consumption > 0:

                        days_remaining = math.ceil(
                            stock / average_daily_consumption
                        )

                        predicted_date = (
                            today + timedelta(
                                days=days_remaining
                            )
                        ).isoformat()

                        prediction_status = "Available"

            predictions.append({
                "product_id": product['product_id'],
                "product_name": product['product_name'],
                "current_stock": stock,
                "unit": product['unit'],
                "average_daily_consumption": round(
                    average_daily_consumption, 2
                ),
                "days_remaining": days_remaining,
                "predicted_date": predicted_date,
                "status": prediction_status
            })

        return {
            "predictions": predictions,
            "total_products": len(predictions),
            "message": "Predictions generated successfully"
        }, 200

    except Exception as error:

        print("AI Prediction Error:", error)

        return {
            "message": "Failed to generate predictions"
        }, 500

    finally:
        cursor.close()
        connection.close()

# -----------------------------------
# SAVE AI PREDICTION HISTORY
# -----------------------------------

@app.route('/ai-predictions/save', methods=['POST'])
def save_ai_predictions():

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                p.id AS product_id,
                p.quantity AS current_stock,
                p.unit,
                COALESCE(SUM(c.quantity_used), 0)
                    AS total_consumed,
                COUNT(DISTINCT c.consumption_date)
                    AS usage_days,
                MIN(c.consumption_date)
                    AS first_usage_date
            FROM products p
            LEFT JOIN consumption c
                ON p.id = c.product_id
            GROUP BY
                p.id, p.quantity, p.unit
        """)

        products = cursor.fetchall()

        today = date.today()
        saved_count = 0

        for product in products:

            stock = float(product['current_stock'] or 0)
            total_consumed = float(
                product['total_consumed'] or 0
            )

            usage_days = product['usage_days']
            first_usage = product['first_usage_date']

            if usage_days < 2 or not first_usage:
                continue

            days_recorded = (
                today - first_usage
            ).days + 1

            if days_recorded <= 0:
                continue

            average_daily = (
                total_consumed / days_recorded
            )

            if average_daily <= 0:
                continue

            days_remaining = math.ceil(
                stock / average_daily
            )

            predicted_date = (
                today + timedelta(days=days_remaining)
            )

            cursor.execute("""
                INSERT INTO ai_predictions
                (
                    product_id,
                    predicted_quantity,
                    predicted_date,
                    prediction_type,
                    predicted_days_remaining
                )
                VALUES (%s, %s, %s, %s, %s)
            """, (
                product['product_id'],
                stock,
                predicted_date,
                'consumption_based',
                days_remaining
            ))

            saved_count += 1

        connection.commit()

        return {
            "message": "Prediction history saved successfully",
            "saved_predictions": saved_count
        }, 200

    except Exception as error:

        connection.rollback()
        print("Save prediction error:", error)

        return {
            "message": "Failed to save prediction history"
        }, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# EVALUATE AI PREDICTION ACCURACY
# -----------------------------------

@app.route('/ai-predictions/evaluate/<int:prediction_id>', methods=['POST'])
def evaluate_ai_prediction(prediction_id):

    data = request.get_json()

    if not data or not data.get('actualFinishDate'):
        return {
            "message": "Actual finish date is required"
        }, 400

    try:
        actual_finish_date = date.fromisoformat(
            data['actualFinishDate']
        )
    except (ValueError, TypeError):
        return {
            "message": "Invalid date. Use YYYY-MM-DD"
        }, 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                id,
                predicted_days_remaining,
                DATE(created_at) AS prediction_date
            FROM ai_predictions
            WHERE id = %s
        """, (prediction_id,))

        prediction = cursor.fetchone()

        if not prediction:
            return {
                "message": "Prediction not found"
            }, 404

        predicted_days = prediction[
            'predicted_days_remaining'
        ]

        prediction_date = prediction['prediction_date']

        if predicted_days is None:
            return {
                "message": "Prediction days are not available"
            }, 400

        actual_days = (
            actual_finish_date - prediction_date
        ).days

        if actual_days < 0:
            return {
                "message": "Finish date cannot be before prediction date"
            }, 400

        absolute_error = abs(
            predicted_days - actual_days
        )

        cursor.execute("""
            UPDATE ai_predictions
            SET actual_days_remaining = %s,
                absolute_error = %s,
                evaluated_at = NOW()
            WHERE id = %s
        """, (
            actual_days,
            absolute_error,
            prediction_id
        ))

        connection.commit()

        return {
            "message": "Prediction evaluated successfully",
            "prediction_id": prediction_id,
            "predicted_days": predicted_days,
            "actual_days": actual_days,
            "absolute_error": absolute_error
        }, 200

    except Exception as error:
        connection.rollback()
        print("Evaluation error:", error)

        return {
            "message": "Failed to evaluate prediction"
        }, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# GET AI PREDICTION ACCURACY
# -----------------------------------

@app.route('/ai-predictions/accuracy', methods=['GET'])
def get_ai_prediction_accuracy():

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                COUNT(*) AS evaluated_predictions,
                AVG(absolute_error) AS mean_absolute_error,
                MIN(absolute_error) AS minimum_error,
                MAX(absolute_error) AS maximum_error
            FROM ai_predictions
            WHERE actual_days_remaining IS NOT NULL
              AND absolute_error IS NOT NULL
        """)

        result = cursor.fetchone()

        evaluated = result['evaluated_predictions']
        mae = result['mean_absolute_error']

        return {
            "evaluated_predictions": evaluated,
            "mean_absolute_error": (
                round(float(mae), 2)
                if mae is not None else None
            ),
            "minimum_error": (
                float(result['minimum_error'])
                if result['minimum_error'] is not None
                else None
            ),
            "maximum_error": (
                float(result['maximum_error'])
                if result['maximum_error'] is not None
                else None
            ),
            "unit": "days",
            "message": (
                "Accuracy evaluation available"
                if evaluated > 0
                else "No evaluated predictions yet"
            )
        }, 200

    except Exception as error:
        print("Accuracy calculation error:", error)

        return {
            "message": "Failed to calculate prediction accuracy"
        }, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# ADD AI PREDICTION TO SHOPPING LIST
# -----------------------------------

@app.route('/shopping-list/add-prediction', methods=['POST'])

def add_prediction_to_shopping_list():
    data = request.get_json(silent=True) or {}
    product_id = data.get('product_id')
    requested_quantity = data.get('required_quantity')

    if not product_id:
        return {"message": "Product ID is required"}, 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT id, product_name, quantity
            FROM products
            WHERE id = %s
            FOR UPDATE
        """, (product_id,))

        product = cursor.fetchone()

        if not product:
            connection.rollback()
            return {"message": "Product not found"}, 404

        current_stock = float(product['quantity'] or 0)

        # Use the recommended quantity sent from React.
        # Keep the old default behavior if no quantity is supplied.
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

        # Find all existing Pending rows for this product.
        cursor.execute("""
            SELECT id
            FROM shopping_list
            WHERE product_id = %s AND status = 'Pending'
            ORDER BY id ASC
            FOR UPDATE
        """, (product_id,))

        pending_items = cursor.fetchall()

        if pending_items:
            keep_id = pending_items[0]['id']

            cursor.execute("""
                UPDATE shopping_list
                SET required_quantity = %s
                WHERE id = %s
            """, (required_quantity, keep_id))

            # Remove duplicate Pending rows, preserving Purchased history.
            duplicate_ids = [
                row['id'] for row in pending_items[1:]
            ]

            if duplicate_ids:
                placeholders = ','.join(
                    ['%s'] * len(duplicate_ids)
                )

                cursor.execute(
                    f"""
                    DELETE FROM shopping_list
                    WHERE id IN ({placeholders})
                    """,
                    tuple(duplicate_ids)
                )

            message = "Existing pending item updated; duplicate pending rows removed"

        else:
            cursor.execute("""
                INSERT INTO shopping_list
                    (product_id, required_quantity, status)
                VALUES (%s, %s, 'Pending')
            """, (product_id, required_quantity))

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
        print("Shopping list add-prediction error:", error)

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
            ORDER BY shopping_list.created_at DESC,
                     shopping_list.id DESC
        """)

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
    data = request.get_json(silent=True) or {}
    status = data.get('status')

    if status not in ['Pending', 'Purchased']:
        return {"message": "Status must be Pending or Purchased"}, 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT id, product_id, status
            FROM shopping_list
            WHERE id = %s
            FOR UPDATE
        """, (item_id,))
        item = cursor.fetchone()

        if not item:
            connection.rollback()
            return {"message": "Shopping list item not found"}, 404

        # If changing an item back to Pending, reuse any other Pending row
        # for the same product and remove the row being toggled to avoid
        # multiple Pending entries. Purchased history remains intact.
        if status == 'Pending':
            cursor.execute("""
                SELECT id, required_quantity
                FROM shopping_list
                WHERE product_id = %s
                  AND status = 'Pending'
                  AND id <> %s
                ORDER BY id ASC
                FOR UPDATE
            """, (item['product_id'], item_id))
            other_pending = cursor.fetchone()

            if other_pending:
                cursor.execute("""
                    UPDATE shopping_list
                    SET required_quantity = required_quantity
                    WHERE id = %s
                """, (other_pending['id'],))
                cursor.execute("DELETE FROM shopping_list WHERE id = %s", (item_id,))
                connection.commit()
                return {
                    "message": "An existing pending entry already exists; duplicate was removed",
                    "merged_into": other_pending['id']
                }, 200

        cursor.execute("""
            UPDATE shopping_list
            SET status = %s
            WHERE id = %s
        """, (status, item_id))

        connection.commit()
        return {"message": "Shopping list status updated successfully"}, 200

    except Exception as error:
        connection.rollback()
        print("Update shopping list error:", error)
        return {"message": "Failed to update shopping list"}, 500

    finally:
        cursor.close()
        connection.close()


# -----------------------------------
# DELETE SHOPPING LIST ITEM
# -----------------------------------

@app.route('/shopping-list/<int:item_id>', methods=['DELETE'])
def delete_shopping_list_item(item_id):

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            DELETE FROM shopping_list
            WHERE id = %s
        """, (item_id,))

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

        print("Delete shopping list error:", error)

        return {
            "message": "Failed to delete shopping list item"
        }, 500

    finally:
        cursor.close()
        connection.close()



# ================= MEAL RECOMMENDATION APIs =================

@app.route('/meals', methods=['GET'])
def get_meals():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM meals ORDER BY id DESC")
        meals = cursor.fetchall()
        for meal in meals:
            cursor.execute("""
                SELECT id, product_id, ingredient_name,
                       required_quantity AS quantity, unit
                FROM meal_ingredients
                WHERE meal_id = %s
                ORDER BY id
            """, (meal['id'],))
            meal['ingredients'] = cursor.fetchall()
        return jsonify(meals), 200
    except Exception as e:
        print("Get meals error:", e)
        return jsonify({"error": "Failed to fetch meals"}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/meals', methods=['POST'])
def add_meal():
    data = request.get_json(silent=True) or {}
    meal_name = str(data.get('meal_name', '')).strip()
    ingredients = data.get('ingredients', [])
    difficulty = str(data.get('difficulty', 'Easy')).strip().title()

    if not meal_name:
        return jsonify({"error": "Meal name is required"}), 400
    if len(meal_name) > 100:
        return jsonify({"error": "Meal name must be 100 characters or fewer"}), 400
    if not isinstance(ingredients, list) or not ingredients:
        return jsonify({"error": "At least one ingredient is required"}), 400

    try:
        preparation_time = int(data.get('preparation_time'))
        if preparation_time <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "Preparation time must be a positive number of minutes"}), 400

    if difficulty not in ('Easy', 'Medium', 'Hard'):
        return jsonify({"error": "Difficulty must be Easy, Medium or Hard"}), 400

    cleaned = []
    try:
        for item in ingredients:
            if not isinstance(item, dict):
                raise ValueError("Each ingredient must be an object.")
            name = str(item.get('ingredient_name', '')).strip()
            unit = str(item.get('unit', '')).strip()
            quantity = float(item.get('quantity', 0))
            if not name or len(name) > 150:
                raise ValueError("Ingredient name is required (maximum 150 characters).")
            if not unit or len(unit) > 30:
                raise ValueError("Ingredient unit is required (maximum 30 characters).")
            if quantity <= 0:
                raise ValueError("Ingredient quantity must be greater than zero.")
            cleaned.append({"ingredient_name": name, "quantity": quantity, "unit": unit})
    except (ValueError, TypeError) as e:
        return jsonify({"error": str(e) or "Invalid ingredient quantity"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cursor.execute("""
            SELECT id FROM meals
            WHERE LOWER(TRIM(meal_name)) = LOWER(TRIM(%s))
            LIMIT 1 FOR UPDATE
        """, (meal_name,))
        if cursor.fetchone():
            conn.rollback()
            return jsonify({"error": "A meal with this name already exists"}), 409

        cursor.execute("""
            INSERT INTO meals (meal_name, preparation_time, difficulty)
            VALUES (%s, %s, %s)
        """, (meal_name, preparation_time, difficulty))
        meal_id = cursor.lastrowid

        cursor.execute("SELECT id, product_name, unit FROM products")
        products = cursor.fetchall()

        def normalize(value):
            return ''.join(c.lower() for c in str(value or '') if c.isalnum())

        for item in cleaned:
            product_id = None
            for product in products:
                if (normalize(item['ingredient_name']) == normalize(product['product_name'])
                        and normalize(item['unit']) == normalize(product['unit'])):
                    product_id = product['id']
                    break
            cursor.execute("""
                INSERT INTO meal_ingredients
                    (meal_id, product_id, required_quantity, ingredient_name, unit)
                VALUES (%s, %s, %s, %s, %s)
            """, (meal_id, product_id, item['quantity'],
                  item['ingredient_name'], item['unit']))

        conn.commit()
        return jsonify({"message": "Meal added successfully", "meal_id": meal_id}), 201
    except Exception as e:
        conn.rollback()
        print("Add meal error:", e)
        if getattr(e, 'errno', None) == 1062:
            return jsonify({"error": "A meal with this name already exists"}), 409
        return jsonify({"error": "Failed to add meal"}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/meals/<int:meal_id>', methods=['DELETE'])
def delete_meal(meal_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cursor.execute("SELECT id FROM meals WHERE id = %s FOR UPDATE", (meal_id,))
        if not cursor.fetchone():
            conn.rollback()
            return jsonify({"error": "Meal not found"}), 404

        cursor.execute("DELETE FROM meal_ingredients WHERE meal_id = %s", (meal_id,))
        cursor.execute("DELETE FROM meals WHERE id = %s", (meal_id,))
        conn.commit()
        return jsonify({
            "message": "Meal and its ingredients deleted successfully",
            "meal_id": meal_id
        }), 200
    except Exception as e:
        conn.rollback()
        print("Delete meal error:", e)
        return jsonify({"error": "Failed to delete meal"}), 500
    finally:
        cursor.close()
        conn.close()


# -----------------------------------
# RUN FLASK SERVER
# -----------------------------------

if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )