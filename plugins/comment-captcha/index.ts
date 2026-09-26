import { definePlugin } from "@/lib/plugins/api";
import { verifyCommentCaptcha } from "@/lib/services/comment-captcha";

/**
 * 评论图形验证插件：
 * - 服务端：comment.submission 守卫钩子，写入前校验一次性签名令牌；
 * - 前端：footer.html 注入零依赖原生脚本，自动把「算式图 + 输入框」挂进
 *   内置评论表单（受保护的 Comments.tsx 无需改动），并包装 fetch 在
 *   POST /api/comments 时附带答案；每次提交后自动换新题。
 */

type Settings = {
  /** true（默认）= 登录用户豁免；false = 全员必验。 */
  guestsOnly?: boolean;
};

type SubmissionPayload = {
  data: {
    captchaToken?: unknown;
    captchaAnswer?: unknown;
    [k: string]: unknown;
  };
  userId: number | null;
  ip: string | null;
  reject?: string;
};

/** 注入脚本：内部不得出现模板字符串/反引号，整体由 TS 模板包裹。 */
function clientScript(guestsOnly: boolean): string {
  const cfg = JSON.stringify({ g: guestsOnly });
  return `<style>
.ccap-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 1.25rem 0}
.ccap-img{width:104px;height:40px;border-radius:8px;border:1px solid rgba(127,127,127,.35);cursor:pointer;display:block;background:#fff;user-select:none}
.ccap-ans{width:132px;height:40px;padding:0 12px;border-radius:8px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:inherit;font-size:14px;outline:none}
.ccap-ans:focus{border-color:var(--primary-color,#5b8cff)}
.ccap-msg{color:#e5484d;font-size:12.5px}
</style>
<script>(function(){
if(window.__ccap)return;window.__ccap=1;
var C=${cfg};
var cur={token:"",ans:null,msg:null,skip:false};
function setMsg(t){if(cur.msg)cur.msg.textContent=t||"";}
function refresh(){
  fetch("/api/comment-captcha",{cache:"no-store"}).then(function(r){return r.json();}).then(function(d){
    if(!d||!d.token)return;
    cur.token=d.token;
    var img=document.querySelector(".ccap-img");
    if(img)img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(d.svg);
    if(cur.ans)cur.ans.value="";
    setMsg("");
  }).catch(function(){});
}
function isLoggedIn(){
  return fetch("/api/auth/me",{cache:"no-store"})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){return !!(d&&d.user);})
    .catch(function(){return false;});
}
function mount(form){
  var row=document.createElement("div");row.className="ccap-row";
  var img=document.createElement("img");
  img.className="ccap-img";img.alt="验证码";img.title="看不清？点击更换";
  var ans=document.createElement("input");
  ans.className="ccap-ans";ans.type="text";ans.maxLength=6;
  ans.setAttribute("inputmode","numeric");ans.autocomplete="off";
  ans.placeholder="验证码 *";
  var msg=document.createElement("span");msg.className="ccap-msg";
  row.appendChild(img);row.appendChild(ans);row.appendChild(msg);
  var actions=form.querySelector(".form-actions");
  if(actions)form.insertBefore(row,actions);else form.appendChild(row);
  cur.ans=ans;cur.msg=msg;
  img.addEventListener("click",refresh);
  ans.addEventListener("input",function(){setMsg("");});
  // 捕获阶段拦截：答案为空时阻断 React 在根容器上的 submit 监听。
  form.addEventListener("submit",function(e){
    if(!ans.value.trim()){
      e.preventDefault();e.stopPropagation();
      setMsg("请输入图中算式的结果");ans.focus();
    }
  },true);
  refresh();
}
var pending=false;
function tick(){
  if(pending||cur.skip)return;
  var form=document.querySelector("form.comment-form");
  if(!form||form.querySelector(".ccap-row"))return;
  pending=true;
  var gate=C.g?isLoggedIn():Promise.resolve(false);
  gate.then(function(loggedIn){
    pending=false;
    var f=document.querySelector("form.comment-form");
    if(!f||f.querySelector(".ccap-row"))return;
    if(loggedIn){cur.skip=true;return;}
    mount(f);
  });
}
// 包装 fetch：向评论 POST 注入令牌；无论成败都换一道新题（令牌一次性）。
var ofetch=window.fetch;
window.fetch=function(input,init){
  var url=typeof input==="string"?input:((input&&input.url)||"");
  var method=((init&&init.method)||(typeof input!=="string"&&input&&input.method)||"GET");
  if(String(method).toUpperCase()==="POST"&&/\\/api\\/comments(?:\\?|$)/.test(url)){
    if(init&&typeof init.body==="string"){
      try{
        var b=JSON.parse(init.body);
        b.captchaToken=cur.token||"";
        b.captchaAnswer=cur.ans?cur.ans.value.trim():"";
        init=Object.assign({},init,{body:JSON.stringify(b)});
      }catch(e){}
    }
    return ofetch.call(this,input,init).then(function(res){refresh();return res;},function(err){refresh();throw err;});
  }
  return ofetch.apply(this,arguments);
};
// 轮询兼容评论区延迟挂载与客户端页面切换（根布局脚本不重放）。
setInterval(tick,800);tick();
})();</script>`;
}

export default definePlugin<Settings>({
  setup({ settings, addFilter, HOOKS }) {
    addFilter<SubmissionPayload>(HOOKS.commentSubmission, async (payload) => {
      if (payload.reject) return payload;
      // 默认仅卡游客；显式关闭开关后全员必验。
      const guestsOnly = settings.guestsOnly !== false;
      if (guestsOnly && payload.userId != null) return payload;

      const token = typeof payload.data.captchaToken === "string" ? payload.data.captchaToken : "";
      const answer = typeof payload.data.captchaAnswer === "string" ? payload.data.captchaAnswer : "";
      if (!verifyCommentCaptcha(token, answer)) {
        payload.reject = "请正确完成验证码";
      }
      return payload;
    });

    addFilter<{ html: string[] }>(HOOKS.footerHtml, (payload) => {
      payload.html.push(clientScript(settings.guestsOnly !== false));
      return payload;
    });
  },
});
