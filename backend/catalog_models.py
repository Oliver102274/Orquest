"""Contributor catalog fields preserved verbatim; verification is explicit."""
from datetime import date
from pydantic import Field, HttpUrl, AwareDatetime
from backend.models import Model, Identifier, Text


class NationalWage(Model):
    median_annual_usd: float = Field(ge=0)
    p10_annual_usd: float = Field(ge=0)
    p90_annual_usd: float = Field(ge=0)


class JobFamily(Model):
    id: Identifier
    name: Text
    ordinal: int = Field(ge=1)
    bls_group_code: str
    bls_group_title: Text
    jobs_2025_thousands: float = Field(ge=0)
    median_wage_2025_usd: float = Field(ge=0)
    projected_growth_2025_2035_percent: float
    occupation_ids: list[Identifier]


class Occupation(Model):
    id: Identifier
    family_id: Identifier
    title: Text
    bls_title: Text
    soc_code: str = Field(pattern=r"^\d{2}-\d{4}$")
    onet_soc_code: str = Field(pattern=r"^\d{2}-\d{4}\.\d{2}$")
    summary: Text
    national_wage_2025: NationalWage
    entry_requirements_as_reported: Text
    projected_growth_2025_2035_percent: float
    projected_job_change_as_reported: str
    source_refs: list[str]
    verified_per_row: bool
    verified_at: AwareDatetime | None = None


class CatalogMetadata(Model):
    schema_version: str
    title: Text
    based_on: Text
    source_data_date_as_reported: date
    provenance: Text
    usage_notes: list[str]
    sources: dict[str, HttpUrl]


class JobCatalog(CatalogMetadata):
    families: list[JobFamily]
    occupations: list[Occupation]


class CatalogNotice(CatalogMetadata):
    salary_scope: str = "United States national figures as reported; not Florida or Miami salaries."
    verification_notice: str = "Reference data; inspect verified_per_row. Typical education is not a universal employment or licensing requirement."


class FamiliesResponse(Model):
    families: list[JobFamily]
    metadata: CatalogNotice


class OccupationsResponse(Model):
    occupations: list[Occupation]
    metadata: CatalogNotice


class OccupationResponse(Model):
    occupation: Occupation
    linked_career_ids: list[str]
    metadata: CatalogNotice
