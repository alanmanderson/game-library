"""Canonical board-theme and checker-style IDs for cosmetic preferences.

The frontend defines the actual look of each theme/style; the backend only
needs to recognise the set of valid IDs so it can reject junk input on
``PATCH /api/players/me/preferences``.

Adding a new theme requires adding its ID here AND wiring up the matching
CSS rules in ``frontend/src/constants/themes.ts`` + ``Board.css``.
"""

# Board themes — each is a preset of board-scoped CSS variables
# (background, point colours, bar colour) applied via a data attribute.
BOARD_THEMES: frozenset[str] = frozenset(
    {
        "classic",       # Classic wood (default)
        "dark-marble",   # Dark marble / slate
        "green-felt",    # Casino-style green felt
    }
)

# Checker styles — each selects a checker rendering preset
# (base colour, rim gradient, surface finish).
CHECKER_STYLES: frozenset[str] = frozenset(
    {
        "classic",   # Warm cream vs matte black (default)
        "marble",    # Polished marble with veining-style highlights
        "metal",     # Brushed metal with cool highlights
    }
)
