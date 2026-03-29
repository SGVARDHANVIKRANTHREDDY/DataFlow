"""ai.py — AI Router for Explanation capabilities (Reverse-Translation)."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from ..models import User
from ..auth import get_current_user
from ..schemas import TranslateRequest 
from pydantic import BaseModel
from ..services.ai_translator import explain_steps

router = APIRouter(prefix="/ai", tags=["ai"])

class ExplainRequest(BaseModel):
    steps: list[dict]

class ExplainResponse(BaseModel):
    explanation: str
    error: str | None = None

@router.post("/explain", response_model=ExplainResponse)
async def explain_pipeline(
    body: ExplainRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    request: Request = None
):
    """
    Reverse-translates a JSON array of deterministic dataset pipeline steps
    back into a human-readable explanation of what the pipeline accomplishes.
    """
    from ..services.security.audit import audit, AuditAction
    
    explanation, error = await explain_steps(body.steps)
    
    await audit(
        db, 
        AuditAction.PIPELINE_TRANSLATE, 
        user_id=user.id,
        detail={"steps_count": len(body.steps), "type": "explain"}, 
        request=request
    )
    
    return {"explanation": explanation, "error": error}
