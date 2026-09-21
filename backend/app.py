from flask import Flask, request
from flask_cors import CORS
from database import get_connection

app = Flask(__name__)
CORS(app)


@app.route('/', methods=['GET'])
def home():
    connection = get_connection()

    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT * FROM products")
    products = cursor.fetchall()

    cursor.close()
    connection.close()

    return products


@app.route('/products', methods=['POST'])
def add_product():
    data = request.json

    connection = get_connection()
    cursor = connection.cursor()

    query = """
        INSERT INTO products
        (product_name, category, quantity, unit, price, purchase_date)
        VALUES (%s, %s, %s, %s, %s, %s)
    """

    values = (
        data['productName'],
        data.get('category', 'General'),
        data['quantity'],
        data['unit'],
        data.get('price'),
        data.get('purchaseDate') or None
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
@app.route('/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    data = request.json

    connection = get_connection()
    cursor = connection.cursor()

    purchase_date = data.get('purchaseDate') or None

    if purchase_date and ',' in purchase_date:
        from datetime import datetime

        try:
            purchase_date = datetime.strptime(
                purchase_date,
                '%a, %d %b %Y %H:%M:%S GMT'
            ).strftime('%Y-%m-%d')
        except ValueError:
            purchase_date = None

    query = """
        UPDATE products
        SET product_name = %s,
            category = %s,
            quantity = %s,
            unit = %s,
            price = %s,
            purchase_date = %s
        WHERE id = %s
    """

    values = (
        data['productName'],
        data.get('category', 'General'),
        data['quantity'],
        data['unit'],
        data.get('price'),
        purchase_date,
        product_id
    )

    cursor.execute(query, values)
    connection.commit()

    cursor.close()
    connection.close()

    return {
        "message": "Product updated successfully"
    }, 200
@app.route('/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    connection = get_connection()
    cursor = connection.cursor()

    query = "DELETE FROM products WHERE id = %s"

    cursor.execute(query, (product_id,))
    connection.commit()

    cursor.close()
    connection.close()

    return {
        "message": "Product deleted successfully"
    }, 200

if __name__ == '__main__':
    app.run(debug=True)