
from flask import Blueprint, jsonify, request, session
from database import get_connection
from ingredient_matching import ingredient_key
from collections import deque
import math
import re

cooking_prediction_bp = Blueprint("cooking_prediction", __name__)



def normalize_unit(unit):
    """Normalize unit names, aliases and labels such as Cup (250 ml)."""

    raw_value = str(unit or "").strip().lower()

    # Remove bracketed display information.
    raw_value = re.sub(r"\([^)]*\)", "", raw_value)

    value = re.sub(r"[^a-z0-9]", "", raw_value)

    aliases = {
        "milligram": "mg",
        "milligrams": "mg",
        "gram": "g",
        "grams": "g",
        "kilogram": "kg",
        "kilograms": "kg",

        "milliliter": "ml",
        "milliliters": "ml",
        "millilitre": "ml",
        "millilitres": "ml",

        "liter": "l",
        "liters": "l",
        "litre": "l",
        "litres": "l",

        "teaspoon": "tsp",
        "teaspoons": "tsp",
        "tsp": "tsp",

        "tablespoon": "tbsp",
        "tablespoons": "tbsp",

        "cups": "cup",

        "pc": "piece",
        "pcs": "piece",
        "pieces": "piece",
        "each": "piece",
        "unit": "piece",
        "units": "piece",
        "no": "piece",
        "nos": "piece",

        "dozens": "dozen",

        "pack": "packet",
        "packs": "packet",
        "packets": "packet",

        "bottles": "bottle",
        "boxes": "box",
    }

    return aliases.get(value, value)


def convert_quantity(
    cursor,
    quantity,
    from_unit,
    to_unit,
    ingredient_name,
    product_name
):
    """
    Convert recipe demand into inventory units using standard,
    ingredient-specific, package and kitchen conversion rules.
    """

    source = normalize_unit(from_unit)
    target = normalize_unit(to_unit)

    try:
        quantity = float(quantity)
    except (TypeError, ValueError):
        return None

    if not source or not target:
        return None

    if not math.isfinite(quantity) or quantity < 0:
        return None

    if source == target:
        return quantity

    standard_units = {
        "mg": ("mass", 0.001),
        "g": ("mass", 1.0),
        "kg": ("mass", 1000.0),
        "ml": ("volume", 1.0),
        "l": ("volume", 1000.0),
        "tsp": ("volume", 5.0),
        "tbsp": ("volume", 15.0),
        "cup": ("volume", 250.0),
        "piece": ("count", 1.0),
        "dozen": ("count", 12.0),
    }

    graph = {}

    def add_edge(left, right, factor):
        if not left or not right or left == right:
            return

        try:
            factor = float(factor)
        except (TypeError, ValueError):
            return

        if factor > 0 and math.isfinite(factor):
            graph.setdefault(left, []).append((right, factor))

    # Standard conversions within compatible dimensions.
    by_dimension = {}

    for unit_name, (dimension, factor) in standard_units.items():
        by_dimension.setdefault(dimension, []).append(
            (unit_name, factor)
        )

    for dimension_units in by_dimension.values():
        for from_name, from_factor in dimension_units:
            for to_name, to_factor in dimension_units:
                if from_name != to_name:
                    add_edge(
                        from_name,
                        to_name,
                        from_factor / to_factor
                    )

    # Ingredient-specific conversion rules.
    ingredient_id = None

    search_keys = {
        ingredient_key(ingredient_name),
        ingredient_key(product_name),
    }

    search_keys.discard("")

    if search_keys:
        cursor.execute("""
            SELECT
                im.id,
                im.canonical_name,
                ia.alias_name
            FROM ingredient_master im
            LEFT JOIN ingredient_aliases ia
                ON ia.ingredient_id = im.id
        """)

        for row in cursor.fetchall() or []:
            if (
                ingredient_key(row.get("canonical_name")) in search_keys
                or ingredient_key(row.get("alias_name")) in search_keys
            ):
                ingredient_id = int(row["id"])
                break

    if ingredient_id:
        cursor.execute("""
            SELECT
                from_unit,
                to_unit,
                conversion_factor
            FROM ingredient_unit_conversions
            WHERE ingredient_id = %s
        """, (ingredient_id,))

        for rule in cursor.fetchall() or []:
            rule_from = normalize_unit(rule.get("from_unit"))
            rule_to = normalize_unit(rule.get("to_unit"))

            try:
                factor = float(rule.get("conversion_factor"))
            except (TypeError, ValueError):
                continue

            add_edge(rule_from, rule_to, factor)

            if factor > 0:
                add_edge(rule_to, rule_from, 1.0 / factor)

    # Approximate kitchen measuring defaults.
    kitchen_mass_estimates = {
        "tsp": ("g", 5.0),
        "tbsp": ("g", 15.0),
        "cup": ("g", 250.0),
        "piece": ("g", 130.0),
    }

    for measure_unit, (mass_unit, grams_per_measure) in kitchen_mass_estimates.items():
        add_edge(measure_unit, mass_unit, grams_per_measure)
        add_edge(
            mass_unit,
            measure_unit,
            1.0 / grams_per_measure
        )

    # Product-specific package mappings.
    if product_name:
        cursor.execute("""
            SELECT
                package_unit,
                base_unit,
                base_quantity
            FROM product_unit_conversions
            WHERE LOWER(TRIM(product_name)) = LOWER(TRIM(%s))
        """, (product_name,))

        for rule in cursor.fetchall() or []:
            package_unit = normalize_unit(rule.get("package_unit"))
            base_unit = normalize_unit(rule.get("base_unit"))

            try:
                base_quantity = float(rule.get("base_quantity"))
            except (TypeError, ValueError):
                continue

            if base_quantity > 0:
                add_edge(
                    package_unit,
                    base_unit,
                    base_quantity
                )
                add_edge(
                    base_unit,
                    package_unit,
                    1.0 / base_quantity
                )

    # Find a valid conversion path.
    queue = deque([(source, 1.0)])
    visited = {source}

    while queue:
        current, multiplier = queue.popleft()

        for next_unit, edge_factor in graph.get(current, []):
            if next_unit in visited:
                continue

            next_multiplier = multiplier * edge_factor

            if next_unit == target:
                converted = quantity * next_multiplier

                return (
                    converted
                    if math.isfinite(converted)
                    else None
                )

            visited.add(next_unit)
            queue.append((next_unit, next_multiplier))

    return None


