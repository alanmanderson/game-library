"""Tests for the gnubg .mat (Jellyfish text match) export format.

Verifies that GET /api/tables/{table_id}/export produces output that gnubg
can parse via `import mat`.  Each test class maps to a section of the format
spec:

  §2  Match-length header
  §4  Game block structure
  §4.1 Score lines (colons, running scores)
  §4.2 Column splitting (double-space separator after col 15)
  §5.2 Cube action tokens (Doubles / Takes / Drops)
  §5.3 Win line syntax and column placement
  §6  Checker-play notation (bar=25, off=0, black mirroring)
"""

import re
import pytest

from app.models import MoveRecord, Table
from tests.conftest import create_and_join_table


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def add_records(db, table_id, rows):
    """Insert synthetic MoveRecord rows and commit."""
    for row in rows:
        db.add(MoveRecord(
            table_id=table_id,
            player_id=row["player_id"],
            move_number=row["move_number"],
            dice_roll=row.get("dice_roll", ""),
            moves_notation=row["moves_notation"],
        ))
    await db.commit()


def get_game_score_line(lines, game_label):
    """Return the score line immediately after the given 'Game N' header."""
    idx = next(i for i, l in enumerate(lines) if game_label in l)
    return lines[idx + 1]


def get_win_lines(lines):
    """Return every line that contains a 'Wins' token."""
    return [l for l in lines if re.search(r"\bWins\b", l)]


# ---------------------------------------------------------------------------
# §2  Match-length header
# ---------------------------------------------------------------------------


class TestMatchHeader:
    """The first non-blank line must be '<integer> point match'."""

    @pytest.mark.asyncio
    async def test_header_present_and_parseable(self, client):
        """Header matches '<int> point match' (case-insensitive per spec)."""
        table, _, _ = await create_and_join_table(client)
        resp = await client.get(f"/api/tables/{table['id']}/export")
        first_line = resp.text.split("\n")[0]
        assert re.search(r"\d+\s+[Pp]oint\s+[Mm]atch", first_line), \
            f"Header line does not match pattern: {first_line!r}"

    @pytest.mark.asyncio
    async def test_header_reflects_match_points(self, client, db_session):
        """The integer in the header equals the table's match_points."""
        table, _, _ = await create_and_join_table(client)
        db_table = await db_session.get(Table, table["id"])
        db_table.match_points = 7
        await db_session.commit()

        resp = await client.get(f"/api/tables/{table['id']}/export")
        assert "7 point match" in resp.text.split("\n")[0]

    @pytest.mark.asyncio
    async def test_money_game_zero_points(self, client, db_session):
        """match_points=0 emits '0 point match' (unlimited session)."""
        table, _, _ = await create_and_join_table(client)
        db_table = await db_session.get(Table, table["id"])
        db_table.match_points = 0
        await db_session.commit()

        resp = await client.get(f"/api/tables/{table['id']}/export")
        assert "0 point match" in resp.text.split("\n")[0]

    @pytest.mark.asyncio
    async def test_header_followed_by_blank_line(self, client):
        """A blank line separates the header from the first Game block."""
        table, _, _ = await create_and_join_table(client)
        resp = await client.get(f"/api/tables/{table['id']}/export")
        lines = resp.text.split("\n")
        assert lines[1].strip() == "", \
            f"Expected blank line after header, got: {lines[1]!r}"


# ---------------------------------------------------------------------------
# §4  Game block structure
# ---------------------------------------------------------------------------


