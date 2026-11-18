
from flask import Blueprint, request, jsonify, session
from database import get_connection
import re
from ingredient_matching import (
    ingredient_key,
    canonical_ingredient_name
)
from datetime import datetime


global_recipes_bp = Blueprint(
    "global_recipes",
    __name__,
    url_prefix="/global-recipes"
)


# =========================================================
# COMMON HELPERS
# =========================================================

def get_logged_in_user():
    return session.get("user_id")


def get_user_role(cursor, user_id):
    cursor.execute(
        "SELECT role FROM users WHERE id = %s",
        (user_id,)
    )
    user = cursor.fetchone()
    return str(user.get("role", "")).lower() if user else None


def require_login():
    user_id = get_logged_in_user()

    if not user_id:
        return None, (jsonify({"message": "Unauthorized"}), 401)

    return user_id, None


def require_admin(cursor, user_id):
    return get_user_role(cursor, user_id) == "admin"


def get_ingredient_alias_map(cursor):
    """
    Use the existing admin-managed ingredient aliases.
    This keeps ingredient matching consistent with Home Needs.
    """

    cursor.execute(
        "SELECT canonical_name FROM ingredient_master"
    )
    canonical_rows = cursor.fetchall() or []

    cursor.execute("""
        SELECT
            im.canonical_name,
            ia.alias_name
        FROM ingredient_aliases ia
        JOIN ingredient_master im
            ON im.id = ia.ingredient_id
    """)
    alias_rows = cursor.fetchall() or []

    mapping = {}

    for row in canonical_rows:
        key = ingredient_key(row["canonical_name"])

        if key:
            mapping[key] = key

    for row in alias_rows:
        alias_key = ingredient_key(row["alias_name"])
        canonical_key = ingredient_key(row["canonical_name"])

        if alias_key and canonical_key:
            mapping[alias_key] = canonical_key

    return mapping


def normalize_recipe_unit(unit):
    """Normalize unit labels for safe matching when duplicate inventory names exist."""
    value = re.sub(r"[^a-z0-9]", "", str(unit or "").strip().lower())
    aliases = {
        "gram": "g", "grams": "g",
        "kilogram": "kg", "kilograms": "kg",
        "milligram": "mg", "milligrams": "mg",
        "milliliter": "ml", "milliliters": "ml",
        "millilitre": "ml", "millilitres": "ml",
        "liter": "l", "liters": "l",
        "litre": "l", "litres": "l",
        "teaspoon": "tsp", "teaspoons": "tsp",
        "tablespoon": "tbsp", "tablespoons": "tbsp",
        "cups": "cup",
        "pc": "piece", "pcs": "piece", "pieces": "piece",
        "each": "piece", "unit": "piece", "units": "piece",
        "no": "piece", "nos": "piece",
        "pack": "packet", "packs": "packet", "packets": "packet",
    }
    return aliases.get(value, value)


def resolve_recipe_inventory_product(ingredient_name, ingredient_unit, products, alias_map):
    """
    Resolve a Community Recipe ingredient to this user's inventory.

    Matching order:
    1. Exact normalized product name.
    2. Admin-approved canonical ingredient/alias.
    3. If duplicate products remain, prefer a single product whose unit
       matches the recipe ingredient unit.
    4. If still ambiguous, return None rather than guessing.
    """
    requested_key = ingredient_key(ingredient_name)
    if not requested_key:
        return None

    exact_matches = [
        product for product in products
        if ingredient_key(product.get("product_name")) == requested_key
    ]

    if exact_matches:
        candidates = exact_matches
    else:
        target_key = canonical_ingredient_name(ingredient_name, alias_map)
        candidates = [
            product for product in products
            if canonical_ingredient_name(
                product.get("product_name"), alias_map
            ) == target_key
        ]

    if len(candidates) == 1:
        return candidates[0]

    if len(candidates) > 1:
        wanted_unit = normalize_recipe_unit(ingredient_unit)
        same_unit = [
            product for product in candidates
            if normalize_recipe_unit(product.get("unit")) == wanted_unit
        ]
        if len(same_unit) == 1:
            return same_unit[0]

    # No match or ambiguous match: don't attach an arbitrary product ID.
    return None



