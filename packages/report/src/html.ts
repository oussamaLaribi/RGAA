import {
  RGAA_CRITERIA_COUNT,
  rgaaCriterion,
  type AuditResult,
  type Severity,
  type Violation,
  type ViolationTarget,
} from '@rgaa-source/core';

/**
 * Escape for HTML text and attribute values alike.
 *
 * Everything rendered here comes off someone else's page — element markup,
 * link wording, page titles — so it is untrusted by construction and must never
 * reach the document as markup.
 */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critique',
  serious: 'Majeur',
  moderate: 'Moyen',
  minor: 'Mineur',
};

function place(target: ViolationTarget): string {
  return target.source
    ? `${target.source.file}:${target.source.line}:${target.source.column}`
    : target.selector;
}

interface Entry {
  violation: Violation;
  target: ViolationTarget;
}

function groupByFile(violations: readonly Violation[]): Map<string, Entry[]> {
  const byFile = new Map<string, Entry[]>();

  for (const violation of violations) {
    for (const target of violation.targets) {
      const file = target.source?.file ?? 'Non rattaché à un fichier source';
      byFile.set(file, [...(byFile.get(file) ?? []), { violation, target }]);
    }
  }

  for (const [file, entries] of byFile) {
    byFile.set(
      file,
      entries.sort((a, b) => (a.target.source?.line ?? 0) - (b.target.source?.line ?? 0)),
    );
  }

  return new Map([...byFile].sort(([a], [b]) => a.localeCompare(b)));
}

function criteriaList(ids: readonly string[]): string {
  if (ids.length === 0) return '';

  const items = ids
    .map((id) => {
      const criterion = rgaaCriterion(id);
      const title = criterion ? escape(criterion.title) : '';
      return `<abbr title="${title}">${escape(id)}</abbr>`;
    })
    .join(', ');

  return `<p class="criteria">RGAA ${items}</p>`;
}

function renderViolations(result: AuditResult): string {
  const groups = groupByFile(result.violations);
  if (groups.size === 0) {
    return '<p class="clean">Aucune anomalie détectée par les contrôles automatiques.</p>';
  }

  const sections = [...groups].map(([file, entries]) => {
    const rows = entries
      .map(
        ({ violation, target }) => `
      <li class="finding sev-${violation.severity}">
        <p class="where"><code>${escape(place(target))}</code>
          <span class="severity">${SEVERITY_LABEL[violation.severity]}</span>
          <span class="rule">${escape(violation.ruleId)}</span></p>
        <p class="what">${escape(violation.message)}</p>
        <pre><code>${escape(target.html)}</code></pre>
        <p class="why">${escape(violation.help)}</p>
        <p class="how"><strong>Correction —</strong> ${escape(violation.recommendation)}</p>
        ${criteriaList(violation.rgaa)}
      </li>`,
      )
      .join('');

    return `<section class="file"><h3>${escape(file)}</h3><ul>${rows}</ul></section>`;
  });

  return sections.join('');
}

function renderManual(result: AuditResult): string {
  if (result.manualChecks.length === 0) return '';

  const items = result.manualChecks
    .map(
      (check) => `
      <li>
        <p class="what">${escape(check.question)} <span class="rule">${escape(check.ruleId)}</span></p>
        ${check.targets.length > 0 ? `<p class="where"><code>${escape(check.targets.map(place).join(', '))}</code></p>` : ''}
        ${criteriaList(check.rgaa)}
      </li>`,
    )
    .join('');

  return `
    <section class="manual">
      <h2>À vérifier par un humain</h2>
      <p>Ces points ne peuvent pas être tranchés automatiquement : ils dépendent du
      sens de la page, pas de son balisage.</p>
      <ul>${items}</ul>
    </section>`;
}

function renderPage(result: AuditResult): string {
  const { coverage } = result;

  return `
  <article class="page">
    <h2>${escape(result.url)}</h2>

    <div class="score">
      <p class="value">${result.score.value}<span>/100</span></p>
      <p class="label">Score de pré-audit automatique</p>
    </div>

    <table class="coverage">
      <caption>Couverture du référentiel RGAA ${escape(result.rgaaVersion)}</caption>
      <tbody>
        <tr><th scope="row">Critères en échec</th><td>${coverage.failing.length}</td>
            <td>${escape(coverage.failing.join(', ')) || '—'}</td></tr>
        <tr><th scope="row">Critères à vérifier</th><td>${coverage.needingReview.length}</td>
            <td>${escape(coverage.needingReview.join(', ')) || '—'}</td></tr>
        <tr><th scope="row">Critères hors contrôle automatique</th><td>${coverage.silent}</td>
            <td>sur ${RGAA_CRITERIA_COUNT}</td></tr>
      </tbody>
    </table>

    <h2>Anomalies détectées</h2>
    ${renderViolations(result)}
    ${renderManual(result)}
  </article>`;
}