class TestGameBlocks:
    """Each game needs its own 'Game N' header with a positive integer."""

    @pytest.mark.asyncio
    async def test_game1_header_present(self, client):
        """An empty (just-joined) table still emits a ' Game 1' header."""
        table, _, _ = await create_and_join_table(client)
        resp = await client.get(f"/api/tables/{table['id']}/export")
        assert " Game 1" in resp.text

    @pytest.mark.asyncio
    async def test_game_header_leading_space_and_positive_number(self, client):
        """' Game 1' has a leading space and a positive integer (§4)."""
        table, _, _ = await create_and_join_table(client)
        resp = await client.get(f"/api/tables/{table['id']}/export")
        game_lines = [l for l in resp.text.split("\n") if re.search(r"\bGame\b", l)]
        assert game_lines, "No Game header found"
        assert game_lines[0].startswith(" Game "), \
            f"Game header lacks leading space: {game_lines[0]!r}"
        num = game_lines[0].strip().split()[1]
        assert num.isdigit() and int(num) > 0

    @pytest.mark.asyncio
    async def test_two_completed_games_produce_two_blocks(self, client, db_session):
        """A match with two win records produces Game 1 and Game 2 blocks."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Black wins 1 pt"},
            {"player_id": wid, "move_number": 3, "dice_roll": "6-5", "moves_notation": "24/18 13/8"},
            {"player_id": wid, "move_number": 4, "dice_roll": "", "moves_notation": "White wins 2 pts (gammon)"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "Game 1" in resp.text
        assert "Game 2" in resp.text
        assert "Game 3" not in resp.text

    @pytest.mark.asyncio
    async def test_three_completed_games_produce_three_blocks(self, client, db_session):
        """Three win records produce Game 1, 2, 3 blocks."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        records = [
            (wid, 1, "3-1", "8/5 6/5"),
            (bid, 2, "",    "Black wins 1 pt"),
            (wid, 3, "6-5", "24/18 13/8"),
            (wid, 4, "",    "White wins 1 pt"),
            (wid, 5, "3-2", "13/10 24/22"),
            (bid, 6, "",    "Black wins 1 pt"),
        ]
        await add_records(db_session, tid,
            [{"player_id": p, "move_number": m, "dice_roll": d, "moves_notation": n}
             for p, m, d, n in records])

        resp = await client.get(f"/api/tables/{tid}/export")
        for n in (1, 2, 3):
            assert f"Game {n}" in resp.text

    @pytest.mark.asyncio
    async def test_in_progress_game_becomes_last_block(self, client, db_session):
        """Records after the last win record form one more (incomplete) game block."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Black wins 1 pt"},
            # Game 2 in progress — no win record yet
            {"player_id": wid, "move_number": 3, "dice_roll": "6-5", "moves_notation": "24/18 13/8"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "Game 2" in resp.text


# ---------------------------------------------------------------------------
# §4.1  Score lines
# ---------------------------------------------------------------------------


class TestScoreLines:
    """Score line must have two colons and show scores at the START of the game."""

    @pytest.mark.asyncio
    async def test_score_line_has_two_colons(self, client):
        """Score line contains exactly two colons: 'Name : N   Name : N'."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        resp = await client.get(f"/api/tables/{table['id']}/export")
        score_line = get_game_score_line(resp.text.split("\n"), "Game 1")
        assert score_line.count(":") == 2, \
            f"Score line must have 2 colons: {score_line!r}"

    @pytest.mark.asyncio
    async def test_score_line_contains_both_names(self, client):
        """Both player nicknames appear in the score line."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        resp = await client.get(f"/api/tables/{table['id']}/export")
        score_line = get_game_score_line(resp.text.split("\n"), "Game 1")
        assert "Alice" in score_line and "Bob" in score_line

    @pytest.mark.asyncio
    async def test_game1_scores_are_zero(self, client):
        """Game 1 score line always shows 0 for both players."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        resp = await client.get(f"/api/tables/{table['id']}/export")
        score_line = get_game_score_line(resp.text.split("\n"), "Game 1")
        assert score_line.count(": 0") == 2, \
            f"Game 1 score line should show 0:0, got: {score_line!r}"

    @pytest.mark.asyncio
    async def test_game2_score_reflects_game1_winner(self, client, db_session):
        """Game 2 score line shows points won in Game 1."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        # White wins 2 pts (gammon) in game 1; game 2 has one move
        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": wid, "move_number": 2, "dice_roll": "", "moves_notation": "White wins 2 pts (gammon)"},
            {"player_id": wid, "move_number": 3, "dice_roll": "6-5", "moves_notation": "24/18 13/8"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        lines = resp.text.split("\n")
        score_line = get_game_score_line(lines, "Game 2")
        assert ": 2" in score_line, \
            f"Game 2 score should show 2 for white winner, got: {score_line!r}"

    @pytest.mark.asyncio
    async def test_running_scores_three_games(self, client, db_session):
        """Scores accumulate across three games correctly."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        # G1: Black wins 1 pt  → 0-1
        # G2: White wins 2 pts → 2-1
        # G3: starts at 2-1
        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Black wins 1 pt"},
            {"player_id": wid, "move_number": 3, "dice_roll": "6-5", "moves_notation": "24/18 13/8"},
            {"player_id": wid, "move_number": 4, "dice_roll": "", "moves_notation": "White wins 2 pts (gammon)"},
            {"player_id": wid, "move_number": 5, "dice_roll": "3-2", "moves_notation": "13/10 24/22"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        lines = resp.text.split("\n")

        # Game 3 score line should show 2 (white) and 1 (black)
        score_line = get_game_score_line(lines, "Game 3")
        assert ": 2" in score_line, f"White should have 2 pts in game 3: {score_line!r}"
        assert ": 1" in score_line, f"Black should have 1 pt in game 3: {score_line!r}"

    @pytest.mark.asyncio
    async def test_all_game_score_lines_have_colons(self, client, db_session):
        """Every Game block's score line has two colons (gnubg aborts without them)."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Black wins 1 pt"},
            {"player_id": wid, "move_number": 3, "dice_roll": "6-5", "moves_notation": "24/18 13/8"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        lines = resp.text.split("\n")

        for game_label in ("Game 1", "Game 2"):
            score_line = get_game_score_line(lines, game_label)
            assert score_line.count(":") >= 2, \
                f"{game_label} score line missing colons: {score_line!r}"


# ---------------------------------------------------------------------------
# §5.3  Win line syntax
# ---------------------------------------------------------------------------


class TestWinLineSyntax:
    """Win line must start with 'Wins', not 'Black wins' / 'White wins'."""

    @pytest.mark.asyncio
    async def test_no_colour_prefix_in_win_line(self, client, db_session):
        """'Black wins 1 pt' storage record must NOT appear literally in the export."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Black wins 1 pt"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        for line in resp.text.split("\n"):
            stripped = line.strip()
            assert not re.search(r"^Black wins", stripped, re.IGNORECASE), \
                f"Colour-prefix win token found: {line!r}"
            assert not re.search(r"^White wins", stripped, re.IGNORECASE), \
                f"Colour-prefix win token found: {line!r}"

    @pytest.mark.asyncio
    async def test_win_token_starts_with_wins(self, client, db_session):
        """The win line, stripped of whitespace, starts with 'Wins'."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": wid, "move_number": 2, "dice_roll": "", "moves_notation": "White wins 1 pt"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        win_lines = get_win_lines(resp.text.split("\n"))
        assert len(win_lines) == 1, f"Expected 1 win line, got: {win_lines}"
        assert win_lines[0].strip().startswith("Wins"), \
            f"Win line does not start with 'Wins': {win_lines[0]!r}"

    @pytest.mark.asyncio
    async def test_win_line_singular_one_point(self, client, db_session):
        """A 1-point win uses 'point' (singular)."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": wid, "move_number": 2, "dice_roll": "", "moves_notation": "White wins 1 pt"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "Wins 1 point" in resp.text
        assert "Wins 1 points" not in resp.text

    @pytest.mark.asyncio
    async def test_win_line_plural_gammon(self, client, db_session):
        """A 2-point (gammon) win uses 'points' (plural)."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": wid, "move_number": 2, "dice_roll": "", "moves_notation": "White wins 2 pts (gammon)"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "Wins 2 points" in resp.text

    @pytest.mark.asyncio
    async def test_win_line_backgammon_three_points(self, client, db_session):
        """A 3-point (backgammon) win produces 'Wins 3 points'."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": wid, "move_number": 2, "dice_roll": "", "moves_notation": "White wins 3 pts (backgammon)"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "Wins 3 points" in resp.text

    @pytest.mark.asyncio
    async def test_resignation_produces_clean_wins_line(self, client, db_session):
        """'White wins 1 pt (resignation)' produces 'Wins 1 point', no resignation text."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": wid, "move_number": 2, "dice_roll": "", "moves_notation": "White wins 1 pt (resignation)"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "Wins 1 point" in resp.text
        assert "resignation" not in resp.text.lower()

    @pytest.mark.asyncio
    async def test_win_line_not_in_numbered_move_row(self, client, db_session):
        """The win token must NOT appear inside a numbered move row (e.g. '  2) Wins …')."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": wid, "move_number": 2, "dice_roll": "", "moves_notation": "White wins 1 pt"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        for line in resp.text.split("\n"):
            if "Wins" in line:
                assert not re.match(r"\s*\d+\)", line), \
                    f"Win line has a numbered move prefix: {line!r}"

    @pytest.mark.asyncio
    async def test_multiple_games_no_colour_prefix_anywhere(self, client, db_session):
        """In a multi-game match, no 'Black/White wins …' text appears anywhere."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Black wins 1 pt"},
            {"player_id": wid, "move_number": 3, "dice_roll": "6-5", "moves_notation": "24/18 13/8"},
            {"player_id": wid, "move_number": 4, "dice_roll": "", "moves_notation": "White wins 2 pts (gammon)"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        for line in resp.text.split("\n"):
            assert not re.search(r"\b(Black|White) wins\b", line, re.IGNORECASE), \
                f"Colour-prefix win token found: {line!r}"


# ---------------------------------------------------------------------------
# §5.3  Win line column placement
# ---------------------------------------------------------------------------


class TestWinLineColumn:
    """gnubg determines the winner by which column 'Wins N point' appears in."""

    @pytest.mark.asyncio
    async def test_left_player_win_left_indented(self, client, db_session):
        """First mover (left column) win → 'Wins' starts before column 20."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        # White moves first and wins
        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": wid, "move_number": 2, "dice_roll": "", "moves_notation": "White wins 1 pt"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        win_line = next(l for l in resp.text.split("\n") if "Wins" in l)
        col = len(win_line) - len(win_line.lstrip())
        assert col < 20, \
            f"Left-player win should be left-indented (<col 20), got col {col}: {win_line!r}"

    @pytest.mark.asyncio
    async def test_right_player_win_right_indented(self, client, db_session):
        """Second mover (right column) win → 'Wins' starts at column ≥ 20."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        # White moves first; Black wins
        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Black wins 1 pt"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        win_line = next(l for l in resp.text.split("\n") if "Wins" in l)
        col = len(win_line) - len(win_line.lstrip())
        assert col >= 20, \
            f"Right-player win should be right-indented (≥col 20), got col {col}: {win_line!r}"

    @pytest.mark.asyncio
    async def test_black_first_mover_wins_left_column(self, client, db_session):
        """When Black moves first and wins, the win line is left-indented."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        # Black moves first (move_number=1) and wins
        await add_records(db_session, tid, [
            {"player_id": bid, "move_number": 1, "dice_roll": "6-3", "moves_notation": "12/18 12/15"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Black wins 1 pt"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        win_line = next(l for l in resp.text.split("\n") if "Wins" in l)
        col = len(win_line) - len(win_line.lstrip())
        assert col < 20, \
            f"Black (first mover) win should be left-indented, got col {col}: {win_line!r}"

    @pytest.mark.asyncio
    async def test_black_first_mover_white_wins_right_column(self, client, db_session):
        """When Black moves first but White wins, the win line is right-indented."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        # Black moves first; White wins
        await add_records(db_session, tid, [
            {"player_id": bid, "move_number": 1, "dice_roll": "6-3", "moves_notation": "12/18 12/15"},
            {"player_id": wid, "move_number": 2, "dice_roll": "", "moves_notation": "White wins 1 pt"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        win_line = next(l for l in resp.text.split("\n") if "Wins" in l)
        col = len(win_line) - len(win_line.lstrip())
        assert col >= 20, \
            f"White (second mover) win should be right-indented, got col {col}: {win_line!r}"

    @pytest.mark.asyncio
    async def test_win_column_correct_in_game2(self, client, db_session):
        """Win column placement is correct in Game 2, not just Game 1."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        # Game 1: Black wins (right column)
        # Game 2: Black moves first, then White wins (right column of game 2)
        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Black wins 1 pt"},
            {"player_id": bid, "move_number": 3, "dice_roll": "6-3", "moves_notation": "12/18 12/15"},
            {"player_id": wid, "move_number": 4, "dice_roll": "", "moves_notation": "White wins 1 pt"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        win_lines = get_win_lines(resp.text.split("\n"))
        assert len(win_lines) == 2

        # Game 2 win (White, second mover when Black moved first) → right-indented
        g2_win = win_lines[1]
        col = len(g2_win) - len(g2_win.lstrip())
        assert col >= 20, \
            f"Game 2 win (white, second mover) should be right-indented, col={col}: {g2_win!r}"


# ---------------------------------------------------------------------------
# §4.2  Column splitting and move line format
# ---------------------------------------------------------------------------


class TestMoveLineFormat:
    """Move lines use right-justified turn numbers and double-space column separation."""

    @pytest.mark.asyncio
    async def test_move_number_right_justified(self, client, db_session):
        """Turn 1 emits '  1)' — right-justified in 3 chars."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "6-4", "moves_notation": "24/18 13/9"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        move_lines = [l for l in resp.text.split("\n") if re.match(r"\s+\d+\)", l)]
        assert move_lines, "No numbered move lines found"
        assert "  1)" in move_lines[0]

    @pytest.mark.asyncio
    async def test_dice_dash_stripped(self, client, db_session):
        """Stored dice '6-4' becomes '64:' in the output (no dash)."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "6-4", "moves_notation": "24/18 13/9"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "64:" in resp.text
        assert "6-4:" not in resp.text

    @pytest.mark.asyncio
    async def test_right_column_has_double_space_separator(self, client, db_session):
        """When both players have moves on a row, the right column is separated by ≥2 spaces."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "4-2", "moves_notation": "13/11 24/20"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        move_lines = [l for l in resp.text.split("\n") if re.match(r"\s+\d+\)", l)]
        # The line with both players' moves should have a double-space gap after col 15
        both = [l for l in move_lines if "31:" in l and "42:" in l]
        assert both, "Expected a line with both players' moves"
        assert "  " in both[0][15:], \
            f"No double-space gap after col 15 in move line: {both[0]!r}"

    @pytest.mark.asyncio
    async def test_no_move_notation_shows_dice_only(self, client, db_session):
        """A no-legal-moves turn stores '(no moves)' notation → output shows only 'dd:'."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "6-2", "moves_notation": "(no moves)"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "62:" in resp.text
        assert "(no moves)" not in resp.text


# ---------------------------------------------------------------------------
# §6  Checker-play notation
# ---------------------------------------------------------------------------


class TestCheckerPlayNotation:
    """bar=25, off=0; Black's point numbers are mirrored (25 - N)."""

    @pytest.mark.asyncio
    async def test_white_bar_becomes_25(self, client, db_session):
        """White's 'bar/22' → '25/22'."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "bar/22"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "25/22" in resp.text
        assert "bar/" not in resp.text

    @pytest.mark.asyncio
    async def test_white_off_becomes_0(self, client, db_session):
        """White's '3/off' → '3/0'."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "3/off"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "3/0" in resp.text
        assert "/off" not in resp.text

    @pytest.mark.asyncio
    async def test_black_bar_becomes_25_mirrored(self, client, db_session):
        """Black's 'bar/3' (internal point 3) → '25/22' (bar=25, 3 mirrors to 22)."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "6-2", "moves_notation": "bar/3"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "25/22" in resp.text

    @pytest.mark.asyncio
    async def test_black_off_becomes_0(self, client, db_session):
        """Black's '22/off' → '3/0' (22 mirrors to 3, off → 0)."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "2-1", "moves_notation": "22/off"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "3/0" in resp.text

    @pytest.mark.asyncio
    async def test_black_points_mirrored(self, client, db_session):
        """Black's internal point N is output as 25-N."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        # Black's "13/11 24/20": 13→12, 11→14, 24→1, 20→5
        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": bid, "move_number": 2, "dice_roll": "4-2", "moves_notation": "13/11 24/20"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "12/14" in resp.text
        assert "1/5" in resp.text

    @pytest.mark.asyncio
    async def test_white_notation_unchanged(self, client, db_session):
        """White's notation is passed through unchanged."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "6-4", "moves_notation": "24/18 13/9"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "64: 24/18 13/9" in resp.text

    @pytest.mark.asyncio
    async def test_hit_marker_preserved(self, client, db_session):
        """A hit marker '*' is preserved after the destination point."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5* 6/5"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "8/5*" in resp.text

    @pytest.mark.asyncio
    async def test_chain_notation_preserved(self, client, db_session):
        """Chain notation like '13/7/4' passes through to the output."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "6-3", "moves_notation": "13/7/4"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "13/7/4" in resp.text


# ---------------------------------------------------------------------------
# §5.2  Cube action tokens
# ---------------------------------------------------------------------------


class TestCubeActions:
    """Doubles/Takes/Drops tokens appear correctly in the output."""

    @pytest.mark.asyncio
    async def test_doubles_token_preserved(self, client, db_session):
        """'Doubles => 2' is passed through as-is (starts with 'Double', prefix-matched)."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        # White doubles before any moves; Black takes
        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "", "moves_notation": "Doubles => 2"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Takes"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "Doubles => 2" in resp.text
        assert "Takes" in resp.text

    @pytest.mark.asyncio
    async def test_doubles_and_takes_on_same_line(self, client, db_session):
        """When White doubles first (move 1) and Black takes (move 2), they appear on one row."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "", "moves_notation": "Doubles => 2"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Takes"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        doubles_line = next((l for l in resp.text.split("\n") if "Doubles" in l), None)
        assert doubles_line is not None
        assert "Takes" in doubles_line, \
            f"Takes should be on same line as Doubles: {doubles_line!r}"

    @pytest.mark.asyncio
    async def test_drops_token_preserved(self, client, db_session):
        """'Drops' is passed through as-is."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "", "moves_notation": "Doubles => 2"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Drops"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert "Doubles => 2" in resp.text
        assert "Drops" in resp.text

    @pytest.mark.asyncio
    async def test_doubles_and_drops_on_same_line(self, client, db_session):
        """Doubles and Drops appear on the same row when White doubles first."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "", "moves_notation": "Doubles => 2"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Drops"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        doubles_line = next((l for l in resp.text.split("\n") if "Doubles" in l), None)
        assert doubles_line is not None
        assert "Drops" in doubles_line, \
            f"Drops should be on same line as Doubles: {doubles_line!r}"

    @pytest.mark.asyncio
    async def test_cube_actions_not_treated_as_win_records(self, client, db_session):
        """Cube action records (dice_roll='') are NOT mistaken for game-ending win records."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        # Game with a cube exchange (no win record) — should all be in Game 1
        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "", "moves_notation": "Doubles => 2"},
            {"player_id": bid, "move_number": 2, "dice_roll": "", "moves_notation": "Takes"},
            {"player_id": wid, "move_number": 3, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        # No spurious Game 2 from the cube action records
        assert "Game 2" not in resp.text
        # No spurious Wins line
        assert "Wins" not in resp.text


# ---------------------------------------------------------------------------
# End-to-end: complete match structure
# ---------------------------------------------------------------------------


class TestFullMatchStructure:
    """Integration: complete file structure a gnubg import would accept."""

    @pytest.mark.asyncio
    async def test_complete_7pt_match_three_games(self, client, db_session):
        """7-point match with 3 completed games produces a fully-structured .mat file."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]

        db_table = await db_session.get(Table, tid)
        db_table.match_points = 7
        await db_session.commit()

        records = [
            # Game 1: White wins 1 pt
            (wid, 1, "3-1", "8/5 6/5"),
            (bid, 2, "4-2", "13/11 24/20"),
            (wid, 3, "",    "White wins 1 pt"),
            # Game 2: Black wins 2 pts (gammon)
            (wid, 4, "6-5", "24/18 13/8"),
            (bid, 5, "",    "Black wins 2 pts (gammon)"),
            # Game 3: White wins 3 pts (backgammon)
            (wid, 6, "5-5", "24/14 24/14"),
            (wid, 7, "",    "White wins 3 pts (backgammon)"),
        ]
        await add_records(db_session, tid,
            [{"player_id": p, "move_number": m, "dice_roll": d, "moves_notation": n}
             for p, m, d, n in records])

        resp = await client.get(f"/api/tables/{tid}/export")
        assert resp.status_code == 200
        content = resp.text
        lines = content.split("\n")

        # Header
        assert "7 point match" in lines[0]

        # Three game blocks
        for n in (1, 2, 3):
            assert f"Game {n}" in content, f"Missing Game {n} header"

        # Three win lines, all starting with 'Wins'
        win_lines = get_win_lines(lines)
        assert len(win_lines) == 3, f"Expected 3 win lines, got: {win_lines}"
        for wl in win_lines:
            assert wl.strip().startswith("Wins"), f"Win line uses colour prefix: {wl!r}"

        # No colour-prefix win tokens anywhere
        for line in lines:
            assert not re.search(r"\b(Black|White) wins\b", line, re.IGNORECASE), \
                f"Colour-prefix token found: {line!r}"

        # All score lines have two colons
        for game_label in ("Game 1", "Game 2", "Game 3"):
            sl = get_game_score_line(lines, game_label)
            assert sl.count(":") >= 2, f"{game_label} score line: {sl!r}"

        # Game 1 scores: 0-0
        g1_sl = get_game_score_line(lines, "Game 1")
        assert g1_sl.count(": 0") == 2, f"Game 1 should be 0-0: {g1_sl!r}"

        # Win points: 1 + 3 = 4 for White
        assert "Wins 1 point" in content
        assert "Wins 2 points" in content
        assert "Wins 3 points" in content

    @pytest.mark.asyncio
    async def test_correct_player_in_left_column_per_game(self, client, db_session):
        """The player who moved first in each game is in the left column."""
        table, _, _ = await create_and_join_table(client, "Alice", "Bob")
        tid = table["id"]
        wid = table["white_player"]["id"]
        bid = table["black_player"]["id"]
        white_name = table["white_player"]["nickname"]
        black_name = table["black_player"]["nickname"]

        # Game 1: White moves first
        # Game 2: Black moves first
        await add_records(db_session, tid, [
            {"player_id": wid, "move_number": 1, "dice_roll": "3-1", "moves_notation": "8/5 6/5"},
            {"player_id": wid, "move_number": 2, "dice_roll": "", "moves_notation": "White wins 1 pt"},
            {"player_id": bid, "move_number": 3, "dice_roll": "6-3", "moves_notation": "12/18 12/15"},
            {"player_id": bid, "move_number": 4, "dice_roll": "", "moves_notation": "Black wins 1 pt"},
        ])

        resp = await client.get(f"/api/tables/{tid}/export")
        lines = resp.text.split("\n")

        # Game 1: white_name first (left)
        g1_score = get_game_score_line(lines, "Game 1")
        assert g1_score.index(white_name) < g1_score.index(black_name), \
            f"White should be in left column in Game 1: {g1_score!r}"

        # Game 2: black_name first (left)
        g2_score = get_game_score_line(lines, "Game 2")
        assert g2_score.index(black_name) < g2_score.index(white_name), \
            f"Black should be in left column in Game 2: {g2_score!r}"
