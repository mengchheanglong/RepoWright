export const GENERATED_PROMPT_FILENAME = '.repowright-prompt.md';
export const LEGACY_GENERATED_PROMPT_FILENAMES = ['.sourcelens-prompt.md', '.operator-prompt.md'] as const;

export function isGeneratedPromptFile(name: string): boolean {
  return name === GENERATED_PROMPT_FILENAME || LEGACY_GENERATED_PROMPT_FILENAMES.includes(name as (typeof LEGACY_GENERATED_PROMPT_FILENAMES)[number]);
}

export function promptFileExcludes(extra: string[] = []): string[] {
  return [GENERATED_PROMPT_FILENAME, ...LEGACY_GENERATED_PROMPT_FILENAMES, ...extra];
}
