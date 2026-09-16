import { applyAsyncFilters, HOOKS } from "@/lib/hooks";
import { loadThemeModule, type ThemeEditorField } from "@/themes/registry";

/**
 * Collected editor extension fields for the current request.
 *
 * Two sources merge into one map (keyed by a theme/plugin-local id):
 *   - the active theme's own `editorFields` (loaded via the theme registry);
 *   - anything registered through the `editor.fields` hook by plugins/extensions.
 *
 * The shared post editor renders whatever this returns; it never knows which
 * theme or plugin a field came from.
 */
export async function collectEditorFields(
  activeThemeSlug: string,
): Promise<Record<string, ThemeEditorField>> {
  const theme = await loadThemeModule(activeThemeSlug);
  const fields: Record<string, ThemeEditorField> = {
    ...(theme?.editorFields ?? {}),
  };
  const merged = await applyAsyncFilters<{ fields: Record<string, ThemeEditorField> }>(
    HOOKS.editorFields,
    { fields },
  );
  return merged.fields;
}