export { injectSourceAttributes, type InjectionResult } from './inject-source.js';
export { parseTemplateElements } from './template-ast.js';
export { parseSourceFile } from './parse-source.js';
export {
  instrumentTemplates,
  hasPendingRestore,
  type InstrumentationSession,
  type InstrumentedFile,
} from './project.js';
