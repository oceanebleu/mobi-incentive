(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[737],{8386:function(e,t,r){Promise.resolve().then(r.bind(r,9011))},9011:function(e,t,r){"use strict";r.r(t),r.d(t,{default:function(){return c}});var n=r(7437),s=r(2265),a=r(6141),l=r(6780),o=r(3274),i=r(1976);function c(){let[e,t]=(0,s.useState)(""),[r,c]=(0,s.useState)(""),[u,d]=(0,s.useState)(!1),[m,x]=(0,s.useState)(null);async function f(t){var n,s;if(null==t||t.preventDefault(),u)return;x(null);let a=e.trim(),l=r.trim().toUpperCase();if(!a){x("사번을 입력하세요.");return}if(!l){x("개인 고유코드를 입력하세요.");return}d(!0);try{let e=await fetch("/api/pl/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({emp_id:a,code:l})}),t=await e.json().catch(()=>({}));if(!e.ok)throw Error(null!==(n=null==t?void 0:t.error)&&void 0!==n?n:"확인 실패");let r="/pl/projects?emp=".concat(encodeURIComponent(a),"&code=").concat(encodeURIComponent(l));window.location.assign(r)}catch(e){x(null!==(s=null==e?void 0:e.message)&&void 0!==s?s:"오류가 발생했습니다."),d(!1)}}return(0,n.jsx)("div",{className:"min-h-screen flex items-center justify-center bg-gray-50 p-6",children:(0,n.jsxs)("div",{className:"w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-7 shadow-sm",children:[(0,n.jsxs)("div",{className:"flex items-center gap-2 mb-1",children:[(0,n.jsx)(a.Z,{size:18,className:"text-blue-600"}),(0,n.jsx)("h1",{className:"text-base font-bold text-gray-900",children:"프로젝트 정보 입력"})]}),(0,n.jsxs)("p",{className:"text-xs text-gray-500 mb-6",children:["본인 사번과 개인 고유코드를 입력해 주세요.",(0,n.jsx)("br",{}),"고유코드를 모르실 경우 HRBP팀에 문의바랍니다."]}),(0,n.jsxs)("form",{onSubmit:f,className:"space-y-3",children:[(0,n.jsxs)("div",{children:[(0,n.jsx)("label",{className:"text-[11px] font-semibold text-gray-500 mb-1 block",children:"사번"}),(0,n.jsx)("input",{type:"text",inputMode:"numeric",autoFocus:!0,autoComplete:"off",value:e,onChange:e=>t(e.target.value),placeholder:"예: 12345",className:"w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"})]}),(0,n.jsxs)("div",{children:[(0,n.jsxs)("label",{className:"text-[11px] font-semibold text-gray-500 mb-1 block",children:["개인 고유코드 ",(0,n.jsx)("span",{className:"text-[10px] text-gray-400 font-normal",children:"(5자 \xb7 알파벳 3 + 숫자 2)"})]}),(0,n.jsx)("input",{type:"text",autoComplete:"off",maxLength:5,value:r,onChange:e=>c(e.target.value.toUpperCase()),placeholder:"예: ABC23",className:"w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 tracking-widest tabular-nums uppercase"})]}),m&&(0,n.jsxs)("div",{className:"flex items-start gap-1.5 text-xs text-red-700",children:[(0,n.jsx)(l.Z,{size:13,className:"mt-0.5 flex-shrink-0"}),(0,n.jsx)("span",{className:"break-all",children:m})]}),(0,n.jsx)("button",{type:"submit",disabled:u,className:"w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors",children:u?(0,n.jsx)(o.Z,{size:14,className:"animate-spin"}):(0,n.jsxs)(n.Fragment,{children:["내 프로젝트 보기 ",(0,n.jsx)(i.Z,{size:14})]})})]}),(0,n.jsx)("p",{className:"text-[10px] text-gray-400 mt-5 leading-relaxed",children:"모비데이즈 수주인센티브 운영위원회 \xb7 PL 작성 페이지"})]})})}},8030:function(e,t,r){"use strict";r.d(t,{Z:function(){return i}});var n=r(2265);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let s=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),a=function(){for(var e=arguments.length,t=Array(e),r=0;r<e;r++)t[r]=arguments[r];return t.filter((e,t,r)=>!!e&&r.indexOf(e)===t).join(" ")};/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var l={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let o=(0,n.forwardRef)((e,t)=>{let{color:r="currentColor",size:s=24,strokeWidth:o=2,absoluteStrokeWidth:i,className:c="",children:u,iconNode:d,...m}=e;return(0,n.createElement)("svg",{ref:t,...l,width:s,height:s,stroke:r,strokeWidth:i?24*Number(o)/Number(s):o,className:a("lucide",c),...m},[...d.map(e=>{let[t,r]=e;return(0,n.createElement)(t,r)}),...Array.isArray(u)?u:[u]])}),i=(e,t)=>{let r=(0,n.forwardRef)((r,l)=>{let{className:i,...c}=r;return(0,n.createElement)(o,{ref:l,iconNode:t,className:a("lucide-".concat(s(e)),i),...c})});return r.displayName="".concat(e),r}},1976:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("ArrowRight",[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"m12 5 7 7-7 7",key:"xquz4c"}]])},6780:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("CircleAlert",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]])},3274:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("LoaderCircle",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]])},6141:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("ShieldCheck",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]])}},function(e){e.O(0,[971,23,744],function(){return e(e.s=8386)}),_N_E=e.O()}]);