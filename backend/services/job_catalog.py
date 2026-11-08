"""Read-only reference catalog and selected-occupation context adapter."""
from backend.catalog_models import JobCatalog, CatalogNotice
from backend.models import CareerDetail, Source, MDCPathwayCatalog, ExternalResourceCatalog
from backend.services.data import DataRepository, DataError

# Identity mappings only. Data Analyst is not assumed to equal Data Scientist.
CAREER_OCCUPATIONS = {"career_software_developer": "occupation_15_1252",
                      "career_cybersecurity_analyst": "occupation_15_1212"}


class JobCatalogRepository:
    def __init__(self, directory):
        self.directory = directory

    def load(self):
        names = [name for name in ["job_catalog.json", "orquest_job_catalog.json"] if (self.directory / name).exists()]
        if len(names) > 1:
            raise DataError("invalid_data", "Ambiguous catalog: supply only one supported catalog filename.")
        catalog = DataRepository(self.directory)._load(names[0] if names else "job_catalog.json", JobCatalog)
        unique = DataRepository._unique
        unique([f.id for f in catalog.families], "job_catalog families")
        unique([f.ordinal for f in catalog.families], "job_catalog family ordinals")
        unique([o.id for o in catalog.occupations], "job_catalog occupations")
        unique([o.soc_code for o in catalog.occupations], "job_catalog SOC codes")
        families = {f.id: f for f in catalog.families}
        for family in catalog.families:
            unique(family.occupation_ids, "job_catalog family members")
            if set(family.occupation_ids) != {o.id for o in catalog.occupations if o.family_id == family.id}:
                raise DataError("invalid_data", "Catalog family membership is inconsistent.")
        for occupation in catalog.occupations:
            if occupation.verified_per_row and occupation.verified_at is None:
                raise DataError("invalid_data", "Verified catalog rows require a verification timestamp.")
            if (occupation.family_id not in families or not set(occupation.source_refs) <= set(catalog.sources)
                    or occupation.id != "occupation_" + occupation.soc_code.replace("-", "_")
                    or not occupation.onet_soc_code.startswith(occupation.soc_code + ".")):
                raise DataError("invalid_data", "Catalog occupation IDs or source references are inconsistent.")
            wage = occupation.national_wage_2025
            if not wage.p10_annual_usd <= wage.median_annual_usd <= wage.p90_annual_usd:
                raise DataError("invalid_data", "Catalog wage percentiles are inconsistent.")
        return catalog

    @staticmethod
    def metadata(catalog):
        return CatalogNotice.model_validate(catalog.model_dump(exclude={"families", "occupations"}))

    @staticmethod
    def lookup(catalog, occupation_id):
        return next((o for o in catalog.occupations if o.id == occupation_id), None)

    def guidance_career(self, catalog, occupation, career_repository):
        links = [key for key, value in CAREER_OCCUPATIONS.items() if value == occupation.id]
        mdc, external = [], []
        if links:
            for career in career_repository.careers():
                if career.career_id in links:
                    mdc.extend(career.mdc_resources)
                    external.extend(career.external_resources)
        # Future teammate-supplied files use existing resource wrappers. No file is generated.
        for filename, schema, collection, field, target in [
            ("occupation_pathways.json", MDCPathwayCatalog, "pathways", "mdc_resources", mdc),
            ("occupation_external_resources.json", ExternalResourceCatalog, "careers", "external_resources", external),
        ]:
            if (self.directory / filename).exists():
                entries = getattr(DataRepository(self.directory)._load(filename, schema), collection)
                DataRepository._unique([entry.career_id for entry in entries], filename)
                for entry in entries:
                    if self.lookup(catalog, entry.career_id) is None:
                        raise DataError("invalid_data", "Occupation resource mapping references an unknown occupation.")
                    if entry.career_id == occupation.id:
                        target.extend(getattr(entry, field))
        DataRepository._unique([r.id for r in mdc + external], "occupation resources")
        verified = occupation.verified_per_row and occupation.verified_at is not None
        sources = [Source(title=ref, url=catalog.sources[ref],
                          verification_status="verified" if verified else "unverified",
                          verified_at=occupation.verified_at if verified else None) for ref in occupation.source_refs]
        return CareerDetail(career_id=occupation.id, title=occupation.title, summary=occupation.summary,
            requirements=["Typical entry education/experience (descriptive, not a universal requirement): " + occupation.entry_requirements_as_reported],
            sources=sources, mdc_resources=mdc, external_resources=external)
