import { definePlugin } from "@/lib/plugins/api";
import { APP_BRAND } from "@/lib/version";
import { BRAND_ART } from "./brand-art";

/**
 * Hello Friend —— 默认插件例程
 * ────────────────────────────────────────────────────────────
 * 演示 OboePress 插件的两块核心能力：
 *   1) 设置面板：plugin.json 里的 `settings` 由后台 /admin/plugins/<slug>
 *      自动渲染成表单（开关 / 文本域等），无需写任何 admin 代码；
 *   2) 客户端注入：通过 footer.html 钩子把一段零依赖 <script> 注入到
 *      每个前台页面 </body> 之前，脚本在浏览器里把字符画打印到控制台。
 *
 * 行为：
 *   - enabled=false       → 不输出任何东西；
 *   - content 非空         → 输出自定义内容（管理员可在面板里改）；
 *   - content 为空（默认） → 输出品牌字符画（见 brand-art.ts）；
 *   - showVersion=true     → 追加程序版本「OboePress vX.Y.Z」（默认开）；
 *   - showTime=true        → 追加「页面加载时间 YYYY-M-D H:M:S」；
 *   - showUrl=true         → 追加「当前 URL <location.href>」。
 */

type Settings = {
  enabled: boolean;
  content: string;
  showTime: boolean;
  showUrl: boolean;
  showVersion: boolean;
};

export default definePlugin<Settings>({
  setup({ settings, addFilter, HOOKS }) {
    addFilter<{ html: string[] }>(HOOKS.footerHtml, (payload) => {
      // 总开关：关掉就什么都不输出。
      if (!settings.enabled) return payload;

      // 把设置序列化进脚本，浏览器端据此渲染。content 经 JSON 转义，杜绝注入。
      const cfg = JSON.stringify({
        content: settings.content || "",
        showTime: !!settings.showTime,
        showUrl: !!settings.showUrl,
        showVersion: settings.showVersion !== false,
        // 版本号在服务端渲染时固化进脚本，浏览器端不依赖任何接口。
        brand: APP_BRAND,
      });

      payload.html.push(`<script>(function(){
  var C=${cfg};
  // 跳过后台，避免管理界面控制台被刷屏（仅在前台演示）。
  if(typeof location!=='undefined' && location.pathname.indexOf('/admin')===0) return;
  function pad(n){return n;}
  function ts(){
    var d=new Date();
    return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()+' '+d.getHours()+':'+d.getMinutes()+':'+d.getSeconds();
  }
  var lines=[];
  var body=(C.content && C.content.trim()) ? C.content : ${JSON.stringify(BRAND_ART)};
  lines.push(body);
  if(C.showVersion) lines.push(C.brand || '');
  if(C.showTime) lines.push('页面加载时间 '+ts());
  if(C.showUrl) lines.push('当前 URL '+location.href);
  var art=lines.join('\\n');
  // %c 让字符画带品牌色与等宽字体，在 DevTools 里更清晰。
  console.log('%c'+art, 'color:#5b8cff;font-family:ui-monospace,Menlo,Consolas,monospace');
})();</script>`);
      return payload;
    });
  },
});
