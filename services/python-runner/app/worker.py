from __future__ import annotations

import base64
import contextlib
import io
import json
import os
import socket
import sys
from typing import Any


def _block_network() -> None:
    def _raise(*_args: Any, **_kwargs: Any) -> None:
        raise PermissionError("Network access is disabled in this runtime.")

    socket.socket = _raise  # type: ignore[assignment]
    socket.create_connection = _raise  # type: ignore[assignment]


def _block_shell() -> None:
    os.system = lambda *_args, **_kwargs: (_ for _ in ()).throw(  # type: ignore[assignment]
        PermissionError("Shell access is disabled in this runtime.")
    )


def run() -> None:
    payload = json.loads(sys.stdin.read())
    source = payload["source"]
    result = {
        "ok": True,
        "stdout": "",
        "stderr": "",
        "artifacts": [],
    }

    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    namespace: dict[str, Any] = {}

    _block_network()
    _block_shell()

    with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(
        stderr_buffer
    ):
      try:
        import matplotlib

        matplotlib.use("Agg")
        exec(source, namespace, namespace)

        import matplotlib.pyplot as plt

        for figure_id in plt.get_fignums():
            figure = plt.figure(figure_id)
            bytes_buffer = io.BytesIO()
            figure.savefig(bytes_buffer, format="png", bbox_inches="tight")
            result["artifacts"].append(
                {
                    "kind": "image/png",
                    "base64": base64.b64encode(bytes_buffer.getvalue()).decode("utf-8"),
                }
            )
        plt.close("all")
      except Exception as exc:  # pragma: no cover
        result["ok"] = False
        print(f"{exc.__class__.__name__}: {exc}", file=sys.stderr)

    result["stdout"] = stdout_buffer.getvalue()[:1_000_000]
    result["stderr"] = stderr_buffer.getvalue()[:1_000_000]
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    run()
