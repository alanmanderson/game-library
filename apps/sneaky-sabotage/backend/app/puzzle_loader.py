"""Load and serve puzzles from the JSON file."""

import json
import os
import random
from dataclasses import dataclass

_PUZZLE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "puzzles", "puzzles.json")


@dataclass
class Puzzle:
    id: int
    puzzle_type: str
    title: str
    instructions: str
    content: dict
    answer: str
    hint: str
    difficulty: int

    def to_player_dict(self) -> dict:
        """Return puzzle data visible to all players (no answer or hint)."""
        return {
            "id": self.id,
            "type": self.puzzle_type,
            "title": self.title,
            "instructions": self.instructions,
            "content": self.content,
            "difficulty": self.difficulty,
        }


_puzzles: list[Puzzle] = []


def load_puzzles() -> list[Puzzle]:
    global _puzzles
    if _puzzles:
        return _puzzles
    with open(_PUZZLE_PATH) as f:
        data = json.load(f)
    _puzzles = [
        Puzzle(
            id=p["id"],
            puzzle_type=p["type"],
            title=p["title"],
            instructions=p["instructions"],
            content=p["content"],
            answer=p["answer"].upper().strip(),
            hint=p["hint"],
            difficulty=p.get("difficulty", 2),
        )
        for p in data["puzzles"]
    ]
    return _puzzles


def get_puzzle(puzzle_id: int) -> Puzzle | None:
    puzzles = load_puzzles()
    for p in puzzles:
        if p.id == puzzle_id:
            return p
    return None


def pick_puzzle(exclude_ids: list[int] | None = None) -> Puzzle:
    """Pick a random puzzle, avoiding previously used ones."""
    puzzles = load_puzzles()
    exclude = set(exclude_ids or [])
    available = [p for p in puzzles if p.id not in exclude]
    if not available:
        available = puzzles
    return random.choice(available)
