"""Question-specific local guidance. Reference claims retain their verification labels."""
import re
from dataclasses import dataclass

from backend.services.data import DataError
from backend.services.job_catalog import CAREER_OCCUPATIONS


@dataclass
class CatalogAnswer:
    answer: str
    source_urls: list[str]
    resource_ids: list[str]


TOPICS = {
    "salary": r"\b(salary|salaries|money|earn\w*|income|wages?|pay|paid|compensation)\b|how much.*\bmake\b",
    "education": r"\b(education|degrees?|college|school|diplomas?|qualifications?|requirements?|prerequisites?)\b",
    "skills": r"\b(skills?|abilities|knowledge|competencies)\b|need to know|good at",
    "outlook": r"\b(outlook|demand|growth|prospects?|hiring|opportunities|future)\b",
    "start": r"\b(start\w*|begin\w*|become|first steps?)\b|break into",
    "learning": r"\b(learn\w*|resources?|courses?|certifications?|certificates?|study|training)\b",
}


def catalog_answer(career, question, repository, catalog_repository):
    """Resolve only the selected ID or an explicit identity mapping, never title similarity."""
    query = question.casefold()
    topics = [topic for topic, pattern in TOPICS.items() if re.search(pattern, query)]
    if not topics:
        return None  # Preserve the existing generic fallback for unsupported questions.
    # Tuition is not earnings. Do not substitute an occupation's salary for course costs.
    if re.search(r"\b(tuition|costs?|pay for)\b", query):
        return CatalogAnswer("AI is unavailable. This is a catalog-based fallback, not an AI answer. "
                             "Verified tuition, course costs, and funding information are not available here. "
                             "Confirm costs directly with the educational provider.", [], [])

    occupation_id = career.career_id if career.career_id.startswith("occupation_") else CAREER_OCCUPATIONS.get(career.career_id)
    catalog = occupation = None
    if occupation_id:
        try:
            catalog = catalog_repository.load()
            occupation = catalog_repository.lookup(catalog, occupation_id)
        except DataError:
            pass  # Optional reference data must not break legacy career chat.
    resources = [r for r in career.mdc_resources + career.external_resources
                 if r.verification_status == "verified" and r.verified_at is not None and r.source_url]
    urls, resource_ids, sections = set(), [], []

    def reference(field):
        if not occupation:
            return
        if field in occupation.source_refs and field in catalog.sources:
            urls.add(str(catalog.sources[field]))

    def source_note(field, title):
        if field in occupation.source_refs and field in catalog.sources:
            return f" Source reference listed by the catalog: {title}; verify the figures and year there."
        return " No source reference was supplied for this field."

    if any(topic in topics for topic in ("salary", "education", "outlook")) and occupation:
        verified = occupation.verified_per_row and occupation.verified_at is not None
        sections.append(f"Selected occupation: {occupation.title} (SOC {occupation.soc_code}). "
                        + ("This row is marked verified in the supplied catalog. " if verified else
                           "This catalog row is unverified and has not been independently checked; the following are reported reference figures, not confirmed facts. ")
                        + f"Catalog source-data date as reported: {catalog.source_data_date_as_reported}.")
    if "salary" in topics:
        if occupation:
            wage = occupation.national_wage_2025
            sections.append(f"Salary: the catalog reports 2025 United States national annual wages (USD): "
                            f"median ${wage.median_annual_usd:,.0f}; 10th percentile ${wage.p10_annual_usd:,.0f}; "
                            f"90th percentile ${wage.p90_annual_usd:,.0f}. These are not Florida/Miami figures, "
                            "starting salaries, hourly rates, take-home pay, or a guarantee of your earnings."
                            + source_note("national_wages", "BLS national wage tables"))
            reference("national_wages")
        else:
            sections.append(f"Salary: no occupation-specific salary information is available for {career.title}; "
                            "no salary from a different occupation has been substituted.")
    if "education" in topics:
        if occupation:
            sections.append("Education: typical entry education/experience as reported in the catalog: "
                            + occupation.entry_requirements_as_reported
                            + ". This is descriptive, not a universal requirement or a guarantee that one degree is necessary. "
                            "Confirm employer and licensing requirements for your location."
                            + source_note("occupation_projection", "BLS occupational projections and characteristics"))
            reference("occupation_projection")
        else:
            sections.append("Education: no occupation-specific entry education record is available. "
                            "A linked learning resource does not establish a required degree.")
    if "skills" in topics:
        skill_career = career if not career.career_id.startswith("occupation_") else None
        if skill_career is None:
            linked = [key for key, value in CAREER_OCCUPATIONS.items() if value == occupation_id]
            if linked:
                try:
                    skill_career = next((c for c in repository.careers() if c.career_id in linked), None)
                except DataError:
                    pass
        if skill_career and skill_career.requirements:
            verified = any(s.verification_status == "verified" and s.verified_at is not None for s in skill_career.sources)
            sections.append("Skills and qualifications listed in the supplied career record "
                            + ("(record has a verified source): " if verified else "(unverified; confirm before relying on them): ")
                            + "; ".join(skill_career.requirements) + ".")
            urls.update(str(s.url) for s in skill_career.sources if s.url)
        else:
            sections.append("Skills: a dedicated skills list is not available for this occupation.")
            if occupation:
                sections.append("The catalog's reported role description (not a verified skills checklist) is: " + occupation.summary)
    if "outlook" in topics:
        if occupation:
            sections.append(f"Outlook: the catalog reports United States employment growth of "
                            f"{occupation.projected_growth_2025_2035_percent:g}% for 2025–2035, "
                            f"with job change reported as {occupation.projected_job_change_as_reported}. "
                            "This is a projection, not current vacancies or a guarantee of employment."
                            + source_note("occupation_projection", "BLS occupational projections and characteristics"))
            reference("occupation_projection")
        else:
            sections.append("Outlook: no occupation-specific employment projection is available.")
    if "start" in topics:
        sections.append(f"Getting started with {career.title}: investigate the role and its requirements, "
                        "compare them with your current education and skills, and discuss any gaps with an advisor. "
                        "These are suggested next steps, not verified employment requirements.")
    if "learning" in topics or "start" in topics:
        if resources:
            sections.append("Verified learning options to investigate (not mandatory credentials): "
                            + "; ".join(f"{r.title} — {r.organization}" for r in resources) + ".")
            urls.update(str(r.source_url) for r in resources)
            resource_ids = [r.id for r in resources]
        else:
            sections.append("No verified MDC or external learning resources are available for this occupation yet.")
    return CatalogAnswer("AI is unavailable. This is a catalog-based fallback, not an AI answer. "
                         + "\n\n".join(sections), sorted(urls), resource_ids)