def attach_recipe_ingredients(cursor, recipes):
    """Attach ingredient rows to recipe cards so the UI can calculate per-user stock match."""
    if not recipes:
        return recipes

    recipe_ids = [int(recipe["id"]) for recipe in recipes]
    placeholders = ",".join(["%s"] * len(recipe_ids))
    cursor.execute(f"""
        SELECT
            recipe_id,
            ingredient_name,
            required_quantity AS quantity,
            unit,
            ingredient_order
        FROM global_recipe_ingredients
        WHERE recipe_id IN ({placeholders})
        ORDER BY recipe_id, ingredient_order, id
    """, tuple(recipe_ids))

    ingredients_by_recipe = {recipe_id: [] for recipe_id in recipe_ids}
    for row in cursor.fetchall() or []:
        ingredients_by_recipe.setdefault(row["recipe_id"], []).append({
            "ingredient_name": row["ingredient_name"],
            "quantity": row["quantity"],
            "unit": row["unit"]
        })

    for recipe in recipes:
        recipe["ingredients"] = ingredients_by_recipe.get(int(recipe["id"]), [])
    return recipes

def clean_recipe_payload(data):
    """
    Validate and normalize recipe information.
    """

    recipe_name = str(data.get("recipe_name", "")).strip()
    description = str(data.get("description", "")).strip()
    category = str(data.get("category", "")).strip().title()
    cooking_type = str(data.get("cooking_type", "")).strip().title()
    meal_type = str(data.get("meal_type", "")).strip().title()
    difficulty = str(data.get("difficulty", "Easy")).strip().title()
    image_url = str(data.get("image_url", "")).strip()

    try:
        servings = int(data.get("servings", 1))
        if servings < 1 or servings > 100:
            raise ValueError
    except (TypeError, ValueError):
        raise ValueError("Servings must be a whole number between 1 and 100.")

    if not recipe_name:
        raise ValueError("Recipe name is required.")

    # Existing personal meals support meal names up to 100 characters.
    if len(recipe_name) > 100:
        raise ValueError("Recipe name must be 100 characters or fewer.")

    if len(description) > 5000:
        raise ValueError("Description is too long.")

    # Beverage recipes use their own category, meal type and cooking types.
    allowed_meal_types = ("Breakfast", "Lunch", "Snacks", "Dinner", "Beverages")
    if meal_type not in allowed_meal_types:
        raise ValueError(
            "Meal type must be Breakfast, Lunch, Snacks, Dinner or Beverages."
        )

    if meal_type == "Beverages":
        if category != "Beverages":
            raise ValueError("Food category must be Beverages for beverage recipes.")
        allowed_cooking_types = ("Quick Drink", "Healthy Drink", "Traditional Drink")
    else:
        if category not in ("Vegetarian", "Non-Vegetarian"):
            raise ValueError(
                "Category must be Vegetarian or Non-Vegetarian for food recipes."
            )
        allowed_cooking_types = ("Quick Meals", "Healthy Meals", "Traditional Meals")

    if cooking_type not in allowed_cooking_types:
        raise ValueError(
            "Cooking type must match the selected meal type."
        )

    if difficulty not in ("Easy", "Medium", "Hard"):
        raise ValueError("Invalid difficulty.")

    # Global recipe images must be selected from the shared Meal Image Gallery.
    if not image_url:
        raise ValueError("Please select an image from the Meal Image Gallery.")

    try:
        preparation_time = int(data.get("preparation_time"))
        if preparation_time <= 0:
            raise ValueError
    except (TypeError, ValueError):
        raise ValueError("Preparation time must be a positive number.")

    ingredients = data.get("ingredients", [])
    steps = data.get("steps", [])

    if not isinstance(ingredients, list) or not ingredients:
        raise ValueError("At least one ingredient is required.")

    if not isinstance(steps, list):
        raise ValueError("Preparation steps must be a list.")

    cleaned_ingredients = []

    for item in ingredients:
        if not isinstance(item, dict):
            raise ValueError("Each ingredient must be an object.")

        name = str(item.get("ingredient_name", "")).strip()
        unit = str(item.get("unit", "")).strip()

        try:
            quantity = float(item.get("quantity", 0))
        except (TypeError, ValueError):
            raise ValueError("Ingredient quantity must be a number.")

        if not name or len(name) > 150:
            raise ValueError("Ingredient name is invalid.")

        if not unit or len(unit) > 30:
            raise ValueError("Ingredient unit is invalid.")

        if quantity <= 0:
            raise ValueError("Ingredient quantity must be greater than zero.")

        cleaned_ingredients.append({
            "ingredient_name": name,
            "quantity": quantity,
            "unit": unit
        })

    if len(cleaned_ingredients) > 100:
        raise ValueError("A recipe can have at most 100 ingredients.")

    cleaned_steps = []

    for step in steps:
        step_text = str(step or "").strip()

        if step_text:
            if len(step_text) > 500:
                raise ValueError(
                    "Each instruction must be 500 characters or fewer."
                )

            cleaned_steps.append(step_text)

    if not cleaned_steps:
        raise ValueError("At least one cooking instruction is required.")

    if len(cleaned_steps) > 30:
        raise ValueError("A recipe can have at most 30 cooking steps.")

    return {
        "recipe_name": recipe_name,
        "description": description,
        "category": category,
        "meal_type": meal_type,
        "cooking_type": cooking_type,
        "difficulty": difficulty,
        "preparation_time": preparation_time,
        "servings": servings,
        "image_url": image_url or None,
        "ingredients": cleaned_ingredients,
        "steps": cleaned_steps
    }


