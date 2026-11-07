"""Read and validate contributor JSON without writing or inventing content."""

import json
from pathlib import Path

from pydantic import ValidationError

from backend.models import CardsResponse, CareerCatalog


class DataError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class DataRepository:
    def __init__(self, directory: Path):
        self.directory = directory

    def _load(self, filename, schema):
        try:
            raw = (self.directory / filename).read_text(encoding="utf-8-sig")
        except FileNotFoundError:
            raise DataError("data_unavailable", f"Required dataset {filename} has not been supplied.") from None
        except OSError:
            raise DataError("data_unavailable", f"Dataset {filename} cannot be read.") from None
        except UnicodeError:
            raise DataError("invalid_data", f"Dataset {filename} must be UTF-8 JSON.") from None
        try:
            return schema.model_validate(json.loads(raw))
        except (ValueError, ValidationError):
            raise DataError("invalid_data", f"Dataset {filename} does not match the draft JSON schema.") from None

    @staticmethod
    def _unique(values, filename):
        if len(values) != len(set(values)):
            raise DataError("invalid_data", f"Dataset {filename} contains duplicate IDs.")

    def cards(self):
        result = self._load("cards.json", CardsResponse)
        self._unique([card.id for card in result.cards], "cards.json")
        return result.cards

    def careers(self):
        result = self._load("careers.json", CareerCatalog)
        self._unique([career.career_id for career in result.careers], "careers.json")
        for career in result.careers:
            resources = career.mdc_resources + career.external_resources
            self._unique([resource.id for resource in resources], "careers.json")
        return result.careers
