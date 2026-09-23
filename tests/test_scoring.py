import math
import unittest
from types import SimpleNamespace

from worker.scoring import (
    DIMENSIONS,
    build_jev_input,
    score_request,
    scores_from_jev_response,
)


class JevContractTests(unittest.TestCase):
    def test_uses_exact_phrase_as_state_with_parallel_score_questions(self):
        result = build_jev_input(
            "Send the signed copy by noon.", ["urgency", "specificity"]
        )

        self.assertEqual(result["state"], "Send the signed copy by noon.")
        self.assertEqual(
            result["questions"],
            {
                "urgency": {
                    "type": "score",
                    "instructions": DIMENSIONS["urgency"]["instructions"],
                    "criteria": DIMENSIONS["urgency"]["criteria"],
                },
                "specificity": {
                    "type": "score",
                    "instructions": DIMENSIONS["specificity"]["instructions"],
                    "criteria": DIMENSIONS["specificity"]["criteria"],
                },
            },
        )

    def test_parses_direct_and_workers_ai_envelope_responses(self):
        response = {
            "model": "jev-1.13.0",
            "answers": {
                "urgency": {"type": "score", "score": 3.25, "confidence": 0.91},
                "specificity": {
                    "type": "score",
                    "score": 1.4,
                    "confidence": 0.78,
                },
            },
        }
        expected = {
            "model": "jev-1.13.0",
            "scores": {
                "urgency": {"score": 3.25, "confidence": 0.91},
                "specificity": {"score": 1.4, "confidence": 0.78},
            },
        }

        self.assertEqual(
            scores_from_jev_response(response, ["urgency", "specificity"]),
            expected,
        )
        self.assertEqual(
            scores_from_jev_response({"result": response}, ["urgency", "specificity"]),
            expected,
        )

    def test_parses_property_backed_python_worker_responses(self):
        response = SimpleNamespace(
            model="jev-1.13.0",
            answers=SimpleNamespace(
                urgency=SimpleNamespace(score=3.25, confidence=0.91),
            ),
        )

        self.assertEqual(
            scores_from_jev_response(response, ["urgency"]),
            {
                "model": "jev-1.13.0",
                "scores": {"urgency": {"score": 3.25, "confidence": 0.91}},
            },
        )

    def test_rejects_missing_non_finite_and_out_of_range_scores(self):
        for score in (None, math.nan, -0.1, 4.1, True):
            with self.subTest(score=score), self.assertRaises(ValueError):
                scores_from_jev_response(
                    {"answers": {"urgency": {"score": score}}}, ["urgency"]
                )


class ScoreRequestTests(unittest.IsolatedAsyncioTestCase):
    async def test_runs_jev_once_and_returns_scores_without_caching(self):
        calls = []

        async def run(model, value):
            calls.append((model, value))
            return {
                "model": "jev-1.13.0",
                "answers": {
                    "urgency": {"score": 3.25, "confidence": 0.91},
                    "specificity": {"score": 1.4, "confidence": 0.78},
                },
            }

        payload, status = await score_request(
            {
                "phrase": "Send the signed copy by noon.",
                "dimensions": ["urgency", "specificity"],
            },
            "https://jev-tone.tomv.uk/api/score",
            "https://jev-tone.tomv.uk",
            run,
        )

        self.assertEqual(status, 200)
        self.assertEqual(payload["model"], "jev-1.13.0")
        self.assertEqual(payload["scores"]["urgency"]["score"], 3.25)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "typesafe/jev")
        self.assertEqual(calls[0][1]["state"], "Send the signed copy by noon.")

    async def test_rejects_cross_origin_and_scheme_mismatch_before_inference(self):
        calls = []

        async def run(model, value):
            calls.append((model, value))

        for origin in ("https://attacker.example", "http://jev-tone.tomv.uk"):
            with self.subTest(origin=origin):
                payload, status = await score_request(
                    {"phrase": "Hello", "dimensions": ["playfulness"]},
                    "https://jev-tone.tomv.uk/api/score",
                    origin,
                    run,
                )
                self.assertEqual(status, 403)
                self.assertIn("error", payload)
        self.assertEqual(calls, [])

    async def test_rejects_invalid_requests_before_inference(self):
        calls = []

        async def run(model, value):
            calls.append((model, value))

        invalid = [
            {"phrase": "", "dimensions": ["urgency"]},
            {"phrase": "x" * 121, "dimensions": ["urgency"]},
            {"phrase": "Hello", "dimensions": ["urgency", "urgency"]},
            {"phrase": "Hello", "dimensions": ["made_up"]},
            {"phrase": "Hello", "dimensions": []},
            {
                "phrase": "Hello",
                "dimensions": [
                    "urgency",
                    "specificity",
                    "playfulness",
                    "formality",
                ],
            },
        ]

        for body in invalid:
            with self.subTest(body=body):
                payload, status = await score_request(
                    body,
                    "https://jev-tone.tomv.uk/api/score",
                    "https://jev-tone.tomv.uk",
                    run,
                )
                self.assertEqual(status, 400)
                self.assertIn("error", payload)
        self.assertEqual(calls, [])

    async def test_maps_inference_failures_to_a_fixed_error(self):
        async def run(model, value):
            raise RuntimeError("provider detail that must not reach the player")

        with self.assertLogs(level="ERROR") as logs:
            payload, status = await score_request(
                {"phrase": "Hello", "dimensions": ["friendliness"]},
                "https://jev-tone.tomv.uk/api/score",
                "https://jev-tone.tomv.uk",
                run,
            )

        self.assertEqual(status, 502)
        self.assertEqual(payload, {"error": "Jev could not score that phrase"})
        self.assertIn('"event": "jev_inference_failed"', logs.output[0])

    async def test_maps_invalid_jev_responses_to_a_fixed_error(self):
        async def run(model, value):
            return {"answers": {}}

        with self.assertLogs(level="ERROR") as logs:
            payload, status = await score_request(
                {"phrase": "Hello", "dimensions": ["friendliness"]},
                "https://jev-tone.tomv.uk/api/score",
                "https://jev-tone.tomv.uk",
                run,
            )

        self.assertEqual(status, 502)
        self.assertEqual(payload, {"error": "Jev could not score that phrase"})
        self.assertIn('"event": "jev_response_invalid"', logs.output[0])


if __name__ == "__main__":
    unittest.main()
