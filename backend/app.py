from flask import Flask
from database import get_connection

app = Flask(__name__)

@app.route('/')
def home():
    connection = get_connection()

    if connection.is_connected():
        connection.close()
        return "Home Needs Backend + MySQL Connected!"

    return "MySQL Connection Failed!"

if __name__ == '__main__':
    app.run(debug=True)