import { definePlugin } from "@/lib/plugins/api";

/**
 * 复制版权声明：监听 copy 事件改写剪贴板文本。
 * - 仅在选区位于正文容器内时追加（可关）；
 * - 短复制不追加，避免复制短句/代码片段被污染；
 * - 模板里的 \\n 在插件设置 JSON 中是字面量，注入前统一转成真实换行。
 */

type Settings = {
  template: string;
  onlyArticle: boolean;
  minChars: number;
};

const CONTENT_SEL = ".bmx-blocks,.post-content,.entry-content,.article-content";

export default definePlugin<Settings>({
  setup({ settings, addFilter, HOOKS }) {
    addFilter<{ html: string[] }>(HOOKS.footerHtml, (payload) => {
      // 设置 JSON 里的 \n 是字面反斜杠+n，先转成真实换行再交给 JSON.stringify 转义。
      const tpl = (settings.template || "").replace(/\\r\\n|\\n/g, "\n");
      const cfg = JSON.stringify({
        t: tpl,
        a: !!settings.onlyArticle,
        min: Math.max(0, Number(settings.minChars) || 0),
      });

      payload.html.push(`<script>(function(){var C=${cfg};
document.addEventListener('copy',function(e){
  var sel=window.getSelection?window.getSelection():null;
  var text=sel?String(sel.toString()||''):'';
  if(!text||text.length<C.min)return;
  if(C.a&&sel.rangeCount){
    var node=sel.anchorNode;
    var el=node&&node.nodeType===1?node:(node?node.parentElement:null);
    if(!el||!el.closest('${CONTENT_SEL}'))return;
  }
  var add=C.t.replace(/\\{url\\}/g,location.href).replace(/\\{title\\}/g,document.title);
  if(e.clipboardData&&e.clipboardData.setData){
    e.clipboardData.setData('text/plain',text+add);
    e.preventDefault();
  }
});
})();</script>`);
      return payload;
    });
  },
});
