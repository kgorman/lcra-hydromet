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
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope


class NoCacheStaticFiles(StaticFiles):
    """Force browsers to revalidate static assets so fixes ship immediately."""

    async def get_response(self, path: str, scope: Scope):
        resp = await super().get_response(path, scope)
        resp.headers["Cache-Control"] = "no-cache, must-revalidate"
        return resp

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

app = FastAPI(
    title="LCRA Hydromet Dashboard",
    version="1.0.0",
    summary="Real-time pass-through proxy for LCRA Hydromet data — Highland Lakes, river gauges, rainfall.",
    description=(
        "Public JSON proxy in front of LCRA's Hydromet system (hydromet.lcra.org). "
        "All endpoints return application/json with Cache-Control: no-store — every request "
        "hits the upstream LCRA API fresh. No authentication. Designed for direct consumption "
        "by browsers, agents, dashboards, and downstream pipelines.\n\n"
        "Upstream source: https://hydromet.lcra.org/  ·  "
        "Source code: https://github.com/kgorman/lcra-hydromet"
    ),
    contact={"name": "Kenny Gorman", "url": "https://kennygorman.dev"},
    license_info={"name": "Data © LCRA", "url": "https://www.lcra.org/"},
    openapi_tags=[
        {"name": "data", "description": "Live LCRA Hydromet data."},
        {"name": "pages", "description": "Server-rendered HTML pages."},
    ],
)

NO_STORE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
}


async def _fetch(client: httpx.AsyncClient, path: str):
    r = await client.get(LCRA + path, headers={"Accept": "application/json"})
    r.raise_for_status()
    return r.json()


@app.get(
    "/api/all",
    tags=["data"],
    summary="Bundle of all six LCRA endpoints in one round-trip.",
    description="Returns a JSON object keyed by short endpoint name (dams, narrative, "
                "forecast_sites, lake_levels, stage_flow, rainfall). Preferred for snapshot fetches.",
)
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


@app.get(
    "/api/{name}",
    tags=["data"],
    summary="Proxy one named LCRA endpoint.",
    description="Valid `name` values: dams, narrative, forecast_sites, lake_levels, stage_flow, rainfall.",
)
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


STATIC_DIR = Path(__file__).parent / "static"


@app.get("/about", tags=["pages"], include_in_schema=False)
async def about_page():
    return FileResponse(STATIC_DIR / "about.html", headers={"Cache-Control": "no-cache, must-revalidate"})


@app.get("/learn", tags=["pages"], include_in_schema=False)
async def learn_page():
    return FileResponse(STATIC_DIR / "learn.html", headers={"Cache-Control": "no-cache, must-revalidate"})


# Static dashboard (mounted last so /api routes win).
app.mount("/", NoCacheStaticFiles(directory=STATIC_DIR, html=True))


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.environ.get("PORT", 8765))
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port)