const STYLE = `
  :root { color-scheme: light dark; --bg:#fff; --fg:#1a1a1a; --muted:#5a5a5a;
    --line:#d8d8d8; --crit:#b00020; --serious:#c2410c; --moderate:#a16207; --minor:#3f6212; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#141414; --fg:#ececec; --muted:#a0a0a0; --line:#333;
      --crit:#ff6b7a; --serious:#ff9f5a; --moderate:#e0b64a; --minor:#a3d160; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:2rem 1.25rem; background:var(--bg); color:var(--fg);
    font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 62rem; margin: 0 auto; }
  h1 { font-size:1.75rem; margin:0 0 .25rem; }
  h2 { font-size:1.25rem; margin:2.5rem 0 .75rem; padding-bottom:.35rem;
    border-bottom:1px solid var(--line); }
  h3 { font-size:1rem; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; margin:1.5rem 0 .5rem; }
  .lede { color:var(--muted); margin:0 0 2rem; }
  .score { display:flex; align-items:baseline; gap:.75rem; margin:1.5rem 0; }
  .score .value { font-size:3rem; font-weight:700; margin:0; }
  .score .value span { font-size:1.25rem; font-weight:400; color:var(--muted); }
  .score .label { color:var(--muted); margin:0; }
  table { border-collapse:collapse; width:100%; margin:1rem 0; }
  caption { text-align:left; color:var(--muted); padding-bottom:.5rem; }
  th, td { text-align:left; padding:.45rem .6rem; border-bottom:1px solid var(--line);
    vertical-align:top; }
  ul { list-style:none; padding:0; margin:0; }
  .finding { border-left:3px solid var(--line); padding:.75rem 0 .75rem 1rem; margin:0 0 1.25rem; }
  .sev-critical { border-color:var(--crit); } .sev-serious { border-color:var(--serious); }
  .sev-moderate { border-color:var(--moderate); } .sev-minor { border-color:var(--minor); }
  .finding p { margin:.25rem 0; }
  .where code { font-weight:600; }
  .severity, .rule { font-size:.8rem; color:var(--muted); margin-left:.5rem; }
  .what { font-weight:600; }
  .why, .criteria { color:var(--muted); font-size:.9rem; }
  pre { overflow-x:auto; background:color-mix(in srgb, var(--fg) 6%, transparent);
    padding:.6rem .75rem; border-radius:4px; margin:.5rem 0; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.85em; }
  abbr { text-decoration:underline dotted; cursor:help; }
  .clean { color:var(--minor); font-weight:600; }
  .caveat { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--line);
    color:var(--muted); font-size:.9rem; }
`;

export interface HtmlOptions {
  /** Shown under the heading. Defaults to the first scanned address. */
  title?: string;
}

/**
 * A self-contained report, in French, meant to be handed to whoever commissioned
 * the work. No external stylesheet, no script, no network: it has to still open
 * correctly from an email attachment two years from now.
 */
export function toHtml(results: readonly AuditResult[], options: HtmlOptions = {}): string {
  const first = results[0];
  const title = options.title ?? first?.url ?? 'Pré-audit';
  const generated = new Date(first?.timestamp ?? Date.now()).toLocaleString('fr-FR');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pré-audit d'accessibilité — ${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1>Pré-audit d'accessibilité</h1>
  <p class="lede">${escape(title)} — ${escape(generated)}</p>

  ${results.map(renderPage).join('')}

  <section class="caveat">
    <h2>Portée de ce document</h2>
    <p>Ce rapport est un <strong>pré-audit automatique</strong>. Le score qu'il
    affiche n'est pas un taux de conformité RGAA : cette notion est réglementaire
    et s'établit par un audit humain.</p>
    <p>Environ un tiers seulement des ${RGAA_CRITERIA_COUNT} critères du RGAA est
    atteignable par un contrôle automatique. Aucun critère n'est déclaré conforme
    ici : seules les anomalies constatées le sont. Les critères cités sont ceux
    <em>concernés</em> par une anomalie, et non un jugement rendu sur eux.</p>
    <p>Moteur ${escape(first?.engineVersion ?? '')} · référentiel RGAA
    ${escape(first?.rgaaVersion ?? '')} · calcul du score v${first?.score.scoringVersion ?? ''}</p>
  </section>
</main>
</body>
</html>
`;
}
