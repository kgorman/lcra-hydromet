"""
LCRA Hydromet dashboard server.

Thin pass-through proxy to hydromet.lcra.org so the browser can call
LCRA's JSON without CORS. No caching — every request hits LCRA fresh.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

LCRA = "https://hydromet.lcra.org"
TIMEOUT = httpx.Timeout(20.0, connect=5.0)

# Endpoint catalog. Key = short name used by the browser, value = LCRA path.
ENDPOINTS: dict[str, str] = {
    "dams": "/api/FloodStatus/GetLakeLevelsGateOps",
    "narrative": "/api/FloodStatus/GetNarrativeSummary",
    "forecast_sites": "/api/GetForecastReferences",
    "lake_levels": "/api/GetLakeLevelsForAllSites/",
    "stage_flow": "/api/GetStageFlowForAllSites/",
    "rainfall": "/api/GetRainfallForAllSites/",
}

app = FastAPI(title="LCRA Hydromet Dashboard")

NO_STORE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
}


async def _fetch(client: httpx.AsyncClient, path: str):
    r = await client.get(LCRA + path, headers={"Accept": "application/json"})
    r.raise_for_status()
    return r.json()


@app.get("/api/all")
async def proxy_all():
    """One round-trip for the whole dashboard."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        results = await asyncio.gather(
            *(_fetch(client, path) for path in ENDPOINTS.values()),
            return_exceptions=True,
        )
    bundle = {}
    for name, result in zip(ENDPOINTS, results):
        bundle[name] = None if isinstance(result, Exception) else result
        if isinstance(result, Exception):
            bundle.setdefault("_errors", {})[name] = str(result)
    return JSONResponse(bundle, headers=NO_STORE)


@app.get("/api/{name}")
async def proxy(name: str):
    path = ENDPOINTS.get(name)
    if not path:
        raise HTTPException(404, f"unknown endpoint: {name}")
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            data = await _fetch(client, path)
        except httpx.HTTPError as e:
            raise HTTPException(502, f"LCRA upstream error: {e}") from e
    return JSONResponse(data, headers=NO_STORE)


# Static dashboard (mounted last so /api routes win).
app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True))


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.environ.get("PORT", 8765))
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port)
