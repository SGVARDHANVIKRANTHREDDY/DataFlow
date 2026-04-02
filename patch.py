import re
with open('backend/app/routers/pipelines.py', 'r', encoding='utf-8') as f:
    text = f.read()

new_text = re.sub(
    r'async def execute\(.*?(?=^\s*@|\Z)',
'''async def execute(
    pid: int,
    body: ExecuteRequest,
    request: Request,
    idem_key: str = Depends(require_idempotency_key),
    db: AsyncSession = Depends(write_db),
    user: User = Depends(get_current_user),
):
    try:
        from ..services.reliability import UnifiedJobOrchestrator
        from ..services.security.idempotency import hash_request_body
        
        body_bytes = await request.body()
        result = await UnifiedJobOrchestrator.dispatch_pipeline_execution(
            db, user.id, pid, body.dataset_id, idem_key, hash_request_body(body_bytes)
        )
        return result
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        from fastapi import HTTPException
        import logging
        logging.getLogger(__name__).exception("Transactional Execution failed")
        raise HTTPException(status_code=500, detail="Transactional Execution failed")

''', text, flags=re.DOTALL | re.MULTILINE)

with open('backend/app/routers/pipelines.py', 'w', encoding='utf-8') as f:
    f.write(new_text)
