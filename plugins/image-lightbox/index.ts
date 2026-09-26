import { definePlugin } from "@/lib/plugins/api";

/**
 * 图片灯箱：事件委托处理正文图片点击，零依赖、无重复绑定问题。
 * 仅对正文容器（.bmx-blocks / .post-content 等）内、达到最小尺寸的图片生效，
 * 避开表情与图标；Esc、点击遮罩均可关闭。
 */

type Settings = {
  caption: boolean;
  minSize: number;
};

const CONTENT_SEL = ".bmx-blocks,.post-content,.entry-content,.article-content";

export default definePlugin<Settings>({
  setup({ settings, addFilter, HOOKS }) {
    addFilter<{ html: string[] }>(HOOKS.footerHtml, (payload) => {
      const cfg = JSON.stringify({
        cap: !!settings.caption,
        min: Math.max(0, Number(settings.minSize) || 0),
      });

      payload.html.push(`<style>
.oboe-lb{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.9);padding:4vh 4vw;box-sizing:border-box;cursor:zoom-out}
.oboe-lb.oboe-lb-on{display:flex}
/*
 * 尺寸由打开时的 JS 按图片固有比例算好内联写入（撑满可用区的较大一边），
 * max-* 仅作无 JS 兜底。object-fit:contain 保证任何比例都不变形。
 */
.oboe-lb img{max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,.5);border-radius:4px;cursor:zoom-out}
.oboe-lb-cap{position:absolute;left:0;right:0;bottom:2.5vh;text-align:center;color:rgba(255,255,255,.8);font:13px/1.6 var(--font,sans-serif);padding:0 4vw;box-sizing:border-box}
</style>
<script>(function(){var C=${cfg};
var overlay=document.createElement('div');overlay.className='oboe-lb';
var big=document.createElement('img');big.alt='';overlay.appendChild(big);
var cap=document.createElement('div');cap.className='oboe-lb-cap';overlay.appendChild(cap);
function close(){overlay.classList.remove('oboe-lb-on');overlay.dataset.open='';cap.textContent='';document.body.style.overflow='';
  big.style.width='';big.style.height='';}
/*
 * 等比放大到「撑满可用区的较大一边」：
 *   宽图 → 宽度顶满、高度按比例；高图 → 高度顶满、宽度按比例。
 * 小图同样被放大到边界（max-* 只能缩小、不能放大，所以必须显式算宽高）。
 */
function fit(){
  var nw=big.naturalWidth,nh=big.naturalHeight;
  if(!nw||!nh)return;
  var cs=getComputedStyle(overlay);
  var aw=overlay.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  var ah=overlay.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  if(aw<=0||ah<=0)return;
  var r=nw/nh,w=aw,h=w/r;
  if(h>ah){h=ah;w=h*r;}
  big.style.width=Math.round(w)+'px';big.style.height=Math.round(h)+'px';
}
big.addEventListener('load',function(){if(overlay.dataset.open)fit();});
window.addEventListener('resize',function(){if(overlay.dataset.open)fit();});
/*
 * 关闭：点遮罩 / 点图片 / 点图注 都关（图注也无交互，点哪儿都关最直观）。
 * 关键：必须在「捕获阶段」拦截并 stopPropagation，否则事件继续冒泡到下面
 * document 的打开处理器，会把刚移除的 oboe-lb-on 立刻加回来 → 表现为
 * 「点图片关不掉、只有点外围才关」。
 */
overlay.addEventListener('click',function(e){
  if(!overlay.classList.contains('oboe-lb-on'))return;
  e.stopPropagation();
  e.preventDefault();
  close();
},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&overlay.classList.contains('oboe-lb-on'))close();});
function mount(){if(!overlay.parentNode)document.body.appendChild(overlay);}
if(document.readyState!=='loading')mount();else document.addEventListener('DOMContentLoaded',mount);
document.addEventListener('click',function(e){
  var t=e.target;
  if(!(t instanceof HTMLImageElement))return;
  if(t.closest('.oboe-lb'))return;
  if(!t.closest('${CONTENT_SEL}'))return;
  if(C.min>0&&t.naturalWidth&&t.naturalWidth<C.min)return;
  e.preventDefault();
  big.style.width='';big.style.height='';
  big.src=t.currentSrc||t.src;
  if(C.cap){cap.textContent=t.alt||'';cap.style.display=t.alt?'':'none';}else{cap.style.display='none';}
  document.body.style.overflow='hidden';
  overlay.dataset.open='1';
  overlay.classList.add('oboe-lb-on');
  if(big.complete&&big.naturalWidth)fit();
});
})();</script>`);
      return payload;
    });
  },
});
