/**
 * Shared unit conversion helpers for Home Needs.
 *
 * Kitchen convention:
 * 1 cup = 250 ml
 * 1 tablespoon = 15 ml
 * 1 teaspoon = 5 ml
 *
 * Mass and volume are intentionally kept separate. Converting grams to ml
 * requires ingredient-specific density data.
 */

export function normalizeUnit(unit) {
  const value = String(unit ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");

  const aliases = {
    milligram: "mg", milligrams: "mg",
    gram: "g", grams: "g",
    kilogram: "kg", kilograms: "kg",
    milliliter: "ml", milliliters: "ml",
    millilitre: "ml", millilitres: "ml",
    liter: "l", liters: "l", litre: "l", litres: "l",
    tablespoons: "tablespoon", tbsp: "tablespoon", tbs: "tablespoon",
    teaspoons: "teaspoon", tsp: "teaspoon",
    cups: "cup",
    pc: "piece", pcs: "piece", pieces: "piece",
    unit: "piece", units: "piece", each: "piece", no: "piece", nos: "piece",
    packs: "packet", packets: "packet", pack: "packet",
    bottles: "bottle",
    boxes: "box",
    dozens: "dozen",
  };

  return aliases[value] || value;
}

const UNIT_DEFINITIONS = {
  mg: ["mass", 1],
  g: ["mass", 1000],
  kg: ["mass", 1000000],

  ml: ["volume", 1],
  l: ["volume", 1000],
  teaspoon: ["volume", 5],
  tablespoon: ["volume", 15],
  cup: ["volume", 250],

  piece: ["count:piece", 1],
  packet: ["count:packet", 1],
  bottle: ["count:bottle", 1],
  box: ["count:box", 1],
  dozen: ["count:piece", 12],
};

export function areUnitsCompatible(fromUnit, toUnit) {
  const from = UNIT_DEFINITIONS[normalizeUnit(fromUnit)];
  const to = UNIT_DEFINITIONS[normalizeUnit(toUnit)];
  return Boolean(from && to && from[0] === to[0]);
}

export function convertQuantity(quantity, fromUnit, toUnit) {
  const amount = Number(quantity);
  if (!Number.isFinite(amount)) {
    throw new Error("Quantity must be a valid finite number");
  }

  const from = UNIT_DEFINITIONS[normalizeUnit(fromUnit)];
  const to = UNIT_DEFINITIONS[normalizeUnit(toUnit)];

  if (!from || !to) {
    throw new Error(`Unsupported unit conversion: ${fromUnit} to ${toUnit}`);
  }
  if (from[0] !== to[0]) {
    throw new Error(`Incompatible units: ${fromUnit} cannot be converted to ${toUnit}`);
  }

  return Number(((amount * from[1]) / to[1]).toFixed(6));
}

export function formatKitchenUnit(unit) {
  const normalized = normalizeUnit(unit);
  const labels = {
    cup: "cup (250 ml)",
    tablespoon: "tablespoon (15 ml)",
    teaspoon: "teaspoon (5 ml)",
  };
  return labels[normalized] || String(unit ?? "").trim();
}

export function quantityInStockUnit(requiredQuantity, recipeUnit, stockUnit) {
  return convertQuantity(requiredQuantity, recipeUnit, stockUnit);
}