def get_recipe_details(cursor, recipe_id):
    cursor.execute("""
        SELECT
            gr.id,
            gr.recipe_name,
            gr.description,
            gr.category,
            gr.meal_type,
            gr.preparation_time,
            gr.servings,
            gr.difficulty,
            gr.cooking_type,
            gr.image_url,
            gr.status,
            gr.submitted_by,
            gr.created_at,
            u.name AS submitted_by_name
        FROM global_recipes gr
        LEFT JOIN users u
            ON u.id = gr.submitted_by
        WHERE gr.id = %s
    """, (recipe_id,))

    recipe = cursor.fetchone()

    if not recipe:
        return None

    cursor.execute("""
        SELECT
            id,
            ingredient_name,
            required_quantity AS quantity,
            unit,
            ingredient_order
        FROM global_recipe_ingredients
        WHERE recipe_id = %s
        ORDER BY ingredient_order, id
    """, (recipe_id,))

    recipe["ingredients"] = cursor.fetchall()

    cursor.execute("""
        SELECT step_text
        FROM global_recipe_instructions
        WHERE recipe_id = %s
        ORDER BY step_order, id
    """, (recipe_id,))

    recipe["steps"] = [
        row["step_text"] for row in cursor.fetchall()
    ]

    cursor.execute("""
        SELECT
            COALESCE(AVG(rating), 0) AS average_rating,
            COUNT(*) AS rating_count
        FROM global_recipe_ratings
        WHERE recipe_id = %s
    """, (recipe_id,))

    rating_data = cursor.fetchone() or {}

    recipe["average_rating"] = float(
        rating_data.get("average_rating") or 0
    )
    recipe["rating_count"] = int(
        rating_data.get("rating_count") or 0
    )

    return recipe


# =========================================================
# 1. USER SUBMITS A GLOBAL RECIPE
# =========================================================

@global_recipes_bp.route("", methods=["POST"])
def submit_global_recipe():

    user_id, error_response = require_login()

    if error_response:
        return error_response

    data = request.get_json(silent=True) or {}

    try:
        recipe = clean_recipe_payload(data)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Confirm that the selected image belongs to the shared admin-managed gallery.
        # This prevents users from submitting arbitrary image URLs.
        cursor.execute("""
            SELECT id
            FROM meal_image_gallery
            WHERE image_url = %s
            LIMIT 1
        """, (recipe["image_url"],))

        if not cursor.fetchone():
            return jsonify({
                "error": "Please select a valid image from the Meal Image Gallery."
            }), 400

        cursor.execute("""
            INSERT INTO global_recipes (
                recipe_name,
                description,
                category,
                meal_type,
                preparation_time,
                difficulty,
                cooking_type,
                image_url,
                submitted_by,
                status,
                servings
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s)
        """, (
            recipe["recipe_name"],
            recipe["description"],
            recipe["category"],
            recipe["meal_type"],
            recipe["preparation_time"],
            recipe["difficulty"],
            recipe["cooking_type"],
            recipe["image_url"],
            user_id,
            recipe["servings"]
        ))

        recipe_id = cursor.lastrowid

        for index, item in enumerate(
            recipe["ingredients"], start=1
        ):
            cursor.execute("""
                INSERT INTO global_recipe_ingredients (
                    recipe_id,
                    ingredient_name,
                    required_quantity,
                    unit,
                    ingredient_order
                )
                VALUES (%s, %s, %s, %s, %s)
            """, (
                recipe_id,
                item["ingredient_name"],
                item["quantity"],
                item["unit"],
                index
            ))

        for index, step in enumerate(
            recipe["steps"], start=1
        ):
            cursor.execute("""
                INSERT INTO global_recipe_instructions (
                    recipe_id,
                    step_order,
                    step_text
                )
                VALUES (%s, %s, %s)
            """, (recipe_id, index, step))

        connection.commit()

        return jsonify({
            "message": "Recipe submitted successfully. Waiting for admin approval.",
            "recipe_id": recipe_id,
            "status": "pending"
        }), 201

    except Exception as error:
        connection.rollback()
        print("Global recipe submission error:", error)

        return jsonify({
            "error": "Unable to submit recipe."
        }), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# SHARE AN EXISTING PERSONAL MEAL WITH THE COMMUNITY
