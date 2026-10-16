
function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

export function DiscoverEvidenceField({
  candidateCount = 0,
  resultGroups = {},
}) {
  const context = count(resultGroups.context);
  if (!(candidateCount === 0 && context > 0)) return null;
  return (
    <section className="rd-v2-discover-field" data-testid="discover-evidence-field" aria-label="Discover evidence field">
      <header>
        <div>
          <strong>No collection-ready route yet</strong>
          <p>{`${context} relevant reference${context === 1 ? " is" : "s are"} available to inspect or test its connection.`}</p>
        </div>
      </header>
    </section>
  );
}
