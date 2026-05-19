"""FastAPI entry point for the gnubg analysis service.

Internal-only: no auth, no CORS, no TLS. The NSG rule and VNet are the
network boundary.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from .engine import GnubgEngine, GnubgUnavailableError
from .schemas import (
    AnalyzeMoveRequest,
    AnalyzeMoveResponse,
    BestMoveResponse,
    Board,
    CubeDecisionResponse,
    EvaluateResponse,
    HealthResponse,
    MoveDice,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


engine = GnubgEngine()


@asynccontextmanager
async def _lifespan(app: FastAPI):
    try:
        await engine.start()
    except GnubgUnavailableError as exc:
        logger.warning("gnubg failed to start at boot: %s (will retry on demand)", exc)
    yield
    await engine.stop()


app = FastAPI(
    title="gnubg analysis service",
    version="1.0.0",
    lifespan=_lifespan,
    docs_url="/docs",
    redoc_url=None,
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    version, ready = await engine.health()
    return HealthResponse(
        status="ok" if ready else "degraded",
        gnubg_version=version,
        ready=ready,
    )


def _unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail="gnubg engine not available")


@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(body: Board) -> EvaluateResponse:
    try:
        return await engine.evaluate(body)
    except GnubgUnavailableError:
        raise _unavailable()
    except Exception as exc:
        logger.exception("evaluate failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/best-move", response_model=BestMoveResponse)
async def best_move(body: MoveDice) -> BestMoveResponse:
    try:
        result = await engine.best_move(body)
        if result is None:
            raise HTTPException(
                status_code=422,
                detail="No legal moves available in this position",
            )
        return result
    except HTTPException:
        raise
    except GnubgUnavailableError:
        raise _unavailable()
    except Exception as exc:
        logger.exception("best-move failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/analyze-move", response_model=AnalyzeMoveResponse)
async def analyze_move(body: AnalyzeMoveRequest) -> AnalyzeMoveResponse:
    try:
        return await engine.analyze_move(body)
    except GnubgUnavailableError:
        raise _unavailable()
    except Exception as exc:
        logger.exception("analyze-move failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/cube-decision", response_model=CubeDecisionResponse)
async def cube_decision(body: Board) -> CubeDecisionResponse:
    try:
        result = await engine.cube_decision(body)
        if result is None:
            raise HTTPException(
                status_code=422,
                detail="Cube decision not available in this game state",
            )
        return result
    except HTTPException:
        raise
    except GnubgUnavailableError:
        raise _unavailable()
    except Exception as exc:
        logger.exception("cube-decision failed")
        raise HTTPException(status_code=500, detail=str(exc))
