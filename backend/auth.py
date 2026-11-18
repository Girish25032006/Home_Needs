from flask import Blueprint, request, jsonify, session, current_app
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_connection

from dotenv import load_dotenv
load_dotenv()

import os
import smtplib
from email.message import EmailMessage
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired


auth_bp = Blueprint("auth", __name__)


# ============================================================
# PASSWORD RESET CONFIGURATION
# ============================================================

RESET_TOKEN_MAX_AGE = 1800  # 30 minutes

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://10.218.97.131:5173"
).rstrip("/")

SMTP_HOST = os.getenv(
    "SMTP_HOST",
    "smtp.gmail.com"
)

SMTP_PORT = int(
    os.getenv(
        "SMTP_PORT",
        "587"
    )
)

SMTP_EMAIL = os.getenv(
    "SMTP_EMAIL",
    ""
)

SMTP_APP_PASSWORD = os.getenv(
    "SMTP_APP_PASSWORD",
    ""
)


# ============================================================
# PASSWORD RESET TOKEN
# ============================================================

def create_reset_token(email):
    """
    Creates a secure time-limited password reset token.
    """

    secret_key = current_app.config.get("SECRET_KEY")

    if not secret_key:
        raise RuntimeError(
            "Flask SECRET_KEY is not configured."
        )

    serializer = URLSafeTimedSerializer(secret_key)

    return serializer.dumps(
        email,
        salt="home-needs-password-reset"
    )


def verify_reset_token(token):
    """
    Verifies the password reset token.
    Returns the email if valid.
    """

    secret_key = current_app.config.get("SECRET_KEY")

    if not secret_key:
        raise RuntimeError(
            "Flask SECRET_KEY is not configured."
        )

    serializer = URLSafeTimedSerializer(secret_key)

    try:
        email = serializer.loads(
            token,
            salt="home-needs-password-reset",
            max_age=RESET_TOKEN_MAX_AGE
        )

        return email

    except SignatureExpired:
        return None

    except BadSignature:
        return None


# ============================================================
# SEND PASSWORD RESET EMAIL
# ============================================================

def send_password_reset_email(email, reset_link):
    """
    Sends the password reset email using Gmail SMTP.
    """

    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        raise RuntimeError(
            "SMTP_EMAIL and SMTP_APP_PASSWORD are not configured."
        )

    message = EmailMessage()

    message["Subject"] = "Reset Your Home Needs Password"
    message["From"] = SMTP_EMAIL
    message["To"] = email

    # Plain text version
    message.set_content(
        f"""
Hello,

We received a request to reset your Home Needs password.

Click the link below to create a new password:

{reset_link}

This link will expire in 30 minutes.

If you did not request a password reset, you can safely ignore this email.

Regards,
Home Needs Team
"""
    )

    # HTML version
    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reset Your Home Needs Password</title>
</head>

<body style="
    margin:0;
    padding:0;
    background:#f2f8f3;
    font-family:Arial, Helvetica, sans-serif;
