import { getActiveTheme } from "@/lib/services/themes";
import { loadThemeModule } from "@/themes/registry";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const theme = await getActiveTheme();
  const themeModule = await loadThemeModule(theme.slug);

  if (!themeModule) {
    const fallback = await loadThemeModule("default");
    if (fallback) return <fallback.HomePage />;
    return <div>无法加载主题</div>;
  }

  return <themeModule.HomePage />;
}
