import json
import logging
import math
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

DIMENSIONS = json.loads(Path(__file__).with_name("dimensions.json").read_text())

AiRunner = Callable[[str, dict[str, Any]], Awaitable[Any]]


def build_jev_input(phrase: str, keys: list[str]) -> dict[str, Any]:
    return {
        "state": phrase,
        "questions": {
            key: {
                "type": "score",
                "instructions": DIMENSIONS[key]["instructions"],
                "criteria": DIMENSIONS[key]["criteria"],
            }
            for key in keys
        },
    }


def inspection(jev_input: dict[str, Any], response: Any) -> dict[str, Any]:
    return {
        "request": {"model": "typesafe/jev", "input": jev_input},
        "response": response,
    }


def _is_number(value: Any) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(value)
    )


def _field(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    try:
        return getattr(value, key)
    except (AttributeError, TypeError):
        try:
            return value[key]
        except (KeyError, TypeError):
            return None


def scores_from_jev_response(value: Any, keys: list[str]) -> dict[str, Any]:
    response = _field(value, "result") or value
    answers = _field(response, "answers")
    if answers is None:
        raise ValueError("Jev returned an invalid response")

    scores = {}
    for key in keys:
        answer = _field(answers, key)
        score = _field(answer, "score")
        if not _is_number(score) or not 0 <= score <= 4:
            raise ValueError(f"Jev returned an invalid score for {key}")
        confidence = _field(answer, "confidence")
        scores[key] = {
            "score": score,
            "confidence": confidence if _is_number(confidence) else None,
        }

    model = _field(response, "model")
    return {
        "model": str(model) if model is not None else None,
        "scores": scores,
    }


def _origin(value: str) -> tuple[str, str, int]:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or parsed.hostname is None:
        raise ValueError("invalid origin")
    default_port = 443 if parsed.scheme == "https" else 80
    return parsed.scheme, parsed.hostname.lower(), parsed.port or default_port


def _is_score_request(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    phrase = value.get("phrase")
    dimensions = value.get("dimensions")
    if not isinstance(phrase, str) or not phrase.strip() or len(phrase) > 120:
        return False
    if not isinstance(dimensions, list) or not 1 <= len(dimensions) <= 3:
        return False
    if any(not isinstance(key, str) or key not in DIMENSIONS for key in dimensions):
        return False
    return len(set(dimensions)) == len(dimensions)


async def score_request(
    body: Any,
    request_url: str,
    origin: str | None,
    run_ai: AiRunner,
) -> tuple[dict[str, Any], int]:
    if origin:
        try:
            if _origin(origin) != _origin(request_url):
                return {"error": "Cross-origin requests are not allowed"}, 403
        except ValueError:
            return {"error": "Cross-origin requests are not allowed"}, 403

    if not _is_score_request(body):
        return {"error": "Invalid scoring request"}, 400

    phrase = body["phrase"]
    dimensions = body["dimensions"]
    jev_input = build_jev_input(phrase, dimensions)
    try:
        result = await run_ai("typesafe/jev", jev_input)
    except Exception as error:
        logging.error(
            json.dumps(
                {
                    "event": "jev_inference_failed",
                    "error_type": type(error).__name__,
                }
            )
        )
        return {
            "error": "Jev could not score that phrase",
            "inspection": inspection(jev_input, None),
        }, 502

    try:
        scores = scores_from_jev_response(result, dimensions)
        return {
            **scores,
            "inspection": inspection(jev_input, scores),
        }, 200
    except ValueError as error:
        logging.error(
            json.dumps(
                {
                    "event": "jev_response_invalid",
                    "error_type": type(error).__name__,
                }
            )
        )
        return {
            "error": "Jev could not score that phrase",
            "inspection": inspection(jev_input, None),
        }, 502
