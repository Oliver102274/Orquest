"""Provisional contributor vocabulary bridge; original records stay intact."""

# Compatibility alias requested for integration, not a scientific equivalence.
# Other unmatched tags need contributor review instead of speculative mappings.
TAG_ALIASES = {"math": "statistics"}


def canonical_tags(tags):
    return {TAG_ALIASES.get(tag, tag) for tag in tags}
