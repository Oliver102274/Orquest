"""Transparent tag alignment, not AI inference or career suitability prediction."""

from backend.models import CareerMatch, MatchRequest, MatchesResponse


class UnknownCardError(ValueError):
    pass


def match_careers(request: MatchRequest, cards, careers) -> MatchesResponse:
    by_id = {card.id: card for card in cards}
    liked, disliked = set(), set()
    for response in request.responses:
        if response.card_id not in by_id:
            raise UnknownCardError("One or more card IDs are not in the current deck.")
        tags = by_id[response.card_id].interest_tags
        if response.preference == "like":
            liked.update(tags)
        elif response.preference == "dislike":
            disliked.update(tags)
    # Conflicting signals cancel. Repeated tags do not inflate their influence.
    positive, negative = liked - disliked, disliked - liked
    matches = []
    for career in careers:
        tags = set(career.interest_tags)
        aligned = sorted(tags & positive)
        net = len(aligned) - len(tags & negative)
        if not tags or net <= 0:
            continue
        matches.append(CareerMatch(
            career_id=career.career_id,
            title=career.title,
            matched_interest_tags=aligned,
            interest_score=round(100 * net / len(tags), 2),
            rationale="Shared liked tags: " + ", ".join(aligned)
            + ". Disliked tags reduce alignment; conflicting signals cancel.",
        ))
    matches.sort(key=lambda match: (-match.interest_score, match.career_id))
    return MatchesResponse(matches=matches)