# =========================================================

@global_recipes_bp.route("/share-meal/<int:meal_id>", methods=["POST"])
def share_personal_meal(meal_id):
    """Copy a user's saved meal into community submissions for admin review.

    The client sends only the personal meal ID. All recipe content is read from
    the database after checking ownership, so clients cannot submit altered
    ingredients, instructions, or image URLs through this endpoint.
    """
    user_id, error_response = require_login()
    if error_response:
        return error_response

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                m.id,
                m.meal_name,
                m.description,
                m.category,
                m.meal_type,
                m.preparation_time,
                m.servings,
                m.difficulty,
                m.cooking_type,
                umi.image_url
            FROM meals m
            LEFT JOIN user_meal_images umi
                ON umi.meal_id = m.id AND umi.user_id = m.user_id
            WHERE m.id = %s AND m.user_id = %s
            LIMIT 1
        """, (meal_id, user_id))
        meal = cursor.fetchone()

        if not meal:
            return jsonify({"error": "Meal not found or you do not have permission to share it."}), 404

        if not meal.get("image_url"):
            return jsonify({"error": "Please select an image for this meal from the Meal Image Gallery before sharing."}), 400

        cursor.execute("""
            SELECT id FROM meal_image_gallery
            WHERE image_url = %s
            LIMIT 1
        """, (meal["image_url"],))
        if not cursor.fetchone():
            return jsonify({"error": "The selected meal image is not in the shared Meal Image Gallery. Please choose a gallery image."}), 400

        cursor.execute("""
            SELECT ingredient_name, required_quantity AS quantity, unit
            FROM meal_ingredients
            WHERE meal_id = %s
            ORDER BY id
        """, (meal_id,))
        ingredients = cursor.fetchall() or []

        cursor.execute("""
            SELECT step_text
            FROM meal_preparation_steps
            WHERE meal_id = %s
            ORDER BY step_order, id
        """, (meal_id,))
        steps = [row["step_text"] for row in (cursor.fetchall() or []) if row.get("step_text")]

        if not ingredients:
            return jsonify({"error": "Add at least one ingredient to this meal before sharing."}), 400
        if not steps:
            return jsonify({"error": "Add preparation instructions to this meal before sharing."}), 400

        # Avoid multiple active submissions of the same meal name by this user.
        # Rejected submissions can be shared again after the user edits the meal.
        cursor.execute("""
            SELECT id, status
            FROM global_recipes
            WHERE submitted_by = %s
              AND LOWER(TRIM(recipe_name)) = LOWER(TRIM(%s))
              AND status IN ('pending', 'approved')
            ORDER BY id DESC
            LIMIT 1
        """, (user_id, meal["meal_name"]))
        existing = cursor.fetchone()
        if existing:
            return jsonify({
                "error": "This meal already has an active community submission.",
                "recipe_id": existing["id"],
                "status": existing["status"]
            }), 409

        category = meal.get("category") or "Vegetarian"
        if category not in ("Vegetarian", "Non-Vegetarian"):
            category = "Vegetarian"

        cooking_type = meal.get("cooking_type") or "Quick Meals"
        if cooking_type not in ("Quick Meals", "Healthy Meals", "Traditional Meals"):
            cooking_type = "Quick Meals"

        difficulty = meal.get("difficulty") or "Easy"
        if difficulty not in ("Easy", "Medium", "Hard"):
            difficulty = "Easy"

        preparation_time = int(meal.get("preparation_time") or 30)
        if preparation_time <= 0:
            preparation_time = 30

        meal_type = str(meal.get("meal_type") or "Uncategorized").strip().title()
        if meal_type not in ("Breakfast", "Lunch", "Dinner", "Snacks"):
            return jsonify({"error": "Please classify this meal as Breakfast, Lunch, Dinner or Snacks before sharing."}), 400

        cursor.execute("""
            INSERT INTO global_recipes (
                recipe_name, description, category, meal_type, preparation_time,
                difficulty, cooking_type, image_url, submitted_by, status,
                servings
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s)
        """, (
            meal["meal_name"], meal.get("description"), category, meal_type,
            preparation_time, difficulty, cooking_type,
            meal["image_url"], user_id, meal.get("servings") or 1
        ))
        recipe_id = cursor.lastrowid

        for index, item in enumerate(ingredients, start=1):
            cursor.execute("""
                INSERT INTO global_recipe_ingredients (
                    recipe_id, ingredient_name, required_quantity,
                    unit, ingredient_order
                ) VALUES (%s, %s, %s, %s, %s)
            """, (
                recipe_id, item["ingredient_name"], item["quantity"],
                item["unit"], index
            ))

        for index, step in enumerate(steps, start=1):
            cursor.execute("""
                INSERT INTO global_recipe_instructions (
                    recipe_id, step_order, step_text
                ) VALUES (%s, %s, %s)
            """, (recipe_id, index, step))

        connection.commit()
        return jsonify({
            "message": "Your meal was shared successfully and is waiting for admin approval.",
            "recipe_id": recipe_id,
            "status": "pending"
        }), 201

    except Exception as error:
        connection.rollback()
        print("Share personal meal error:", error)
        return jsonify({"error": "Unable to share this meal right now."}), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# 2. USER VIEWS THEIR OWN SUBMISSIONS
# =========================================================

@global_recipes_bp.route("/my-submissions", methods=["GET"])
def get_my_submissions():

    user_id, error_response = require_login()

    if error_response:
        return error_response

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                id,
                recipe_name,
                category,
                meal_type,
                servings,
                image_url,
                status,
                rejection_reason,
                created_at
            FROM global_recipes
            WHERE submitted_by = %s
            ORDER BY id DESC
        """, (user_id,))

        recipes = cursor.fetchall()
        attach_recipe_ingredients(cursor, recipes)
        return jsonify(recipes), 200

    except Exception as error:
        print("My recipe submissions error:", error)
        return jsonify({"error": "Unable to load submissions."}), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# 3. ADMIN VIEWS PENDING RECIPES
