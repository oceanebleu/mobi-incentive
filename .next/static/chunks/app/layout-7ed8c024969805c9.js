(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[185],{9531:function(e,t,r){Promise.resolve().then(r.t.bind(r,8877,23)),Promise.resolve().then(r.bind(r,8370)),Promise.resolve().then(r.bind(r,7587)),Promise.resolve().then(r.bind(r,2045))},8370:function(e,t,r){"use strict";r.d(t,{default:function(){return k}});var n=r(7437),s=r(7138),a=r(6463),l=r(998),i=r(8030);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let o=(0,i.Z)("LayoutDashboard",[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1",key:"10lvy0"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1",key:"16une8"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1",key:"1hutg5"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1",key:"ldoo1y"}]]),c=(0,i.Z)("FolderKanban",[["path",{d:"M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z",key:"1fr9dc"}],["path",{d:"M8 10v4",key:"tgpxqk"}],["path",{d:"M12 10v2",key:"hh53o1"}],["path",{d:"M16 10v6",key:"1d6xys"}]]);var u=r(1240),d=r(5891),h=r(5737),x=r(6141),f=r(8184),y=r(3225),p=r(7592);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let m=(0,i.Z)("LogOut",[["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",key:"1uf3rs"}],["polyline",{points:"16 17 21 12 16 7",key:"1gabdz"}],["line",{x1:"21",x2:"9",y1:"12",y2:"12",key:"1uyos4"}]]);var v=r(4839),b=r(3335);let g=[{href:"/",label:"대시보드",icon:o,roles:["EXEC","ADMIN"]},{href:"/projects",label:"프로젝트 관리",icon:c,roles:["EXEC","ADMIN"]},{href:"/members",label:"개인별 지급 관리",icon:u.Z,roles:["EXEC","ADMIN"]},{href:"/archive",label:"제안 자료 아카이브",icon:d.Z,roles:["ADMIN"]},{href:"/payroll",label:"월별 인센티브 실지급액",icon:h.Z,roles:["ADMIN","PAYROLL"]},{href:"/users",label:"사용자관리",icon:x.Z,roles:["ADMIN"]},{href:"/admin/import",label:"데이터 Import",icon:f.Z,roles:["ADMIN"]}];function k(){var e,t,r,i;let o=(0,a.usePathname)(),{data:c}=(0,l.useSession)(),u=null==c?void 0:c.user,d=null==u?void 0:u.role,h=null!==(i=null!==(r=null==u?void 0:u.name)&&void 0!==r?r:null==u?void 0:null===(e=u.email)||void 0===e?void 0:e.split("@")[0])&&void 0!==i?i:"";return(0,n.jsxs)("aside",{className:"w-64 h-screen bg-white border-r border-gray-200 flex flex-col flex-shrink-0",children:[(0,n.jsxs)(s.default,{href:"/",className:"block px-5 py-5 border-b border-gray-100 hover:bg-gray-50/70 transition-colors",children:[(0,n.jsxs)("div",{className:"flex items-center gap-2 mb-1",children:[(0,n.jsx)("div",{className:"w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center",children:(0,n.jsx)(y.Z,{size:14,className:"text-white"})}),(0,n.jsx)("span",{className:"text-sm font-bold text-gray-900",children:"인센티브 관리"})]}),(0,n.jsx)("p",{className:"text-[11px] text-gray-400 pl-9",children:"수주인센티브 운영관리 시스템"})]}),(0,n.jsx)("nav",{className:"flex-1 px-3 py-4 space-y-0.5",children:g.filter(e=>!e.roles||!!d&&e.roles.includes(d)).map(e=>{let{href:t,label:r,icon:a}=e,l="/"===t?"/"===o:o===t||o.startsWith(t+"/");return(0,n.jsxs)(s.default,{href:t,className:(0,v.Z)("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",l?"bg-blue-50 text-blue-700":"text-gray-500 hover:bg-gray-50 hover:text-gray-800"),children:[(0,n.jsx)(a,{size:16,className:(0,v.Z)("flex-shrink-0",l?"text-blue-600":"text-gray-400 group-hover:text-gray-600")}),(0,n.jsx)("span",{className:"flex-1",children:r}),l&&(0,n.jsx)(p.Z,{size:13,className:"text-blue-400 opacity-70"})]},t)})}),(0,n.jsx)("div",{className:"px-4 py-4 border-t border-gray-100",children:u?(0,n.jsxs)("div",{children:[(0,n.jsxs)("div",{className:"flex items-center gap-2.5 mb-3",children:[u.image?(0,n.jsx)("img",{src:u.image,alt:h,className:"w-7 h-7 rounded-full"}):(0,n.jsx)("div",{className:"w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600",children:null===(t=h[0])||void 0===t?void 0:t.toUpperCase()}),(0,n.jsxs)("div",{className:"min-w-0",children:[(0,n.jsx)("p",{className:"text-xs font-semibold text-gray-800 truncate",children:h}),d&&(0,n.jsx)("span",{className:"text-[10px] text-blue-600 font-medium",children:b.Sx[d]})]})]}),(0,n.jsxs)("button",{onClick:()=>(0,l.signOut)({callbackUrl:"/login"}),className:"flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors",children:[(0,n.jsx)(m,{size:13}),"로그아웃"]})]}):(0,n.jsx)("p",{className:"text-[11px] text-gray-400",children:"모비데이즈 인센티브 운영위원회"})})]})}},7587:function(e,t,r){"use strict";function n(){return null}r.d(t,{default:function(){return n}})},2045:function(e,t,r){"use strict";r.d(t,{default:function(){return a}});var n=r(7437),s=r(998);function a(e){let{children:t}=e;return(0,n.jsx)(s.SessionProvider,{children:t})}},3335:function(e,t,r){"use strict";r.d(t,{Sx:function(){return n},qi:function(){return s}}),r(357);let n={EXEC:"경영진",ADMIN:"관리자",PAYROLL:"급여담당",NORMAL:"일반",NONE:"권한없음"};function s(e){return"ADMIN"===e||"EXEC"===e}},5891:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("Archive",[["rect",{width:"20",height:"5",x:"2",y:"3",rx:"1",key:"1wp1u1"}],["path",{d:"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",key:"1s80jp"}],["path",{d:"M10 12h4",key:"a56b0p"}]])},7592:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("ChevronRight",[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]])},6141:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("ShieldCheck",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]])},3225:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]])},8184:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("Upload",[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"17 8 12 3 7 8",key:"t8dd8p"}],["line",{x1:"12",x2:"12",y1:"3",y2:"15",key:"widbto"}]])},1240:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("Users",[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87",key:"kshegd"}],["path",{d:"M16 3.13a4 4 0 0 1 0 7.75",key:"1da9ce"}]])},5737:function(e,t,r){"use strict";r.d(t,{Z:function(){return n}});/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */let n=(0,r(8030).Z)("Wallet",[["path",{d:"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",key:"18etb6"}],["path",{d:"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",key:"xoc0q4"}]])},6463:function(e,t,r){"use strict";var n=r(1169);r.o(n,"useParams")&&r.d(t,{useParams:function(){return n.useParams}}),r.o(n,"usePathname")&&r.d(t,{usePathname:function(){return n.usePathname}}),r.o(n,"useRouter")&&r.d(t,{useRouter:function(){return n.useRouter}}),r.o(n,"useSearchParams")&&r.d(t,{useSearchParams:function(){return n.useSearchParams}})},8877:function(){}},function(e){e.O(0,[404,584,998,971,23,744],function(){return e(e.s=9531)}),_N_E=e.O()}]);