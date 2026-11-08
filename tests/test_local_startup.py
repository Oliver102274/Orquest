"""Local env loading never requires a provider request."""
import unittest
from unittest.mock import patch
from backend.run_local import local_app
from backend.integrations.verify import ROOT


class LocalStartupTests(unittest.TestCase):
    def test_explicit_worktree_env_before_app_creation(self):
        events = []
        with patch("backend.run_local.load_local_env", side_effect=lambda path, **options: events.append((path, options))), patch("backend.main.create_app", side_effect=lambda: events.append("app") or "application"):
            self.assertEqual(local_app(), "application")
        self.assertEqual(events, [(ROOT / ".env", {"include_accounts": True}), "app"])
