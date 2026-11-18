"""
Shared unit conversion helpers for Home Needs.

Canonical base units:
- mass: mg
- volume: ml
- count-like units: their own unit family (piece, packet, bottle, box, etc.)

Kitchen convention:
- 1 cup = 250 ml
- 1 tablespoon = 15 ml
- 1 teaspoon = 5 ml

Mass and volume are never converted into each other because that requires
ingredient-specific density information.
"""

import math
import re


def normalize_unit(unit):
    """Return a normalized unit token while preserving unknown unit names."""
    value = re.sub(r"[^a-z0-9]", "", str(unit or "").strip().lower())
    aliases = {
        # Mass
        "milligram": "mg", "milligrams": "mg",
        "gram": "g", "grams": "g",
        "kilogram": "kg", "kilograms": "kg",
        # Volume
        "milliliter": "ml", "milliliters": "ml",
        "millilitre": "ml", "millilitres": "ml",
        "liter": "l", "liters": "l",
        "litre": "l", "litres": "l",
        "tablespoons": "tablespoon", "tbsp": "tablespoon", "tbs": "tablespoon",
        "teaspoons": "teaspoon", "tsp": "teaspoon",
        "cups": "cup",
        # Count / packaging aliases
        "pc": "piece", "pcs": "piece", "pieces": "piece",
        "unit": "piece", "units": "piece", "each": "piece",
        "no": "piece", "nos": "piece",
        "packs": "packet", "packets": "packet", "pack": "packet",
        "bottles": "bottle",
        "boxes": "box",
        "dozen": "dozen", "dozens": "dozen",
    }
    return aliases.get(value, value)


# Each factor expresses how many canonical base units are in one unit.
_UNIT_DEFINITIONS = {
    "mg": ("mass", 1.0),
    "g": ("mass", 1000.0),
    "kg": ("mass", 1_000_000.0),

    "ml": ("volume", 1.0),
    "l": ("volume", 1000.0),
    "teaspoon": ("volume", 5.0),
    "tablespoon": ("volume", 15.0),
    "cup": ("volume", 250.0),

    "piece": ("count:piece", 1.0),
    "packet": ("count:packet", 1.0),
    "bottle": ("count:bottle", 1.0),
    "box": ("count:box", 1.0),
    "dozen": ("count:piece", 12.0),
}


def unit_definition(unit):
    """Return (dimension, factor_to_base), or None for unsupported units."""
    normalized = normalize_unit(unit)
    return _UNIT_DEFINITIONS.get(normalized)


def are_units_compatible(from_unit, to_unit):
    """Whether a generic, ingredient-independent conversion is safe."""
    source = unit_definition(from_unit)
    target = unit_definition(to_unit)
    return bool(source and target and source[0] == target[0])


def convert_quantity(quantity, from_unit, to_unit):
    """
    Convert a quantity between compatible units.
    Raises ValueError for unknown or incompatible units.
    """
    try:
        amount = float(quantity)
    except (TypeError, ValueError):
        raise ValueError("Quantity must be a valid number")

    if not math.isfinite(amount):
        raise ValueError("Quantity must be a finite number")

    source = unit_definition(from_unit)
    target = unit_definition(to_unit)

    if not source or not target:
        raise ValueError(
            f"Unsupported unit conversion: {from_unit} to {to_unit}"
        )
    if source[0] != target[0]:
        raise ValueError(
            f"Incompatible units: {from_unit} cannot be converted to {to_unit}"
        )

    converted = amount * source[1] / target[1]
    return round(converted, 6)


def format_kitchen_unit(unit):
    """Friendly display label for recipe UI text."""
    normalized = normalize_unit(unit)
    labels = {
        "cup": "cup (250 ml)",
        "tablespoon": "tablespoon (15 ml)",
        "teaspoon": "teaspoon (5 ml)",
    }
    return labels.get(normalized, str(unit or "").strip())


def quantity_in_stock_unit(required_quantity, recipe_unit, stock_unit):
    """Convert a recipe requirement into the inventory product's stock unit."""
    return convert_quantity(required_quantity, recipe_unit, stock_unit)
