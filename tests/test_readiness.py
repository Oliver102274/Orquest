"""No live calls: verify the manual test helper's gates and env parsing."""

import contextlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.integrations.common import AIServiceError
from backend.integrations.verify import load_local_env, main


class ReadinessTests(unittest.TestCase):
    def test_env_literals_and_process_precedence(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            path = Path(directory) / ".env"
            path.write_text('GEMINI_API_KEY="fake-$literal"\nPRUNE_API_KEY=local\n', encoding="utf-8")
            with patch.dict(os.environ, {"PRUNE_API_KEY": "process"}, clear=True):
                load_local_env(path)
                self.assertEqual(os.environ["GEMINI_API_KEY"], "fake-$literal")
                self.assertEqual(os.environ["PRUNE_API_KEY"], "process")

    def test_invalid_env_never_echoes_value(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            path = Path(directory) / ".env"
            path.write_text('GEMINI_API_KEY="private-value', encoding="utf-8")
            with self.assertRaises(AIServiceError) as caught:
                load_local_env(path)
            self.assertNotIn("private-value", str(caught.exception))

    def test_dry_run_cannot_call_provider_even_when_enabled(self):
        with patch.dict(os.environ, {"ORQUESTRA_AI_ENABLED": "true", "AI_MAX_REQUESTS_PER_PROVIDER": "1"}, clear=True), patch("backend.integrations.verify.load_local_env"), patch("backend.integrations.gemini.GeminiService.explain_career") as call, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["gemini"]), 0)
            call.assert_not_called()

    def test_live_still_blocked_by_default(self):
        with patch.dict(os.environ, {"GEMINI_MODEL": "gemini-3.1-flash-lite"}, clear=True), patch("backend.integrations.verify.load_local_env"), patch("google.genai.Client") as call, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["gemini", "--live"]), 1)
            call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
