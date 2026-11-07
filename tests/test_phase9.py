"""Tag compatibility and offline PostgreSQL readiness checks."""

import os
import unittest
from unittest.mock import patch

import psycopg

from backend.database import DatabaseError, check_connection, configuration_status
from backend.models import CareerRecord, MatchRequest, SwipeCard
from backend.services.matching import match_careers


class TagCompatibilityTests(unittest.TestCase):
    def test_alias_matches_without_mutating_records(self):
        card = SwipeCard(id="card_test", activity="Fixture", interest_tags=["math", "statistics"])
        career = CareerRecord(career_id="career_test", title="Fixture", summary="Test only", requirements=[],
                              sources=[], mdc_resources=[], external_resources=[], interest_tags=["statistics"])
        result = match_careers(MatchRequest(responses=[{"card_id": card.id, "preference": "like"}]), [card], [career])
        self.assertEqual(result.matches[0].interest_score, 100)
        self.assertEqual(result.matches[0].matched_interest_tags, ["statistics"])
        self.assertEqual(card.interest_tags, ["math", "statistics"])
        self.assertEqual(career.interest_tags, ["statistics"])

    def test_conflicting_aliases_cancel(self):
        cards = [SwipeCard(id="a", activity="Fixture", interest_tags=["math"]),
                 SwipeCard(id="b", activity="Fixture", interest_tags=["statistics"])]
        career = CareerRecord(career_id="career_test", title="Fixture", summary="Test only", requirements=[],
                              sources=[], mdc_resources=[], external_resources=[], interest_tags=["statistics"])
        request = MatchRequest(responses=[{"card_id": "a", "preference": "like"}, {"card_id": "b", "preference": "dislike"}])
        self.assertEqual(match_careers(request, cards, [career]).matches, [])


class DatabasePreparationTests(unittest.TestCase):
    def test_no_approval_no_connection(self):
        with patch("psycopg.connect") as connect, self.assertRaises(DatabaseError):
            check_connection()
        connect.assert_not_called()

    def test_rotation_required_even_with_url(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://user:old-fixture@localhost/db"}, clear=True), patch("psycopg.connect") as connect:
            with self.assertRaisesRegex(DatabaseError, "rotated_credentials_not_confirmed"):
                check_connection(approved=True)
            connect.assert_not_called()

    def test_success_only_select_one_and_readonly(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://user:rotated-fixture@localhost/db", "DATABASE_CREDENTIALS_ROTATED": "true"}, clear=True), patch("psycopg.connect") as connect:
            conn = connect.return_value.__enter__.return_value
            conn.execute.return_value.fetchone.return_value = (1,)
            self.assertTrue(check_connection(approved=True)["connected"])
            conn.execute.assert_called_once_with("SELECT 1")
            self.assertIn("default_transaction_read_only=on", connect.call_args.kwargs["options"])
            self.assertEqual(connect.call_args.kwargs["sslmode"], "require")
            self.assertEqual(connect.call_args.kwargs["connect_timeout"], 5)

    def test_driver_errors_are_sanitized(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://user:rotated-fixture@localhost/db", "DATABASE_CREDENTIALS_ROTATED": "true"}, clear=True), patch("psycopg.connect", side_effect=psycopg.OperationalError("secret-url")):
            with self.assertRaisesRegex(DatabaseError, "^database_connection_failed$"):
                check_connection(approved=True)

    def test_status_does_not_connect_or_expose_url(self):
        with patch.dict(os.environ, {"DATABASE_URL": "secret-value"}, clear=True), patch("psycopg.connect") as connect:
            self.assertEqual(configuration_status(), {"database_url_present": True, "rotated_credentials_confirmed": False})
            connect.assert_not_called()

    def test_tls_cannot_be_disabled_or_downgraded(self):
        for mode in ["disable", "verify-full"]:
            with patch.dict(os.environ, {"DATABASE_URL": f"postgresql://user:fixture@localhost/db?sslmode={mode}", "DATABASE_CREDENTIALS_ROTATED": "true"}, clear=True), patch("psycopg.connect") as connect:
                if mode == "disable":
                    with self.assertRaisesRegex(DatabaseError, "invalid_database_url"):
                        check_connection(approved=True)
                    connect.assert_not_called()
                else:
                    connect.return_value.__enter__.return_value.execute.return_value.fetchone.return_value = (1,)
                    check_connection(approved=True)
                    self.assertEqual(connect.call_args.kwargs["sslmode"], "verify-full")
