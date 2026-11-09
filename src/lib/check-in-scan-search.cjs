const MAX_SEARCH_TERMS = 4;

// Builds one PostgREST `or` filter per word so "riya sharma" matches a
// registrant whose first and last names each contain one of the words.
// Characters with meaning in PostgREST filter syntax are stripped.
function buildEntryScanSearchFilters(search) {
  return String(search || '')
    .replace(/[%_,()'"\\.*:]/g, ' ')
    .trim()
    .slice(0, 120)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TERMS)
    .map(
      (term) =>
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,registration_code.ilike.%${term}%`
    );
}

module.exports = { buildEntryScanSearchFilters };
