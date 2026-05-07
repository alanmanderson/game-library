"""Tests for cube-decision analysis helpers and record persistence.

Covers:
- :func:`classify_cube_action` threshold boundaries for offer/accept/decline.
- :func:`get_advanced_stats` rollup of CubeActionRecord rows into
  ``accuracy`` + ``by_verdict``.
- ``GameManager.offer_double`` persists a CubeActionRecord row (with a
  stubbed ML evaluator so the test doesn't require torch).
"""

from unittest.mock import patch

import pytest

from app.models import CubeActionRecord, Player, Table
from app.services.cube_analysis import classify_cube_action
from app.services.game_service import GameManager
from app.services.stats_service import get_advanced_stats
from app.game_engine import BackgammonEngine, Color
from tests.conftest import auth_headers, create_test_player


class TestClassifyCubeAction:
    def test_offer_best(self):
        verdict, correct = classify_cube_action("offer", 0.55)
        assert verdict == "best"
        assert correct is True

    def test_offer_boundary_best(self):
        # Exactly at the best threshold.
        verdict, correct = classify_cube_action("offer", 0.40)
        assert verdict == "best"
        assert correct is True

    def test_offer_borderline(self):
        verdict, correct = classify_cube_action("offer", 0.35)
        assert verdict == "borderline"
        assert correct is False

    def test_offer_mistake(self):
        verdict, correct = classify_cube_action("offer", 0.25)
        assert verdict == "mistake"
        assert correct is False

    def test_offer_blunder(self):
        verdict, correct = classify_cube_action("offer", 0.05)
        assert verdict == "blunder"
        assert correct is False

    def test_accept_best_above_take_point(self):
        verdict, correct = classify_cube_action("accept", -0.2)
        assert verdict == "best"
        assert correct is True

    def test_accept_boundary_take_point(self):
        verdict, correct = classify_cube_action("accept", -0.50)
        assert verdict == "best"
        assert correct is True

    def test_accept_borderline(self):
        verdict, correct = classify_cube_action("accept", -0.55)
        assert verdict == "borderline"
        assert correct is False

    def test_accept_blunder(self):
        verdict, correct = classify_cube_action("accept", -0.85)
        assert verdict == "blunder"
        assert correct is False

    def test_decline_best_below_take_point(self):
        # Taker's equity is very bad so dropping is correct.
        verdict, correct = classify_cube_action("decline", -0.75)
        assert verdict == "best"
        assert correct is True

    def test_decline_blunder_when_should_have_taken(self):
        # Taker's equity is fine; dropping is a blunder.
        verdict, correct = classify_cube_action("decline", -0.1)
        assert verdict == "blunder"
        assert correct is False

    def test_unknown_action_raises(self):
        with pytest.raises(ValueError):
            classify_cube_action("wiggle", 0.5)


class TestCubeAccuracyRollup:
    @pytest.mark.asyncio
    async def test_aggregates_accuracy_and_verdicts(self, client, db_session):
        """get_advanced_stats sums CubeActionRecord rows into accuracy + by_verdict."""
        player = await create_test_player(client, "CubeAggRollup")
        pid = player["player"]["id"]

        # 2 best, 1 borderline, 1 mistake, 1 blunder => accuracy = 2/5 = 40%
        rows = [
            CubeActionRecord(
                player_id=pid, action="offer", cube_value_before=1,
                equity_before=0.50, correct=True, verdict="best",
            ),
            CubeActionRecord(
                player_id=pid, action="accept", cube_value_before=2,
                equity_before=-0.40, correct=True, verdict="best",
            ),
            CubeActionRecord(
                player_id=pid, action="offer", cube_value_before=1,
                equity_before=0.35, correct=False, verdict="borderline",
            ),
            CubeActionRecord(
                player_id=pid, action="offer", cube_value_before=1,
                equity_before=0.25, correct=False, verdict="mistake",
            ),
            CubeActionRecord(
                player_id=pid, action="decline", cube_value_before=2,
                equity_before=-0.10, correct=False, verdict="blunder",
            ),
        ]
        for r in rows:
            db_session.add(r)
        await db_session.commit()

        payload = await get_advanced_stats(db_session, pid)
        cube = payload["cube_stats"]
        assert cube["by_verdict"] == {
            "best": 2,
            "borderline": 1,
            "mistake": 1,
            "blunder": 1,
        }
        assert cube["accuracy"] == pytest.approx(40.0)

    @pytest.mark.asyncio
    async def test_accuracy_is_none_when_no_scored_rows(self, client, db_session):
        """Rows with NULL correct (e.g. ML unavailable) are excluded from accuracy."""
        player = await create_test_player(client, "CubeAggUnscored")
        pid = player["player"]["id"]
        db_session.add(
            CubeActionRecord(
                player_id=pid, action="offer", cube_value_before=1,
                equity_before=None, correct=None, verdict=None,
            )
        )
        await db_session.commit()

        payload = await get_advanced_stats(db_session, pid)
        assert payload["cube_stats"]["accuracy"] is None
        assert payload["cube_stats"]["by_verdict"] == {
            "best": 0, "borderline": 0, "mistake": 0, "blunder": 0,
        }


class TestCubeActionRecordPersistence:
    @pytest.mark.asyncio
    async def test_offer_double_writes_record_with_stubbed_ml(
        self, client, db_session
    ):
        """Stubbing the ML equity evaluator lets us assert the full
        verdict pipeline end-to-end without loading torch."""
        from sqlalchemy import select

        # Two registered players at a two-seat table.
        p1 = await create_test_player(client, "Offerer")
        p2 = await create_test_player(client, "Taker")
        p1_id = p1["player"]["id"]
        p2_id = p2["player"]["id"]

        # Build a minimal Table row and GameManager engine.
        table = Table(
            id="TBLCUBE1",
            status="playing",
            white_player_id=p1_id,
            black_player_id=p2_id,
        )
        db_session.add(table)
        await db_session.commit()

        gm = GameManager()
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)  # ROLLING status
        gm._engines["TBLCUBE1"] = engine
        gm._player_colors["TBLCUBE1"] = {
            p1_id: Color.WHITE,
            p2_id: Color.BLACK,
        }

        # Stub the ML equity evaluator to return a known "best" equity.
        with patch(
            "app.services.cube_analysis.evaluate_cube_equity",
            return_value=0.55,
        ):
            ok = await gm.offer_double(db_session, "TBLCUBE1", p1_id)
            assert ok is True
        await db_session.commit()

        rows = (
            await db_session.execute(
                select(CubeActionRecord).where(
                    CubeActionRecord.player_id == p1_id
                )
            )
        ).scalars().all()
        assert len(rows) == 1
        row = rows[0]
        assert row.action == "offer"
        assert row.cube_value_before == 1
        assert row.equity_before == pytest.approx(0.55)
        assert row.verdict == "best"
        assert row.correct is True

    @pytest.mark.asyncio
    async def test_offer_double_writes_null_row_when_ml_unavailable(
        self, client, db_session
    ):
        """When the ML model isn't loaded, the row still persists with
        NULL equity so raw counts stay consistent."""
        from sqlalchemy import select

        p1 = await create_test_player(client, "OffererNoML")
        p2 = await create_test_player(client, "TakerNoML")
        p1_id = p1["player"]["id"]
        p2_id = p2["player"]["id"]

        table = Table(
            id="TBLCUBE2",
            status="playing",
            white_player_id=p1_id,
            black_player_id=p2_id,
        )
        db_session.add(table)
        await db_session.commit()

        gm = GameManager()
        engine = BackgammonEngine()
        engine.start_game(first_player=Color.WHITE)
        gm._engines["TBLCUBE2"] = engine
        gm._player_colors["TBLCUBE2"] = {
            p1_id: Color.WHITE,
            p2_id: Color.BLACK,
        }

        with patch(
            "app.services.cube_analysis.evaluate_cube_equity",
            return_value=None,
        ):
            ok = await gm.offer_double(db_session, "TBLCUBE2", p1_id)
            assert ok is True
        await db_session.commit()

        rows = (
            await db_session.execute(
                select(CubeActionRecord).where(
                    CubeActionRecord.player_id == p1_id
                )
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].equity_before is None
        assert rows[0].verdict is None
        assert rows[0].correct is None