# =========================================================

@global_recipes_bp.route("/admin/pending", methods=["GET"])
def get_pending_global_recipes():

    user_id, error_response = require_login()

    if error_response:
        return error_response

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        if not require_admin(cursor, user_id):
            return jsonify({"message": "Admin access required."}), 403

        cursor.execute("""
            SELECT
                gr.id,
                gr.recipe_name,
                gr.description,
                gr.category,
                gr.meal_type,
                gr.preparation_time,
                gr.servings,
                gr.difficulty,
                gr.cooking_type,
                gr.image_url,
                gr.submitted_by,
                gr.created_at,
                u.name AS submitted_by_name
            FROM global_recipes gr
            LEFT JOIN users u
                ON u.id = gr.submitted_by
            WHERE gr.status = 'pending'
            ORDER BY gr.created_at ASC
        """)

        recipes = cursor.fetchall()

        for recipe in recipes:
            cursor.execute("""
                SELECT
                    ingredient_name,
                    required_quantity AS quantity,
                    unit
                FROM global_recipe_ingredients
                WHERE recipe_id = %s
                ORDER BY ingredient_order, id
            """, (recipe["id"],))

            recipe["ingredients"] = cursor.fetchall()

            cursor.execute("""
                SELECT step_text
                FROM global_recipe_instructions
                WHERE recipe_id = %s
                ORDER BY step_order, id
            """, (recipe["id"],))

            recipe["steps"] = [
                row["step_text"] for row in cursor.fetchall()
            ]

        return jsonify(recipes), 200

    except Exception as error:
        print("Pending global recipes error:", error)
        return jsonify({"error": "Unable to load pending recipes."}), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# 4. ADMIN APPROVES OR REJECTS A RECIPE
# =========================================================

@global_recipes_bp.route("/admin/<int:recipe_id>/review", methods=["PATCH"])
def review_global_recipe(recipe_id):

    user_id, error_response = require_login()

    if error_response:
        return error_response

    data = request.get_json(silent=True) or {}

    status = str(data.get("status", "")).strip().lower()
    rejection_reason = str(
        data.get("rejection_reason", "")
    ).strip()

    if status not in ("approved", "rejected"):
        return jsonify({
            "error": "Status must be approved or rejected."
        }), 400

    if status == "rejected" and not rejection_reason:
        return jsonify({
            "error": "Please provide a rejection reason."
        }), 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        if not require_admin(cursor, user_id):
            return jsonify({"message": "Admin access required."}), 403

        cursor.execute("""
            SELECT id, status
            FROM global_recipes
            WHERE id = %s
            FOR UPDATE
        """, (recipe_id,))

        recipe = cursor.fetchone()

        if not recipe:
            return jsonify({"error": "Recipe not found."}), 404

        if recipe["status"] != "pending":
            return jsonify({
                "error": "This recipe has already been reviewed."
            }), 409

        cursor.execute("""
            UPDATE global_recipes
            SET
                status = %s,
                reviewed_by = %s,
                rejection_reason = %s,
                reviewed_at = %s,
                updated_at = %s
            WHERE id = %s
        """, (
            status,
            user_id,
            rejection_reason if status == "rejected" else None,
            datetime.now(),
            datetime.now(),
            recipe_id
        ))

        connection.commit()

        return jsonify({
            "message": (
                "Recipe approved successfully."
                if status == "approved"
                else "Recipe rejected successfully."
            ),
            "recipe_id": recipe_id,
            "status": status
        }), 200

    except Exception as error:
        connection.rollback()
        print("Global recipe review error:", error)

        return jsonify({"error": "Unable to review recipe."}), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# 5. BROWSE APPROVED GLOBAL RECIPES
