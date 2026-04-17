"""REST API routes for the analysis mode."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import get_current_player
from app.models import Player, AnalysisSession
from app.schemas import (
    AnalysisSessionCreate,
    AnalysisGameStateResponse,
    AnalysisMoveRequest,
    AnalysisNavigateRequest,
    AnalysisJumpRequest,
    AnalysisAnnotateRequest,
    AnalysisLoadGameRequest,
    AnalysisSettingsUpdate,
    AnalysisHintResponse,
    AnalysisEvalResponse,
    AnalysisMoveResponse,
    AnalysisSessionListResponse,
    AnalysisSessionResponse,
    AnalysisRespondDoubleRequest,
)
from app.services.analysis_session_service import analysis_session_manager

analysis_router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _session_response(session) -> dict:
    return {
        "id": session.id,
        "player_id": session.player_id,
        "game_type": session.config.get("game_type", "money"),
        "match_length": session.config.get("match_length"),
        "player_color": session.player_color.value,
        "gnubg_ply": session.gnubg_ply,
        "auto_analysis": session.auto_analysis,
        "status": session.status,
        "result": None,
        "loaded_from": None,
        "created_at": getattr(session, 'created_at', None) or "2024-01-01T00:00:00Z",
        "completed_at": None,
    }


def _game_state_response(session) -> dict:
    state = analysis_session_manager._get_viewed_state(session)
    return {
        "session": _session_response(session),
        "game_state": state,
        "move_count": len(session.move_history),
        "current_view_index": session.current_view_index,
    }


def _get_session_or_404(session_id: str, player_id: str):
    session = analysis_session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Analysis session not found")
    if str(session.player_id) != str(player_id):
        raise HTTPException(status_code=403, detail="Not your session")
    return session


@analysis_router.post("/sessions")
async def create_session(
    body: AnalysisSessionCreate,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
):
    session = await analysis_session_manager.create_session(
        player_id=player.id, config=body.model_dump(), db=db,
    )
    return _game_state_response(session)


@analysis_router.get("/sessions")
async def list_sessions(
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AnalysisSession)
        .where(AnalysisSession.player_id == player.id)
        .order_by(AnalysisSession.created_at.desc())
        .limit(20)
    )
    sessions = result.scalars().all()
    return {"sessions": [
        {
            "id": s.id,
            "player_id": s.player_id,
            "game_type": s.game_type,
            "match_length": s.match_length,
            "player_color": s.player_color,
            "gnubg_ply": s.gnubg_ply,
            "auto_analysis": s.auto_analysis,
            "status": s.status,
            "result": s.result,
            "loaded_from": s.loaded_from,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        }
        for s in sessions
    ]}


@analysis_router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    player: Player = Depends(get_current_player),
):
    session = _get_session_or_404(session_id, str(player.id))
    return _game_state_response(session)


@analysis_router.post("/sessions/{session_id}/close")
async def close_session(
    session_id: str,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
):
    _get_session_or_404(session_id, str(player.id))
    await analysis_session_manager.close_session(session_id, db)
    return {"status": "closed"}


@analysis_router.post("/sessions/{session_id}/roll")
async def roll_dice(
    session_id: str,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    async with analysis_session_manager._get_lock(session_id):
        await analysis_session_manager.roll_dice(session_id)
    session = analysis_session_manager.get_session(session_id)
    return _game_state_response(session)


@analysis_router.post("/sessions/{session_id}/move")
async def make_move(
    session_id: str,
    body: AnalysisMoveRequest,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    async with analysis_session_manager._get_lock(session_id):
        try:
            await analysis_session_manager.make_move(session_id, body.from_point, body.to_point)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    session = analysis_session_manager.get_session(session_id)
    return _game_state_response(session)


@analysis_router.post("/sessions/{session_id}/end-turn")
async def end_turn(
    session_id: str,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
):
    _get_session_or_404(session_id, str(player.id))
    async with analysis_session_manager._get_lock(session_id):
        await analysis_session_manager.end_turn(session_id, db)
    session = analysis_session_manager.get_session(session_id)
    return _game_state_response(session)


@analysis_router.post("/sessions/{session_id}/undo")
async def undo_move(
    session_id: str,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    async with analysis_session_manager._get_lock(session_id):
        await analysis_session_manager.undo_move(session_id)
    session = analysis_session_manager.get_session(session_id)
    return _game_state_response(session)


@analysis_router.post("/sessions/{session_id}/double")
async def offer_double(
    session_id: str,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    async with analysis_session_manager._get_lock(session_id):
        await analysis_session_manager.offer_double(session_id)
    session = analysis_session_manager.get_session(session_id)
    return _game_state_response(session)


@analysis_router.post("/sessions/{session_id}/respond-double")
async def respond_double(
    session_id: str,
    body: AnalysisRespondDoubleRequest,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    async with analysis_session_manager._get_lock(session_id):
        await analysis_session_manager.respond_to_double(session_id, body.accept)
    session = analysis_session_manager.get_session(session_id)
    return _game_state_response(session)


@analysis_router.post("/sessions/{session_id}/hint")
async def get_hint(
    session_id: str,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    result = await analysis_session_manager.get_hint(session_id)
    if result is None:
        raise HTTPException(status_code=503, detail="Hints unavailable — gnubg service not connected")
    return result


@analysis_router.post("/sessions/{session_id}/eval")
async def evaluate_position(
    session_id: str,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    result = await analysis_session_manager.evaluate_position(session_id)
    if result is None:
        raise HTTPException(status_code=503, detail="Evaluation unavailable — gnubg service not connected")
    return result


@analysis_router.post("/sessions/{session_id}/navigate")
async def navigate(
    session_id: str,
    body: AnalysisNavigateRequest,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    analysis_session_manager.navigate(session_id, body.direction)
    session = analysis_session_manager.get_session(session_id)
    return _game_state_response(session)


@analysis_router.post("/sessions/{session_id}/jump")
async def jump_to_move(
    session_id: str,
    body: AnalysisJumpRequest,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    analysis_session_manager.jump_to_move(session_id, body.move_number)
    session = analysis_session_manager.get_session(session_id)
    return _game_state_response(session)


@analysis_router.get("/sessions/{session_id}/history")
async def get_history(
    session_id: str,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    return analysis_session_manager.get_move_history(session_id)


@analysis_router.post("/sessions/{session_id}/annotate")
async def annotate_move(
    session_id: str,
    body: AnalysisAnnotateRequest,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    try:
        analysis_session_manager.annotate_move(session_id, body.move_number, body.note)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "ok"}


@analysis_router.post("/sessions/{session_id}/load-game")
async def load_game(
    session_id: str,
    body: AnalysisLoadGameRequest,
    player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
):
    _get_session_or_404(session_id, str(player.id))
    async with analysis_session_manager._get_lock(session_id):
        try:
            await analysis_session_manager.load_from_game(
                session_id, body.table_id, db, body.move_number
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
    session = analysis_session_manager.get_session(session_id)
    return _game_state_response(session)


@analysis_router.post("/sessions/{session_id}/settings")
async def update_settings(
    session_id: str,
    body: AnalysisSettingsUpdate,
    player: Player = Depends(get_current_player),
):
    _get_session_or_404(session_id, str(player.id))
    analysis_session_manager.update_settings(
        session_id, gnubg_ply=body.gnubg_ply, auto_analysis=body.auto_analysis,
    )
    session = analysis_session_manager.get_session(session_id)
    return _game_state_response(session)
