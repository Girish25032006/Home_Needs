
from flask import Flask, request
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
# RUN FLASK SERVER
# -----------------------------------

if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )