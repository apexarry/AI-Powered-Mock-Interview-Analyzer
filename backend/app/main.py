from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from .database import Base, engine
from .routers import auth, interviews


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Mock Interview Platform API", lifespan=lifespan)

api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(interviews.router)


@api.get("/health")
def health():
    return {"status": "ok"}


app.include_router(api)