@cooking_prediction_bp.route(
    "/cooking-consumption-predictions",
    methods=["GET"]
)
def get_cooking_consumption_predictions():

    """
    Read-only cooking-history forecast with inventory comparison.

    Does not modify inventory, purchases, consumption,
    shopping lists or existing AI predictions.
    """

    user_id = session.get("user_id")

    if not user_id:
        return jsonify({
            "success": False,
            "message": "Unauthorized"
        }), 401

    try:
        forecast_days = int(
            request.args.get("forecast_days", 30)
        )

        lookback_days = int(
            request.args.get("lookback_days", 90)
        )

        if not 1 <= forecast_days <= 180:
            raise ValueError

        if not 1 <= lookback_days <= 730:
            raise ValueError

    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "message": (
                "forecast_days must be 1-180 "
                "and lookback_days must be 1-730."
            )
        }), 400

    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                h.id AS cooking_event_id,
                h.recipe_name_snapshot,
                h.recipe_type,
                h.servings AS cooked_servings,
                h.cooked_at,

                COALESCE(NULLIF(m.servings, 0), 1)
                    AS recipe_base_servings,

                mi.id AS meal_ingredient_id,
                mi.product_id,
                mi.ingredient_name,
                mi.required_quantity,
                mi.unit AS recipe_unit,

                p.product_name,
                p.quantity AS current_stock,
                p.unit AS stock_unit

            FROM meal_cooking_history h

            INNER JOIN meal_ingredients mi
                ON mi.meal_id = h.meal_id

            LEFT JOIN meals m
                ON m.id = h.meal_id
                AND m.user_id = h.user_id

            LEFT JOIN products p
                ON p.id = mi.product_id
                AND p.user_id = h.user_id

            WHERE h.user_id = %s

              AND h.cooked_at >= DATE_SUB(
                  CURDATE(),
                  INTERVAL %s DAY
              )

              AND h.cooked_at < DATE_ADD(
                  CURDATE(),
                  INTERVAL 1 DAY
              )

            ORDER BY
                h.cooked_at DESC,
                h.id DESC,
                mi.id ASC

        """, (user_id, lookback_days))

        rows = cursor.fetchall() or []

        grouped = {}

        for row in rows:
            try:
                required = float(row.get("required_quantity") or 0)
                cooked_servings = float(row.get("cooked_servings") or 0)
                base_servings = float(row.get("recipe_base_servings") or 1)
            except (TypeError, ValueError):
                continue

            if (
                not all(math.isfinite(v) for v in (required, cooked_servings, base_servings))
                or required <= 0 or cooked_servings <= 0 or base_servings <= 0
            ):
                continue

            ingredient_name = (
                row.get("product_name") or row.get("ingredient_name") or "Unknown ingredient"
            )
            recipe_unit = str(row.get("recipe_unit") or "").strip()
            product_id = row.get("product_id")
            stock_unit = str(row.get("stock_unit") or "").strip()
            actual_quantity = required * cooked_servings / base_servings

            # For linked inventory, convert each recipe's usage into the
            # inventory unit first. This allows the same product to be
            # combined even when recipes use different compatible units.
            row_converted_quantity = None
            if product_id is not None and row.get("product_name") and stock_unit:
                row_converted_quantity = convert_quantity(
                    cursor, actual_quantity, recipe_unit, stock_unit,
                    ingredient_name, row.get("product_name")
                )

            if row_converted_quantity is not None:
                key = ("product", int(product_id), normalize_unit(stock_unit))
                demand_quantity = row_converted_quantity
                demand_unit = stock_unit
                uses_inventory_unit = True
            elif product_id is not None:
                # Keep incompatible units separate rather than adding unlike
                # quantities or inventing a conversion.
                key = ("product_unconverted", int(product_id), normalize_unit(recipe_unit))
                demand_quantity = actual_quantity
                demand_unit = recipe_unit
                uses_inventory_unit = False
            else:
                key = ("ingredient", ingredient_key(row.get("ingredient_name")), normalize_unit(recipe_unit))
                demand_quantity = actual_quantity
                demand_unit = recipe_unit
                uses_inventory_unit = False

            if key not in grouped:
                try:
                    stock = float(row["current_stock"]) if row.get("current_stock") is not None else None
                    if stock is not None and not math.isfinite(stock):
                        stock = None
                except (TypeError, ValueError):
                    stock = None

                grouped[key] = {
                    "product_id": int(product_id) if product_id is not None else None,
                    "ingredient_name": ingredient_name,
                    "product_name": row.get("product_name") or ingredient_name,
                    "recipe_unit": demand_unit,
                    "current_stock": stock,
                    "stock_unit": stock_unit,
                    "uses_inventory_unit": uses_inventory_unit,
                    "historical_quantity": 0.0,
                    "usage_events": set(),
                    "recipes": set(),
                    "recipe_breakdown": {},
                }

            item = grouped[key]
            item["historical_quantity"] += demand_quantity
            item["usage_events"].add(int(row["cooking_event_id"]))

            recipe_name = str(row.get("recipe_name_snapshot") or "Unnamed recipe")
            item["recipes"].add(recipe_name)
            breakdown_key = (recipe_name, demand_unit)
            if breakdown_key not in item["recipe_breakdown"]:
                item["recipe_breakdown"][breakdown_key] = 0.0
            item["recipe_breakdown"][breakdown_key] += demand_quantity

        predictions = []

        for item in grouped.values():
            historical_total = item["historical_quantity"]
            average_daily = historical_total / lookback_days
            forecast_quantity = average_daily * forecast_days

            if not math.isfinite(forecast_quantity) or forecast_quantity <= 0:
                continue

            event_count = len(item["usage_events"])
            confidence = (
                "Higher" if event_count >= 10
                else "Moderate" if event_count >= 3
                else "Limited"
            )

            converted_demand = None
            comparison_status = "no_linked_inventory"
            comparison_unit = item["stock_unit"] or None
            remaining_stock = None
            additional_quantity_required = None
            stock_status = "No linked inventory product"
            comparison_note = (
                "Link this recipe ingredient to one of your inventory products to compare stock."
            )

            if (
                item["product_id"] is not None
                and item["current_stock"] is not None
                and item["stock_unit"]
            ):
                if item["uses_inventory_unit"]:
                    converted_demand = forecast_quantity
                else:
                    converted_demand = convert_quantity(
                        cursor, forecast_quantity, item["recipe_unit"],
                        item["stock_unit"], item["ingredient_name"], item["product_name"]
                    )

                if converted_demand is None:
                    comparison_status = "unit_mismatch"
                    stock_status = "Cannot compare units"
                    comparison_note = (
                        f"Demand is in {item['recipe_unit'] or 'an unspecified unit'} "
                        f"but inventory is in {item['stock_unit']}. No shortage is calculated."
                    )
                else:
                    comparison_status = "comparable"
                    raw_remaining_stock = item["current_stock"] - converted_demand
                    remaining_stock = max(0.0, raw_remaining_stock)
                    additional_quantity_required = max(0.0, -raw_remaining_stock)
                    stock_status = (
                        "Shortage" if additional_quantity_required > 1e-9 else "Sufficient"
                    )
                    comparison_note = (
                        "Demand was converted to the inventory unit using the app's configured unit rules. "
                        "Kitchen default estimates are approximate."
                    )

            recipe_breakdown = []
            for (recipe_name, recipe_unit), quantity in sorted(item["recipe_breakdown"].items()):
                recipe_breakdown.append({
                    "recipe_name": recipe_name,
                    "historical_quantity": round(quantity, 3),
                    "predicted_quantity": round((quantity / lookback_days) * forecast_days, 3),
                    "unit": recipe_unit,
                })

            predictions.append({
                "product_id": item["product_id"],
                "ingredient_name": item["ingredient_name"],
                "recipe_unit": item["recipe_unit"],
                "current_stock": item["current_stock"],
                "stock_unit": item["stock_unit"],
                "historical_quantity": round(historical_total, 3),
                "average_daily_recipe_demand": round(average_daily, 4),
                "predicted_quantity": round(forecast_quantity, 3),
                "forecast_unit": item["recipe_unit"],
                "converted_predicted_demand": round(converted_demand, 3) if converted_demand is not None else None,
                "comparison_unit": comparison_unit,
                "expected_remaining_stock": round(remaining_stock, 3) if remaining_stock is not None else None,
                "additional_quantity_required": round(additional_quantity_required, 3) if additional_quantity_required is not None else None,
                "comparison_status": comparison_status,
                "stock_status": stock_status,
                "unit_comparison_note": comparison_note,
                "cooking_events": event_count,
                "recipes_used_in": sorted(item["recipes"]),
                "recipe_breakdown": recipe_breakdown,
                "confidence": confidence,
            })

        predictions.sort(
            key=lambda item: (
                item["comparison_status"] == "comparable"
                and item["additional_quantity_required"] > 0,

                item["predicted_quantity"]
            ),
            reverse=True
        )

        return jsonify({

            "success": True,

            "forecast_days": forecast_days,

            "lookback_days": lookback_days,

            "method": (
                "Cooking-frequency and serving-scaled recipe demand"
            ),

            "total_ingredients": len(predictions),

            "shortage_count": sum(
                1 for p in predictions
                if (
                    p["comparison_status"] == "comparable"
                    and p["additional_quantity_required"] > 0
                )
            ),

            "comparable_count": sum(
                1 for p in predictions
                if p["comparison_status"] == "comparable"
            ),

            "predictions": predictions,

            "notes": [

                "Only the logged-in user's cooking history, "
                "recipes and inventory are used.",

                "Recipe quantities are scaled using the actual "
                "servings cooked.",

                "Stock comparison uses the unit-conversion rule "
                "families already used by the meal-cooking route.",

                "Kitchen measuring defaults are estimates; "
                "ingredient-specific conversion rules take priority.",

                "Where no valid conversion exists, stock and demand "
                "are shown separately without a shortage calculation.",

                "This endpoint is read-only and does not change "
                "inventory, purchases, consumption, shopping lists "
                "or existing AI predictions."

            ]

        }), 200

    except Exception as error:

        print(
            "Cooking consumption prediction error:",
            error
        )

        return jsonify({
            "success": False,
            "message": (
                "Unable to generate cooking-based "
                "consumption predictions."
            )
        }), 500

    finally:
        cursor.close()
        connection.close()
