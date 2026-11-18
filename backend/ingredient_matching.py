import re

def ingredient_key(value):
    """Normalize a name for exact, punctuation-insensitive comparison."""
    return re.sub(r"[^a-z0-9]", "", str(value or "").casefold())

def canonical_ingredient_name(value, alias_map=None):
    """Resolve only admin-approved aliases; never use substring matching."""
    key = ingredient_key(value)
    if not key:
        return ""
    return (alias_map or {}).get(key, key)

def resolve_unique_product(ingredient_name, products, alias_map=None, name_key="product_name"):
    """Exact match first, then approved alias; ambiguity is deliberately unresolved."""
    requested = ingredient_key(ingredient_name)
    if not requested:
        return None
    exact = [p for p in products if ingredient_key(p.get(name_key)) == requested]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        return None
    target = canonical_ingredient_name(ingredient_name, alias_map)
    matches = [p for p in products if canonical_ingredient_name(p.get(name_key), alias_map) == target]
    return matches[0] if len(matches) == 1 else None
