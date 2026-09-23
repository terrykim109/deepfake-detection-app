#main.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from firebase_config import db
from routers import auth
from routers import users
from routers import analysis
from temp_images import start_temp_image_sweeper

app = FastAPI(title="Deepfake Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# Include auth router
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