">

    <div style="
        max-width:600px;
        margin:40px auto;
        background:#ffffff;
        border-radius:18px;
        overflow:hidden;
        box-shadow:0 10px 35px rgba(20,80,50,0.10);
    ">

        <!-- Header -->
        <div style="
            background:linear-gradient(135deg,#e8f7eb,#d8f1df);
            padding:30px;
            text-align:center;
        ">

            <div style="
                width:60px;
                height:60px;
                margin:0 auto 15px;
                border-radius:16px;
                background:#ffffff;
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:30px;
            ">
                🏡
            </div>

            <h1 style="
                margin:0;
                color:#07583c;
                font-size:28px;
            ">
                Home Needs
            </h1>

            <p style="
                margin:8px 0 0;
                color:#547565;
                font-size:14px;
            ">
                Smarter Homes • Happier Families
            </p>

        </div>


        <!-- Content -->
        <div style="
            padding:40px 35px;
            text-align:center;
        ">

            <div style="
                font-size:42px;
                margin-bottom:15px;
            ">
                🔑
            </div>

            <h2 style="
                color:#07583c;
                margin:0 0 12px;
                font-size:24px;
            ">
                Reset Your Password
            </h2>

            <p style="
                color:#667a70;
                line-height:1.7;
                font-size:15px;
            ">
                We received a request to reset your
                Home Needs account password.
            </p>

            <p style="
                color:#667a70;
                line-height:1.7;
                font-size:15px;
            ">
                Click the button below to create a new password.
            </p>

            <div style="
                margin:30px 0;
            ">

                <a href="{reset_link}"
                   style="
                       display:inline-block;
                       padding:14px 30px;
                       background:#159957;
                       color:#ffffff;
                       text-decoration:none;
                       border-radius:9px;
                       font-weight:bold;
                       font-size:15px;
                   ">
                    Reset My Password →
                </a>

            </div>

            <div style="
                padding:15px;
                background:#fff7e5;
                border:1px solid #f1dfad;
                border-radius:10px;
                color:#80652a;
                font-size:13px;
                line-height:1.6;
            ">
                ⏰ This password reset link will expire
                in <strong>30 minutes</strong>.
            </div>

            <p style="
                margin-top:25px;
                color:#89958f;
                font-size:13px;
                line-height:1.6;
            ">
                If you did not request this password reset,
                you can safely ignore this email.
            </p>

        </div>


        <!-- Footer -->
        <div style="
            padding:20px;
            background:#f7faf7;
            text-align:center;
            color:#829087;
            font-size:12px;
        ">
            Home Needs • Smart Homes, Happier Families
        </div>

    </div>

</body>
</html>
"""

    message.add_alternative(
        html_content,
        subtype="html"
    )

    with smtplib.SMTP(
        SMTP_HOST,
        SMTP_PORT
    ) as server:

        server.starttls()

        server.login(
            SMTP_EMAIL,
            SMTP_APP_PASSWORD
        )

        server.send_message(message)


# ============================================================
# USER SIGNUP
# ============================================================

@auth_bp.route('/api/signup', methods=['POST'])
def signup():

    data = request.get_json(silent=True) or {}

    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    phone = data.get('phone', '').strip()
    password = data.get('password', '')

    if not name or not email or not password:
        return jsonify({
            "message": "Name, email, and password are required."
        }), 400

    if len(password) < 8:
        return jsonify({
            "message": "Password must contain at least 8 characters."
        }), 400

    connection = None
    cursor = None

    try:

        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (email,)
        )

        if cursor.fetchone():

            return jsonify({
                "message": "An account with this email already exists."
            }), 409

        password_hash = generate_password_hash(password)

        cursor.execute(
            """
            INSERT INTO users
                (name, email, phone, password_hash)
            VALUES
                (%s, %s, %s, %s)
            """,
            (
                name,
                email,
                phone or None,
                password_hash
            )
        )

        connection.commit()

        user_id = cursor.lastrowid

        session.clear()
        session['user_id'] = user_id

        return jsonify({
            "message": "Account created successfully.",
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "role": "user"
            }
        }), 201

    except Exception as e:

        if connection:
            connection.rollback()

        print(
            "Signup error:",
            str(e)
        )

        return jsonify({
            "message": "Unable to create account. Please try again."
        }), 500

    finally:

        if cursor:
            cursor.close()

        if connection:
            connection.close()


# ============================================================
# USER LOGIN
# ============================================================

@auth_bp.route('/api/login', methods=['POST'])
def login():

    data = request.get_json(silent=True) or {}

    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:

        return jsonify({
            "message": "Email and password are required."
        }), 400

    connection = None
    cursor = None

    try:

        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                id,
                name,
                email,
                password_hash,
                role
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (email,)
        )

        user = cursor.fetchone()

        if (
            not user
            or not user['password_hash']
            or not check_password_hash(
                user['password_hash'],
                password
            )
        ):

            return jsonify({
                "message": "Invalid email or password."
            }), 401

        session.clear()
        session['user_id'] = user['id']

        return jsonify({
            "message": "Login successful.",
            "user": {
                "id": user['id'],
                "name": user['name'],
                "email": user['email'],
                "role": user['role']
            }
        }), 200

    except Exception as e:

        print(
            "Login error:",
            str(e)
        )

        return jsonify({
            "message": "Unable to login. Please try again."
        }), 500

    finally:

        if cursor:
            cursor.close()

        if connection:
            connection.close()


# ============================================================
# FORGOT PASSWORD
# ============================================================

@auth_bp.route('/api/forgot-password', methods=['POST'])
def forgot_password():

    data = request.get_json(silent=True) or {}

    email = data.get(
        'email',
        ''
    ).strip().lower()

    if not email:

        return jsonify({
            "message": "Email address is required."
        }), 400

    connection = None
    cursor = None

    try:

        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                id,
                email
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (email,)
        )

        user = cursor.fetchone()

        # Do not reveal whether an account exists.
        if not user:

            return jsonify({
                "message": (
                    "If an account exists for this email, "
                    "a password reset link has been sent."
                )
            }), 200

        token = create_reset_token(
            user['email']
        )

        reset_link = (
            f"{FRONTEND_URL}"
            f"/reset-password"
            f"?token={token}"
        )

        send_password_reset_email(
            user['email'],
            reset_link
        )

        print(
            "Password reset email sent to:",
            user['email']
        )

        return jsonify({
            "message": (
                "Password reset link has been sent "
                "to your email."
            )
        }), 200

    except Exception as e:

        print(
            "Forgot password error:",
            str(e)
        )

        return jsonify({
            "message": (
                "Unable to send the reset email. "
                "Please try again later."
            )
        }), 500

    finally:

        if cursor:
            cursor.close()

        if connection:
            connection.close()


# ============================================================
# RESET PASSWORD
# ============================================================

@auth_bp.route('/api/reset-password', methods=['POST'])
def reset_password():

    data = request.get_json(silent=True) or {}

    token = data.get(
        'token',
        ''
    ).strip()

    new_password = data.get(
        'password',
        ''
    )

    confirm_password = data.get(
        'confirmPassword',
        ''
    )

    if not token:

        return jsonify({
            "message": "Password reset token is required."
        }), 400

    if not new_password:

        return jsonify({
            "message": "New password is required."
        }), 400

    if len(new_password) < 8:

        return jsonify({
            "message": (
                "Password must contain at least 8 characters."
            )
        }), 400

    if new_password != confirm_password:

        return jsonify({
            "message": "Passwords do not match."
        }), 400

    try:

        email = verify_reset_token(
            token
        )

        if not email:

            return jsonify({
                "message": (
                    "This reset link is invalid or has expired."
                )
            }), 400

        connection = None
        cursor = None

        try:

            connection = get_connection()
            cursor = connection.cursor(dictionary=True)

            cursor.execute(
                """
                SELECT id
                FROM users
                WHERE email = %s
                LIMIT 1
                """,
                (email,)
            )

            user = cursor.fetchone()

            if not user:

                return jsonify({
                    "message": (
                        "Unable to reset password for this account."
                    )
                }), 404

            new_password_hash = generate_password_hash(
                new_password
            )

            cursor.execute(
                """
                UPDATE users
                SET password_hash = %s
                WHERE id = %s
                """,
                (
                    new_password_hash,
                    user['id']
                )
            )

            connection.commit()

            # Make sure no old login session remains active.
            session.clear()

            return jsonify({
                "message": (
                    "Password changed successfully. "
                    "You can now login with your new password."
                )
            }), 200

        except Exception as e:

            if connection:
                connection.rollback()

            print(
                "Reset password database error:",
                str(e)
            )

            return jsonify({
                "message": (
                    "Unable to reset your password. "
                    "Please try again."
                )
            }), 500

        finally:

            if cursor:
                cursor.close()

            if connection:
                connection.close()

    except Exception as e:

        print(
            "Reset password error:",
            str(e)
        )

        return jsonify({
            "message": (
                "Unable to reset your password."
            )
        }), 500


# ============================================================
# GET CURRENT LOGGED-IN USER
# ============================================================

@auth_bp.route('/api/me', methods=['GET'])
def get_current_user():

    user_id = session.get('user_id')

    if not user_id:

        return jsonify({
            "message": "Not logged in."
        }), 401

    connection = None
    cursor = None

    try:

        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                id,
                name,
                email,
                phone,
                role
            FROM users
            WHERE id = %s
            """,
            (user_id,)
        )

        user = cursor.fetchone()

        if not user:

            session.clear()

            return jsonify({
                "message": "User not found."
            }), 401

        return jsonify({
            "user": user
        }), 200

    except Exception as e:

        print(
            "Current user error:",
            str(e)
        )

        return jsonify({
            "message": "Unable to retrieve user."
        }), 500

    finally:

        if cursor:
            cursor.close()

        if connection:
            connection.close()


# ============================================================
# USER LOGOUT
# ============================================================

@auth_bp.route('/api/logout', methods=['POST'])
def logout():

    session.clear()

    return jsonify({
        "message": "Logged out successfully."
    }), 200