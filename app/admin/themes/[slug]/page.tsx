import { notFound } from "next/navigation";
import ThemeSettingsForm from "@/components/ThemeSettingsForm";
import { getThemePanel } from "@/lib/services/themes";
import { DEFAULT_THEME_CONFIG } from "@/lib/theme";
import { getThemeManifest, loadThemeModule } from "@/themes/registry";

export const dynamic = "force-dynamic";

export default async function ThemeSettingsPage({
  params,
}: {
  params: { slug: string };
}) {
  let panel;
  try {
    panel = await getThemePanel(params.slug);
  } catch {
    notFound();
  }
  if (!panel) notFound();

  const manifest = getThemeManifest(panel.theme.slug);
  const themeModule = await loadThemeModule(panel.theme.slug);
  const SettingsPanel = themeModule?.settingsPanel;

  return (
    <>
      <ThemeSettingsForm
        slug={panel.theme.slug}
        name={panel.theme.name}
        version={manifest?.version ?? "—"}
        author={manifest?.author ?? ""}
        description={manifest?.description ?? "在管理后台创建的自定义主题"}
        isActive={panel.isActive}
        hasManifest={panel.hasManifest}
        appearanceSchema={panel.appearanceSchema}
        settingsSchema={panel.settingsSchema}
        widgetAreas={panel.widgetAreas}
        initialConfig={panel.config}
        initialSettings={panel.settings}
        baselineConfig={{ ...DEFAULT_THEME_CONFIG, ...(manifest?.config ?? {}) }}
      />

      {SettingsPanel ? (
        <div className="mt-6">
          <SettingsPanel />
        </div>
      ) : null}
    </>
  );
}