# =========================================================

@global_recipes_bp.route("", methods=["GET"])
def browse_global_recipes():

    user_id, error_response = require_login()

    if error_response:
        return error_response

    search = str(request.args.get("search", "")).strip()
    category = str(request.args.get("category", "")).strip()
    cooking_type = str(request.args.get("cooking_type", "")).strip()
    meal_type = str(request.args.get("meal_type", "")).strip().title()

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        query = """
            SELECT
                gr.id,
                gr.recipe_name,
                gr.description,
                gr.category,
                gr.meal_type,
                gr.preparation_time,
                gr.servings,
                gr.difficulty,
                gr.cooking_type,
                gr.image_url,
                gr.created_at,
                u.name AS submitted_by_name,

                COALESCE(r.avg_rating, 0) AS average_rating,
                COALESCE(r.rating_count, 0) AS rating_count,

                CASE
                    WHEN s.id IS NULL THEN 0
                    ELSE 1
                END AS is_saved

            FROM global_recipes gr

            LEFT JOIN users u
                ON u.id = gr.submitted_by

            LEFT JOIN (
                SELECT
                    recipe_id,
                    AVG(rating) AS avg_rating,
                    COUNT(*) AS rating_count
                FROM global_recipe_ratings
                GROUP BY recipe_id
            ) r ON r.recipe_id = gr.id

            LEFT JOIN global_recipe_saves s
                ON s.recipe_id = gr.id
                AND s.user_id = %s

            WHERE gr.status = 'approved'
        """

        params = [user_id]

        if search:
            query += " AND gr.recipe_name LIKE %s"
            params.append(f"%{search}%")

        if category:
            query += " AND gr.category = %s"
            params.append(category)

        if cooking_type:
            query += " AND gr.cooking_type = %s"
            params.append(cooking_type)

        # Include Beverages as a valid explicit filter. The frontend defaults
        # to the current time-based food category, but users can still select
        # Beverages manually from the category dropdown.
        if meal_type in ("Breakfast", "Lunch", "Dinner", "Snacks", "Beverages"):
            query += " AND gr.meal_type = %s"
            params.append(meal_type)

        query += " ORDER BY gr.created_at DESC"

        cursor.execute(query, tuple(params))
        recipes = cursor.fetchall()
        attach_recipe_ingredients(cursor, recipes)

        return jsonify(recipes), 200

    except Exception as error:
        print("Browse global recipes error:", error)
        return jsonify({"error": "Unable to load recipes."}), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# 6. VIEW ONE GLOBAL RECIPE
# =========================================================

@global_recipes_bp.route("/<int:recipe_id>", methods=["GET"])
def get_global_recipe(recipe_id):

    user_id, error_response = require_login()

    if error_response:
        return error_response

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT status, submitted_by
            FROM global_recipes
            WHERE id = %s
        """, (recipe_id,))

        access = cursor.fetchone()

        if not access:
            return jsonify({"error": "Recipe not found."}), 404

        is_admin = require_admin(cursor, user_id)

        if (
            access["status"] != "approved"
            and access["submitted_by"] != user_id
            and not is_admin
        ):
            return jsonify({"error": "Recipe not found."}), 404

        recipe = get_recipe_details(cursor, recipe_id)

        cursor.execute("""
            SELECT id
            FROM global_recipe_saves
            WHERE user_id = %s AND recipe_id = %s
        """, (user_id, recipe_id))

        recipe["is_saved"] = bool(cursor.fetchone())

        cursor.execute("""
            SELECT rating, review_text
            FROM global_recipe_ratings
            WHERE user_id = %s AND recipe_id = %s
        """, (user_id, recipe_id))

        own_rating = cursor.fetchone()
        recipe["my_rating"] = own_rating

        return jsonify(recipe), 200

    except Exception as error:
        print("Get global recipe error:", error)
        return jsonify({"error": "Unable to load recipe."}), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# 7. SAVE OR UNSAVE A RECIPE
# =========================================================

@global_recipes_bp.route("/<int:recipe_id>/save", methods=["POST", "DELETE"])
def save_global_recipe(recipe_id):

    user_id, error_response = require_login()

    if error_response:
        return error_response

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT id
            FROM global_recipes
            WHERE id = %s AND status = 'approved'
        """, (recipe_id,))

        if not cursor.fetchone():
            return jsonify({"error": "Approved recipe not found."}), 404

        if request.method == "POST":
            cursor.execute("""
                INSERT IGNORE INTO global_recipe_saves
                    (user_id, recipe_id)
                VALUES (%s, %s)
            """, (user_id, recipe_id))

            message = "Recipe saved successfully."
            is_saved = True

        else:
            cursor.execute("""
                DELETE FROM global_recipe_saves
                WHERE user_id = %s AND recipe_id = %s
            """, (user_id, recipe_id))

            message = "Recipe removed from saved recipes."
            is_saved = False

        connection.commit()

        return jsonify({
            "message": message,
            "is_saved": is_saved
        }), 200

    except Exception as error:
        connection.rollback()
        print("Save global recipe error:", error)
        return jsonify({"error": "Unable to update saved recipe."}), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# 8. GET USER'S SAVED RECIPES
