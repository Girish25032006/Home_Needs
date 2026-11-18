from datetime import datetime, date, timedelta
from flask import Blueprint, request, jsonify, session
from database import get_connection

meal_planner_bp = Blueprint("meal_planner", __name__, url_prefix="/meal-planner")
VALID_MEAL_TYPES = {"Breakfast", "Lunch", "Dinner", "Snacks"}
VALID_SOURCES = {"own", "global"}
VALID_STATUSES = {"Planned", "Cooked", "Skipped"}


def _user_id():
    return session.get("user_id")


def _parse_date(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def _get_or_create_plan(cursor, user_id, plan_date):
    cursor.execute(
        "SELECT id FROM meal_plans WHERE user_id=%s AND plan_date=%s",
        (user_id, plan_date),
    )
    row = cursor.fetchone()
    if row:
        return row["id"]
    cursor.execute(
        "INSERT INTO meal_plans (user_id, plan_date) VALUES (%s, %s)",
        (user_id, plan_date),
    )
    return cursor.lastrowid


def _validate_recipe(cursor, user_id, source, recipe_id):
    if source == "own":
        cursor.execute(
            """SELECT id, meal_name AS recipe_name, meal_type, servings
               FROM meals WHERE id=%s AND user_id=%s LIMIT 1""",
            (recipe_id, user_id),
        )
    else:
        cursor.execute(
            """SELECT id, recipe_name, meal_type, servings
               FROM global_recipes
               WHERE id=%s AND status='approved' LIMIT 1""",
            (recipe_id,),
        )
    return cursor.fetchone()


def _format_item(row):
    plan_date = row["plan_date"]
    cooked_at = row.get("cooked_at")
    created_at = row.get("created_at")
    return {
        "id": row["id"],
        "plan_id": row["plan_id"],
        "plan_date": plan_date.isoformat() if hasattr(plan_date, "isoformat") else str(plan_date),
        "recipe_source": row["recipe_source"],
        "recipe_id": row["recipe_id"],
        "recipe_name": row.get("recipe_name") or "Recipe unavailable",
        "meal_type": row["meal_type"],
        "servings": int(row["servings"]),
        "status": row["status"],
        "cooked_at": cooked_at.isoformat() if hasattr(cooked_at, "isoformat") else (str(cooked_at) if cooked_at else None),
        "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else (str(created_at) if created_at else None),
        "recipe_unavailable": not bool(row.get("available_recipe_id")),
    }


@meal_planner_bp.route("", methods=["GET"])
def get_meal_plan():
    user_id = _user_id()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    requested_date = request.args.get("date")
    start_value, end_value = request.args.get("start_date"), request.args.get("end_date")
    if requested_date:
        start_date = _parse_date(requested_date)
        if not start_date:
            return jsonify({"error": "date must use YYYY-MM-DD format"}), 400
        end_date = start_date
    elif start_value or end_value:
        start_date, end_date = _parse_date(start_value), _parse_date(end_value)
        if not start_date or not end_date:
            return jsonify({"error": "start_date and end_date must use YYYY-MM-DD format"}), 400
        if end_date < start_date:
            return jsonify({"error": "end_date cannot be before start_date"}), 400
        if (end_date - start_date).days > 30:
            return jsonify({"error": "Maximum date range is 31 days"}), 400
    else:
        today = date.today()
        start_date = today - timedelta(days=today.weekday())
        end_date = start_date + timedelta(days=6)

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT mpi.id, mpi.plan_id, mp.plan_date, mpi.recipe_source,
                      mpi.recipe_id, mpi.meal_type, mpi.servings, mpi.status,
                      mpi.cooked_at, mpi.created_at,
                      CASE WHEN mpi.recipe_source='own' THEN m.meal_name
                           ELSE gr.recipe_name END AS recipe_name,
                      CASE WHEN mpi.recipe_source='own' THEN m.id
                           ELSE gr.id END AS available_recipe_id
               FROM meal_plan_items mpi
               JOIN meal_plans mp ON mp.id=mpi.plan_id
               LEFT JOIN meals m
                 ON mpi.recipe_source='own' AND m.id=mpi.recipe_id
                AND m.user_id=mp.user_id
               LEFT JOIN global_recipes gr
                 ON mpi.recipe_source='global' AND gr.id=mpi.recipe_id
                AND gr.status='approved'
               WHERE mp.user_id=%s AND mp.plan_date BETWEEN %s AND %s
               ORDER BY mp.plan_date,
                 FIELD(mpi.meal_type,'Breakfast','Lunch','Dinner','Snacks'),
                 mpi.id""",
            (user_id, start_date, end_date),
        )
        items = [_format_item(row) for row in (cursor.fetchall() or [])]
        return jsonify({
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "items": items,
        }), 200
    except Exception as error:
        print("Get meal plan error:", error)
        return jsonify({"error": "Unable to load meal plan"}), 500
    finally:
        cursor.close()
        conn.close()


@meal_planner_bp.route("", methods=["POST"])
def add_meal_plan_item():
    user_id = _user_id()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    plan_date = _parse_date(data.get("plan_date"))
    source = str(data.get("recipe_source", "")).strip().lower()
    meal_type = str(data.get("meal_type", "")).strip().title()
    try:
        recipe_id = int(data.get("recipe_id"))
        servings = int(data.get("servings", 1))
        if recipe_id < 1 or not 1 <= servings <= 100:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "recipe_id must be valid and servings must be between 1 and 100"}), 400
    if not plan_date:
        return jsonify({"error": "plan_date must use YYYY-MM-DD format"}), 400
    if source not in VALID_SOURCES:
        return jsonify({"error": "recipe_source must be 'own' or 'global'"}), 400
    if meal_type not in VALID_MEAL_TYPES:
        return jsonify({"error": "Invalid meal_type"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        recipe = _validate_recipe(cursor, user_id, source, recipe_id)
        if not recipe:
            conn.rollback()
            return jsonify({"error": "Recipe not found, not owned by you, or community recipe is not approved"}), 404
        plan_id = _get_or_create_plan(cursor, user_id, plan_date)
        cursor.execute(
            """INSERT INTO meal_plan_items
               (plan_id, recipe_source, recipe_id, meal_type, servings, status)
               VALUES (%s,%s,%s,%s,%s,'Planned')""",
            (plan_id, source, recipe_id, meal_type, servings),
        )
        item_id = cursor.lastrowid
        cursor.execute(
            "UPDATE meal_plans SET updated_at=NOW() WHERE id=%s AND user_id=%s",
            (plan_id, user_id),
        )
        conn.commit()
        return jsonify({
            "message": "Recipe added to meal plan",
            "item": {
                "id": item_id, "plan_id": plan_id, "plan_date": plan_date.isoformat(),
                "recipe_source": source, "recipe_id": recipe_id,
                "recipe_name": recipe["recipe_name"], "meal_type": meal_type,
                "servings": servings, "status": "Planned",
                "recipe_unavailable": False,
            },
        }), 201
    except Exception as error:
        conn.rollback()
        print("Add meal plan item error:", error)
        return jsonify({"error": "Unable to add recipe to meal plan"}), 500
    finally:
        cursor.close()
        conn.close()


@meal_planner_bp.route("/items/<int:item_id>", methods=["PUT"])
def update_meal_plan_item(item_id):
    user_id = _user_id()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    if not data or not ({"servings", "status"} & set(data)):
        return jsonify({"error": "Provide servings and/or status"}), 400

    servings = None
    status = None
    if "servings" in data:
        try:
            servings = int(data["servings"])
            if not 1 <= servings <= 100:
                raise ValueError
        except (TypeError, ValueError):
            return jsonify({"error": "Servings must be between 1 and 100"}), 400
    if "status" in data:
        status = str(data["status"]).strip().title()
        if status not in VALID_STATUSES:
            return jsonify({"error": "Status must be Planned, Cooked or Skipped"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cursor.execute(
            """SELECT mpi.id, mpi.plan_id FROM meal_plan_items mpi
               JOIN meal_plans mp ON mp.id=mpi.plan_id
               WHERE mpi.id=%s AND mp.user_id=%s FOR UPDATE""",
            (item_id, user_id),
        )
        item = cursor.fetchone()
        if not item:
            conn.rollback()
            return jsonify({"error": "Planned recipe not found"}), 404

        assignments, values = [], []
        if servings is not None:
            assignments.append("servings=%s")
            values.append(servings)
        if status is not None:
            assignments.append("status=%s")
            values.append(status)
            assignments.append("cooked_at=NOW()" if status == "Cooked" else "cooked_at=NULL")
        assignments.append("updated_at=NOW()")
        values.append(item_id)
        cursor.execute(
            f"UPDATE meal_plan_items SET {', '.join(assignments)} WHERE id=%s",
            tuple(values),
        )
        cursor.execute("UPDATE meal_plans SET updated_at=NOW() WHERE id=%s", (item["plan_id"],))
        conn.commit()
        return jsonify({"message": "Meal plan item updated", "id": item_id}), 200
    except Exception as error:
        conn.rollback()
        print("Update meal plan item error:", error)
        return jsonify({"error": "Unable to update planned recipe"}), 500
    finally:
        cursor.close()
        conn.close()


@meal_planner_bp.route("/items/<int:item_id>", methods=["DELETE"])
def delete_meal_plan_item(item_id):
    user_id = _user_id()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()
        cursor.execute(
            """SELECT mpi.plan_id FROM meal_plan_items mpi
               JOIN meal_plans mp ON mp.id=mpi.plan_id
               WHERE mpi.id=%s AND mp.user_id=%s FOR UPDATE""",
            (item_id, user_id),
        )
        item = cursor.fetchone()
        if not item:
            conn.rollback()
            return jsonify({"error": "Planned recipe not found"}), 404
        cursor.execute("DELETE FROM meal_plan_items WHERE id=%s", (item_id,))
        cursor.execute("UPDATE meal_plans SET updated_at=NOW() WHERE id=%s", (item["plan_id"],))
        conn.commit()
        return jsonify({"message": "Planned recipe removed", "id": item_id}), 200
    except Exception as error:
        conn.rollback()
        print("Delete meal plan item error:", error)
        return jsonify({"error": "Unable to remove planned recipe"}), 500
    finally:
        cursor.close()
        conn.close()

# =========================================================
# INVENTORY AVAILABILITY FOR A PLANNED RECIPE
# This endpoint is read-only: it never changes product stock.
# =========================================================

@meal_planner_bp.route("/items/<int:item_id>/availability", methods=["GET"])
def get_planned_recipe_availability(item_id):
    user_id = _user_id()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT mpi.id, mpi.recipe_source, mpi.recipe_id, mpi.servings,
                   mp.user_id, mp.plan_date
            FROM meal_plan_items mpi
            JOIN meal_plans mp ON mp.id = mpi.plan_id
            WHERE mpi.id = %s AND mp.user_id = %s
            LIMIT 1
        """, (item_id, user_id))
        planned = cursor.fetchone()

        if not planned:
            return jsonify({"error": "Planned recipe not found"}), 404

        source = planned["recipe_source"]
        recipe_id = planned["recipe_id"]

        if source == "own":
            cursor.execute("""
                SELECT id, meal_name AS recipe_name, servings
                FROM meals WHERE id = %s AND user_id = %s
                LIMIT 1
            """, (recipe_id, user_id))
            recipe = cursor.fetchone()
            ingredient_table = "meal_ingredients"
            fk_column = "meal_id"
        else:
            cursor.execute("""
                SELECT id, recipe_name, servings
                FROM global_recipes
                WHERE id = %s AND status = 'approved'
                LIMIT 1
            """, (recipe_id,))
            recipe = cursor.fetchone()
            ingredient_table = "global_recipe_ingredients"
            fk_column = "recipe_id"

        if not recipe:
            return jsonify({"error": "Recipe is no longer available"}), 404

        cursor.execute(f"""
            SELECT ingredient_name, required_quantity, unit
            FROM {ingredient_table}
            WHERE {fk_column} = %s
            ORDER BY id
        """, (recipe_id,))
        ingredients = cursor.fetchall() or []

        if not ingredients:
            return jsonify({"error": "This recipe has no ingredients"}), 400

        # Use the same canonical/alias rules already used by Home Needs.
        from ingredient_matching import ingredient_key, canonical_ingredient_name

        cursor.execute("""
            SELECT im.canonical_name, ia.alias_name
            FROM ingredient_master im
            LEFT JOIN ingredient_aliases ia ON ia.ingredient_id = im.id
        """)
        alias_map = {}
        for row in cursor.fetchall() or []:
            canonical = ingredient_key(row.get("canonical_name"))
            alias = ingredient_key(row.get("alias_name")) if row.get("alias_name") else None
            if canonical:
                alias_map[canonical] = canonical
            if alias and canonical:
                alias_map[alias] = canonical

        cursor.execute("""
            SELECT id, product_name, quantity, unit
            FROM products
            WHERE user_id = %s
            ORDER BY id
        """, (user_id,))
        products = cursor.fetchall() or []

        # Conversion factors use the same unit conventions as the cooking API.
        import re
        from collections import deque

        def norm_unit(unit):
            raw = re.sub(r"\([^)]*\)", "", str(unit or "").strip().lower())
            value = re.sub(r"[^a-z0-9]", "", raw)
            aliases = {
                "milligram": "mg", "milligrams": "mg",
                "gram": "g", "grams": "g", "kilogram": "kg", "kilograms": "kg",
                "milliliter": "ml", "milliliters": "ml",
                "millilitre": "ml", "millilitres": "ml",
                "liter": "l", "liters": "l", "litre": "l", "litres": "l",
                "teaspoon": "tsp", "teaspoons": "tsp",
                "tablespoon": "tbsp", "tablespoons": "tbsp", "cups": "cup",
                "pc": "piece", "pcs": "piece", "pieces": "piece",
                "each": "piece", "unit": "piece", "units": "piece",
                "no": "piece", "nos": "piece",
                "pack": "packet", "packs": "packet", "packets": "packet",
                "bottles": "bottle", "boxes": "box"
            }
            return aliases.get(value, value)

        standard = {
            "mg": ("mass", .001), "g": ("mass", 1.0), "kg": ("mass", 1000.0),
            "ml": ("volume", 1.0), "l": ("volume", 1000.0),
            "tsp": ("volume", 5.0), "tbsp": ("volume", 15.0), "cup": ("volume", 250.0),
            "piece": ("count", 1.0), "dozen": ("count", 12.0)
        }

        cursor.execute("""
            SELECT im.canonical_name, iuc.from_unit, iuc.to_unit, iuc.conversion_factor
            FROM ingredient_unit_conversions iuc
            JOIN ingredient_master im ON im.id = iuc.ingredient_id
        """)
        ingredient_rules = cursor.fetchall() or []

        cursor.execute("""
            SELECT product_name, package_unit, base_unit, base_quantity
            FROM product_unit_conversions
        """)
        package_rules = cursor.fetchall() or []

        def convert(qty, from_unit, to_unit, ingredient_name, product_name):
            source_u, target_u = norm_unit(from_unit), norm_unit(to_unit)
            if not source_u or not target_u:
                return None
            if source_u == target_u:
                return qty

            graph = {}
            def edge(a, b, factor):
                if a and b and a != b and factor and factor > 0:
                    graph.setdefault(a, []).append((b, factor))

            dimensions = {}
            for unit_name, (dimension, factor) in standard.items():
                dimensions.setdefault(dimension, []).append((unit_name, factor))
            for units in dimensions.values():
                for a, af in units:
                    for b, bf in units:
                        if a != b:
                            edge(a, b, af / bf)

            wanted_key = alias_map.get(ingredient_key(ingredient_name), ingredient_key(ingredient_name))
            for rule in ingredient_rules:
                rule_key = alias_map.get(ingredient_key(rule["canonical_name"]), ingredient_key(rule["canonical_name"]))
                if rule_key == wanted_key:
                    a, b = norm_unit(rule["from_unit"]), norm_unit(rule["to_unit"])
                    factor = float(rule["conversion_factor"])
                    edge(a, b, factor)
                    edge(b, a, 1.0 / factor)

            product_key = ingredient_key(product_name)
            for rule in package_rules:
                if ingredient_key(rule["product_name"]) == product_key:
                    a, b = norm_unit(rule["package_unit"]), norm_unit(rule["base_unit"])
                    factor = float(rule["base_quantity"])
                    edge(a, b, factor)
                    edge(b, a, 1.0 / factor)

            # Same approximate kitchen defaults as the existing cooking route.
            for a, b, factor in (("tsp", "g", 5.0), ("tbsp", "g", 15.0),
                                 ("cup", "g", 250.0), ("piece", "g", 130.0)):
                edge(a, b, factor)
                edge(b, a, 1.0 / factor)

            queue = deque([(source_u, 1.0)])
            visited = {source_u}
            while queue:
                current, multiplier = queue.popleft()
                for nxt, factor in graph.get(current, []):
                    if nxt in visited:
                        continue
                    new_multiplier = multiplier * factor
                    if nxt == target_u:
                        return qty * new_multiplier
                    visited.add(nxt)
                    queue.append((nxt, new_multiplier))
            return None

        base_servings = max(1, int(recipe.get("servings") or 1))
        planned_servings = int(planned["servings"])
        results = []
        total_missing = 0
        all_available = True

        for ingredient in ingredients:
            name = str(ingredient.get("ingredient_name") or "").strip()
            try:
                base_qty = float(ingredient.get("required_quantity") or 0)
            except (TypeError, ValueError):
                base_qty = 0
            if not name or base_qty <= 0:
                results.append({
                    "ingredient_name": name, "required_quantity": base_qty,
                    "unit": ingredient.get("unit"), "status": "invalid_recipe_quantity"
                })
                all_available = False
                continue

            needed = base_qty * planned_servings / base_servings
            requested_key = ingredient_key(name)
            requested_canonical = alias_map.get(
                requested_key, ingredient_key(canonical_ingredient_name(name))
            )
            matches = []
            for product in products:
                product_key = ingredient_key(product["product_name"])
                product_canonical = alias_map.get(
                    product_key, ingredient_key(canonical_ingredient_name(product["product_name"]))
                )
                if requested_key == product_key or (
                    requested_canonical and requested_canonical == product_canonical
                ):
                    matches.append(product)

            if not matches:
                results.append({
                    "ingredient_name": name, "required_quantity": round(needed, 4),
                    "unit": ingredient["unit"], "available_quantity": 0,
                    "available_unit": None, "missing_quantity": round(needed, 4),
                    "status": "product_not_found", "product_id": None,
                    "product_name": None
                })
                total_missing += 1
                all_available = False
                continue

            if len(matches) > 1:
                results.append({
                    "ingredient_name": name, "required_quantity": round(needed, 4),
                    "unit": ingredient["unit"], "status": "multiple_matches",
                    "candidates": [{
                        "product_id": p["id"], "product_name": p["product_name"],
                        "quantity": float(p["quantity"] or 0), "unit": p["unit"]
                    } for p in matches]
                })
                total_missing += 1
                all_available = False
                continue

            product = matches[0]
            have = float(product["quantity"] or 0)
            needed_in_stock_unit = convert(
                needed, ingredient["unit"], product["unit"], name, product["product_name"]
            )

            if needed_in_stock_unit is None:
                results.append({
                    "ingredient_name": name, "required_quantity": round(needed, 4),
                    "unit": ingredient["unit"], "product_id": product["id"],
                    "product_name": product["product_name"], "available_quantity": have,
                    "available_unit": product["unit"], "missing_quantity": None,
                    "status": "unit_mismatch"
                })
                total_missing += 1
                all_available = False
                continue

            missing = max(0.0, needed_in_stock_unit - have)
            status = "available" if missing <= 1e-9 else "insufficient_stock"
            if status != "available":
                total_missing += 1
                all_available = False

            results.append({
                "ingredient_name": name,
                "required_quantity": round(needed, 4),
                "unit": ingredient["unit"],
                "product_id": product["id"],
                "product_name": product["product_name"],
                "required_in_inventory_unit": round(needed_in_stock_unit, 4),
                "available_quantity": round(have, 4),
                "available_unit": product["unit"],
                "missing_quantity": round(missing, 4),
                "missing_unit": product["unit"],
                "status": status
            })

        return jsonify({
            "plan_item_id": item_id,
            "recipe_source": source,
            "recipe_id": recipe_id,
            "recipe_name": recipe["recipe_name"],
            "plan_date": planned["plan_date"].isoformat() if hasattr(planned["plan_date"], "isoformat") else str(planned["plan_date"]),
            "servings": planned_servings,
            "all_available": all_available,
            "ingredients": results,
            "missing_ingredient_count": total_missing,
            "stock_was_changed": False
        }), 200

    except Exception as error:
        print("Meal planner inventory availability error:", error)
        return jsonify({"error": "Unable to check recipe inventory availability"}), 500
    finally:
        cursor.close()
        conn.close()



