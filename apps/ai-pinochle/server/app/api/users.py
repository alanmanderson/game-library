from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.persistence.achievements import ACHIEVEMENTS, get_user_achievements

router = APIRouter()


class AchievementResponse(BaseModel):
    achievement_key: str
    name: str
    description: str
    rarity: str
    game_id: str | None
    unlocked_at: str


class AchievementCatalogEntry(BaseModel):
    key: str
    name: str
    description: str
    rarity: str


class AchievementsListResponse(BaseModel):
    total: int
    achievements: list[AchievementResponse]
    catalog: list[AchievementCatalogEntry]


@router.get("/me/achievements", response_model=AchievementsListResponse)
async def get_my_achievements(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AchievementsListResponse:
    unlocked = await get_user_achievements(db, user.id)
    catalog = [
        AchievementCatalogEntry(
            key=k,
            name=v["name"],
            description=v["description"],
            rarity=v["rarity"],
        )
        for k, v in ACHIEVEMENTS.items()
    ]
    return AchievementsListResponse(
        total=len(unlocked),
        achievements=[AchievementResponse(**a) for a in unlocked],
        catalog=catalog,
    )