# =========================================================

@global_recipes_bp.route("/saved", methods=["GET"])
def get_saved_global_recipes():

    user_id, error_response = require_login()

    if error_response:
        return error_response

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                gr.id,
                gr.recipe_name,
                gr.description,
                gr.category,
                gr.meal_type,
                gr.preparation_time,
                gr.servings,
                gr.difficulty,
                gr.cooking_type,
                gr.image_url,
                gr.created_at
            FROM global_recipe_saves s
            JOIN global_recipes gr
                ON gr.id = s.recipe_id
            WHERE s.user_id = %s
              AND gr.status = 'approved'
            ORDER BY s.created_at DESC
        """, (user_id,))

        recipes = cursor.fetchall()
        attach_recipe_ingredients(cursor, recipes)
        return jsonify(recipes), 200

    except Exception as error:
        print("Saved global recipes error:", error)
        return jsonify({"error": "Unable to load saved recipes."}), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# 9. ADD OR UPDATE A RECIPE RATING
# =========================================================

@global_recipes_bp.route("/<int:recipe_id>/rating", methods=["POST"])
def rate_global_recipe(recipe_id):

    user_id, error_response = require_login()

    if error_response:
        return error_response

    data = request.get_json(silent=True) or {}

    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        return jsonify({"error": "Rating must be between 1 and 5."}), 400

    if rating < 1 or rating > 5:
        return jsonify({"error": "Rating must be between 1 and 5."}), 400

    review_text = str(data.get("review_text", "")).strip()

    if len(review_text) > 2000:
        return jsonify({"error": "Review is too long."}), 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT id
            FROM global_recipes
            WHERE id = %s AND status = 'approved'
        """, (recipe_id,))

        if not cursor.fetchone():
            return jsonify({"error": "Approved recipe not found."}), 404

        cursor.execute("""
            INSERT INTO global_recipe_ratings (
                user_id,
                recipe_id,
                rating,
                review_text
            )
            VALUES (%s, %s, %s, %s)

            ON DUPLICATE KEY UPDATE
                rating = VALUES(rating),
                review_text = VALUES(review_text),
                updated_at = %s
        """, (
            user_id,
            recipe_id,
            rating,
            review_text or None,
            datetime.now()
        ))

        connection.commit()

        return jsonify({
            "message": "Your rating has been saved.",
            "rating": rating
        }), 200

    except Exception as error:
        connection.rollback()
        print("Global recipe rating error:", error)
        return jsonify({"error": "Unable to save rating."}), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# 10. GET RECIPE REVIEWS
# =========================================================

