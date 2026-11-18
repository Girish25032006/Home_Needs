
import os
import mysql.connector
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")

load_dotenv(ENV_PATH)


def get_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", "4000")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME", "home_needs"),

        # TiDB Cloud SSL configuration
        ssl_ca=os.getenv(
            "DB_SSL_CA",
            os.path.join(BASE_DIR, "isrgrootx1.pem")
        ),
        ssl_verify_cert=True,
        ssl_verify_identity=True,

        connection_timeout=15
    )
