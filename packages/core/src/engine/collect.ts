/**
 * Raw shapes coming back from axe-core, narrowed to what we consume.
 *
 * We do not re-export axe's own types: they describe a far larger surface than
 * we use, and everything crossing the page boundary must be plain JSON anyway.
 */
export interface RawNode {
  /** Truncated outerHTML, as axe reports it. */
  html: string;
  /** axe's selector path. Nested entries mean the node lives inside a frame. */
  target: string[];
  /** Value of the source attribute, when the page was built from instrumented templates. */
  source: string | null;
  failureSummary: string | null;
}

export interface RawRuleResult {
  id: string;
  impact: string | null;
  tags: string[];
  help: string;
  description: string;
  helpUrl: string;
  nodes: RawNode[];
}

export interface RawAxeReport {
  url: string;
  violations: RawRuleResult[];
  passes: RawRuleResult[];
  /** axe's "needs review": the automated seed of the manual checklist. */
  incomplete: RawRuleResult[];
  inapplicable: RawRuleResult[];
  /** Present when axe itself failed, so the caller can report it honestly. */
  error?: string;
}

export interface CollectOptions {
  sourceAttribute: string;
  /**
   * axe locale, applied before the run so every message arrives already
   * translated. Localising here rather than at display time means the console,
   * the HTML report, the RGAA grid and the JSON all speak one language without
   * anyone translating twice.
   */
  locale?: unknown;
  /**
   * Restricting to violations makes axe noticeably faster, but it also collapses
   * `passes` to a single node per rule, which destroys the denominator the score
   * is built from. Callers that do not need a score can turn it on.
   */
  violationsOnly?: boolean;
}

/**
 * Runs inside the page. Must stay self-contained: it is serialised and evaluated
 * in the browser, so it cannot close over imports, module state or helpers.
 *
 * The source attribute is read here rather than in Node because this is the only
 * place the real elements exist. axe reports selectors, and re-querying them
 * afterwards would reintroduce exactly the guesswork the product exists to avoid.
 */
export async function collectAxeResults(options: CollectOptions): Promise<RawAxeReport> {
  const globalAxe = (globalThis as { axe?: unknown }).axe as
    | {
        run: (
          context: unknown,
          runOptions: unknown,
        ) => Promise<Record<string, unknown> & { url?: string }>;
      }
    | undefined;

  if (!globalAxe) {
    return {
      url: location.href,
      violations: [],
      passes: [],
      incomplete: [],
      inapplicable: [],
      error: 'axe-core was not present in the page',
    };
  }

  if (options.locale) {
    try {
      (globalAxe as { configure?: (config: unknown) => void }).configure?.({
        locale: options.locale,
      });
    } catch {
      // A malformed locale must cost the translation, never the scan.
    }
  }

  const runOptions: Record<string, unknown> = {
    // Hand back the real element so the source attribute can be read off it.
    elementRef: true,
  };
  if (options.violationsOnly) runOptions['resultTypes'] = ['violations'];

  let raw: Record<string, unknown> & { url?: string };
  try {
    raw = await globalAxe.run(document, runOptions);
  } catch (error) {
    return {
      url: location.href,
      violations: [],
      passes: [],
      incomplete: [],
      inapplicable: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const readGroup = (key: string): RawRuleResult[] => {
    const group = raw[key];
    if (!Array.isArray(group)) return [];

    return group.map((rule: Record<string, unknown>) => ({
      id: String(rule['id'] ?? ''),
      impact: rule['impact'] == null ? null : String(rule['impact']),
      tags: Array.isArray(rule['tags']) ? rule['tags'].map(String) : [],
      help: String(rule['help'] ?? ''),
      description: String(rule['description'] ?? ''),
      helpUrl: String(rule['helpUrl'] ?? ''),
      nodes: (Array.isArray(rule['nodes']) ? rule['nodes'] : []).map(
        (node: Record<string, unknown>) => {
          const element = node['element'] as Element | undefined;
          return {
            html: String(node['html'] ?? ''),
            target: Array.isArray(node['target']) ? node['target'].map(String) : [],
            source: element?.getAttribute?.(options.sourceAttribute) ?? null,
            failureSummary:
              node['failureSummary'] == null ? null : String(node['failureSummary']),
          };
        },
      ),
    }));
  };

  return {
    url: typeof raw.url === 'string' ? raw.url : location.href,
    violations: readGroup('violations'),
    passes: readGroup('passes'),
    incomplete: readGroup('incomplete'),
    inapplicable: readGroup('inapplicable'),
  };
}
