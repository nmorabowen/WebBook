from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="WebBook Python Runner")

TIMEOUT_SECONDS = float(os.getenv("PYTHON_TIMEOUT_SECONDS", "5"))


class ExecutePythonRequest(BaseModel):
    cellId: str
    source: str
    pageId: str
    requester: Literal["admin", "public"]
    requestKey: str


class Artifact(BaseModel):
    kind: Literal["image/png"]
    base64: str


class ExecutePythonResponse(BaseModel):
    ok: bool
    stdout: str
    stderr: str
    artifacts: list[Artifact]
    durationMs: int
    cached: bool


async def run_worker(payload: ExecutePythonRequest) -> ExecutePythonResponse:
    worker_path = Path(__file__).with_name("worker.py")

    with tempfile.TemporaryDirectory(prefix="webbook-run-") as temp_dir:
        start = time.perf_counter()
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-I",
            str(worker_path),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=temp_dir,
            env={
                "PYTHONUNBUFFERED": "1",
                "MPLCONFIGDIR": temp_dir,
            },
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(json.dumps(payload.model_dump()).encode("utf-8")),
                timeout=TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError as exc:
            process.kill()
            raise HTTPException(
                status_code=408,
                detail="Execution timed out after 5 seconds.",
            ) from exc

        duration_ms = int((time.perf_counter() - start) * 1000)

        if stderr and not stdout:
            return ExecutePythonResponse(
                ok=False,
                stdout="",
                stderr=stderr.decode("utf-8")[:1_000_000],
                artifacts=[],
                durationMs=duration_ms,
                cached=False,
            )

        if not stdout:
            raise HTTPException(status_code=500, detail="Runner returned no output.")

        payload_json = json.loads(stdout.decode("utf-8"))
        return ExecutePythonResponse(
            ok=payload_json["ok"],
            stdout=payload_json["stdout"],
            stderr=payload_json["stderr"],
            artifacts=[Artifact(**artifact) for artifact in payload_json["artifacts"]],
            durationMs=duration_ms,
            cached=False,
        )


@app.post("/execute", response_model=ExecutePythonResponse)
async def execute(payload: ExecutePythonRequest) -> ExecutePythonResponse:
    return await run_worker(payload)
