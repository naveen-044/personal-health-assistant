from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.auth.dependencies import get_current_user
from backend.database.store import store
from backend.models.profile import ProfileUpdate

router = APIRouter()


@router.get('/api/profile')
@router.get('/profile')
def get_profile(user: dict = Depends(get_current_user)) -> dict:
    user_id = user['user_id']
    profile = store.get_or_create_profile(user_id)
    return profile


@router.put('/api/profile')
@router.put('/profile')
@router.post('/api/profile')
@router.post('/profile')
def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user)) -> dict:
    user_id = user['user_id']
    updated = store.update_profile(user_id, payload.model_dump(exclude_none=True))
    return updated
