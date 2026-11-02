#main.py

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from auth_dependency import get_current_user
from firebase_config import db
from routers import auth
from routers import users
from routers import analysis
from routers import forensics
from routers import public_images
from temp_images import start_temp_image_sweeper

app = FastAPI(title="Deepfake Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
    expose_headers=["*"],
    max_age=600,
)

# Include auth router
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(forensics.router, prefix="/api")
# Token-gated temp image bytes for Scrappa (no Firebase auth — short-lived only)
app.include_router(public_images.router, prefix="/api")

# Purge abandoned temp uploads so nothing outlives 60 seconds
start_temp_image_sweeper()


# Health check endpoint
@app.get("/api/health")
async def health():
    try:
        db.collection("users").limit(1).get()
        return {"status": "ok", "database": "connected", "type": "firebase-firestore"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error: {str(e)}")


@app.get("/api/me")
async def me(user: dict = Depends(get_current_user)):
    """Smoke-test: requires a valid Firebase ID token."""
    return {
        "uid": user["uid"],
        "claims": user["claims"],
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
