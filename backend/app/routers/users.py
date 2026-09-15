from fastapi import APIRouter, Depends

from app.models.user import User, user_doc_to_model
from app.security import get_current_user

router = APIRouter(tags=["users"])


@router.get("/users/me", response_model=User)
async def get_current_user_info(current_user: dict = Depends(get_current_user)) -> User:
    return user_doc_to_model(current_user)