@global_recipes_bp.route("/<int:recipe_id>/reviews", methods=["GET"])
def get_global_recipe_reviews(recipe_id):

    user_id, error_response = require_login()

    if error_response:
        return error_response

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT id
            FROM global_recipes
            WHERE id = %s AND status = 'approved'
        """, (recipe_id,))

        if not cursor.fetchone():
            return jsonify({"error": "Approved recipe not found."}), 404

        cursor.execute("""
            SELECT
                r.rating,
                r.review_text,
                r.created_at,
                u.name AS reviewer_name
            FROM global_recipe_ratings r
            JOIN users u
                ON u.id = r.user_id
            WHERE r.recipe_id = %s
              AND r.review_text IS NOT NULL
              AND r.review_text != ''
            ORDER BY r.updated_at DESC
        """, (recipe_id,))

        return jsonify(cursor.fetchall()), 200

    except Exception as error:
        print("Global recipe reviews error:", error)
        return jsonify({"error": "Unable to load reviews."}), 500

    finally:
        cursor.close()
        connection.close()


# =========================================================
# 11. ADD GLOBAL RECIPE TO USER'S PERSONAL MEALS
# =========================================================

@global_recipes_bp.route("/<int:recipe_id>/add-to-my-meals", methods=["POST"])
def add_global_recipe_to_my_meals(recipe_id):

    user_id, error_response = require_login()

    if error_response:
        return error_response

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Lock the approved global recipe while making the copy.
        cursor.execute("""
            SELECT *
            FROM global_recipes
            WHERE id = %s
              AND status = 'approved'
            FOR UPDATE
        """, (recipe_id,))

        recipe = cursor.fetchone()

        if not recipe:
            return jsonify({"error": "Approved recipe not found."}), 404

        # Prevent duplicate imports.
        cursor.execute("""
            SELECT meal_id
            FROM user_global_recipe_imports
            WHERE user_id = %s
              AND global_recipe_id = %s
        """, (user_id, recipe_id))

        existing_import = cursor.fetchone()

        if existing_import:
            return jsonify({
                "message": "This recipe is already in My Meals.",
                "meal_id": existing_import["meal_id"],
                "already_added": True
            }), 200

        # Get original ingredients.
        cursor.execute("""
            SELECT
                ingredient_name,
                required_quantity,
                unit
            FROM global_recipe_ingredients
            WHERE recipe_id = %s
            ORDER BY ingredient_order, id
        """, (recipe_id,))

        ingredients = cursor.fetchall()

        # Get original cooking instructions.
        cursor.execute("""
            SELECT step_text
            FROM global_recipe_instructions
            WHERE recipe_id = %s
            ORDER BY step_order, id
        """, (recipe_id,))

        steps = cursor.fetchall()

        if not ingredients or not steps:
            return jsonify({
                "error": "This recipe is missing ingredients or instructions."
            }), 400

        # Check duplicate personal meal name.
        cursor.execute("""
            SELECT id
            FROM meals
            WHERE user_id = %s
              AND meal_name = %s
            LIMIT 1
        """, (user_id, recipe["recipe_name"]))

        existing_meal = cursor.fetchone()

        if existing_meal:
            return jsonify({
                "error": (
                    "A personal meal with this name already exists. "
                    "Rename or remove that meal before importing this recipe."
                ),
                "existing_meal_id": existing_meal["id"]
            }), 409

        # Create a separate personal copy.
        cursor.execute("""
            INSERT INTO meals (
                meal_name,
                description,
                preparation_time,
                difficulty,
                category,
                cooking_type,
                meal_type,
                user_id,
                servings
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            recipe["recipe_name"],
            recipe["description"],
            recipe["preparation_time"],
            recipe["difficulty"],
            recipe["category"],
            recipe["cooking_type"],
            recipe.get("meal_type") or "Uncategorized",
            user_id,
            recipe.get("servings") or 1
        ))

        meal_id = cursor.lastrowid

        # Get only the logged-in user's inventory.
        cursor.execute("""
            SELECT id, product_name, unit
            FROM products
            WHERE user_id = %s
        """, (user_id,))

        products = cursor.fetchall()
        alias_map = get_ingredient_alias_map(cursor)

        # Copy ingredients and match only this user's products.
        for item in ingredients:

            matched_product = resolve_recipe_inventory_product(
                item["ingredient_name"],
                item.get("unit"),
                products,
                alias_map
            )

            product_id = (
                matched_product["id"]
                if matched_product else None
            )

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
                item["required_quantity"],
                item["ingredient_name"],
                item["unit"]
            ))

        # Copy cooking instructions.
        for index, step in enumerate(steps, start=1):
            cursor.execute("""
                INSERT INTO meal_preparation_steps (
                    meal_id,
                    step_order,
                    step_text
                )
                VALUES (%s, %s, %s)
            """, (
                meal_id,
                index,
                step["step_text"]
            ))

        # Copy the image into the user's personal meal image record.
        if recipe.get("image_url"):
            cursor.execute("""
                INSERT INTO user_meal_images (
                    user_id,
                    meal_id,
                    image_url
                )
                VALUES (%s, %s, %s)
            """, (
                user_id,
                meal_id,
                recipe["image_url"]
            ))

        # Record the relationship between the original and personal copy.
        cursor.execute("""
            INSERT INTO user_global_recipe_imports (
                user_id,
                global_recipe_id,
                meal_id
            )
            VALUES (%s, %s, %s)
        """, (
            user_id,
            recipe_id,
            meal_id
        ))

        connection.commit()

        return jsonify({
            "message": "Recipe added to My Meals successfully.",
            "meal_id": meal_id,
            "global_recipe_id": recipe_id,
            "already_added": False
        }), 201

    except Exception as error:
        connection.rollback()
        print("Add global recipe to personal meals error:", error)

        return jsonify({
            "error": "Unable to add recipe to My Meals."
        }), 500

    finally:
        cursor.close()
        connection.close()
