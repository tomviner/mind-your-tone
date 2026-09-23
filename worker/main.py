import json
from urllib.parse import urlsplit

from scoring import score_request
from workers import Response, WorkerEntrypoint


def json_response(payload, status=200):
    return Response(
        json.dumps(payload, separators=(",", ":")),
        status=status,
        headers={
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
        },
    )


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        if urlsplit(request.url).path != "/api/score":
            return await self.env.ASSETS.fetch(request)

        if request.method != "POST":
            return json_response({"error": "Method not allowed"}, 405)

        try:
            body = await request.json()
        except Exception:
            return json_response({"error": "Invalid JSON"}, 400)

        async def run_ai(model, value):
            return await self.env.AI.run(model, value)

        payload, status = await score_request(
            body,
            request.url,
            request.headers.get("origin"),
            run_ai,
        )
        return json_response(payload, status)