# =========================================================
# ADD A PLANNED RECIPE'S MISSING INVENTORY TO SHOPPING LIST
# Adds to an existing Pending quantity instead of replacing it.
# Product ownership and planned-item ownership are both checked.
# =========================================================

@meal_planner_bp.route("/items/<int:item_id>/shopping-list", methods=["POST"])
def add_missing_ingredient_to_shopping_list(item_id):
    user_id = _user_id()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    try:
        product_id = int(data.get("product_id"))
        missing_quantity = float(data.get("missing_quantity"))
        if product_id < 1 or not missing_quantity > 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "A valid product_id and positive missing_quantity are required"}), 400

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        conn.start_transaction()

        cursor.execute("""
            SELECT mpi.id
            FROM meal_plan_items mpi
            JOIN meal_plans mp ON mp.id = mpi.plan_id
            WHERE mpi.id = %s AND mp.user_id = %s
            FOR UPDATE
        """, (item_id, user_id))
        if not cursor.fetchone():
            conn.rollback()
            return jsonify({"error": "Planned recipe not found"}), 404

        cursor.execute("""
            SELECT id, product_name, unit
            FROM products
            WHERE id = %s AND user_id = %s
            FOR UPDATE
        """, (product_id, user_id))
        product = cursor.fetchone()
        if not product:
            conn.rollback()
            return jsonify({"error": "Product not found in your inventory"}), 404

        cursor.execute("""
            SELECT id, required_quantity
            FROM shopping_list
            WHERE product_id = %s AND user_id = %s AND status = 'Pending'
            ORDER BY id ASC
            FOR UPDATE
        """, (product_id, user_id))
        pending = cursor.fetchall() or []

        if pending:
            keep_id = pending[0]["id"]
            combined = float(pending[0]["required_quantity"] or 0) + missing_quantity
            cursor.execute("""
                UPDATE shopping_list
                SET required_quantity = %s
                WHERE id = %s AND user_id = %s
            """, (combined, keep_id, user_id))
            duplicate_ids = [row["id"] for row in pending[1:]]
            if duplicate_ids:
                placeholders = ",".join(["%s"] * len(duplicate_ids))
                cursor.execute(
                    f"DELETE FROM shopping_list WHERE id IN ({placeholders}) AND user_id = %s",
                    tuple(duplicate_ids) + (user_id,)
                )
            action = "updated"
        else:
            cursor.execute("""
                INSERT INTO shopping_list (product_id, required_quantity, status, user_id)
                VALUES (%s, %s, 'Pending', %s)
            """, (product_id, missing_quantity, user_id))
            action = "added"

        conn.commit()
        return jsonify({
            "message": f"{product['product_name']} {action} to shopping list",
            "product_id": product_id,
            "product_name": product["product_name"],
            "required_quantity_added": missing_quantity,
            "unit": product["unit"],
            "action": action
        }), 200

    except Exception as error:
        conn.rollback()
        print("Add planned missing ingredient to shopping list error:", error)
        return jsonify({"error": "Unable to add missing ingredient to shopping list"}), 500
    finally:
        cursor.close()
        conn.close()
