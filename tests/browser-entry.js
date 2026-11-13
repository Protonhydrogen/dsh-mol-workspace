import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {Workspace} from '../src/viewer/workspace.js';
import {styles} from '../src/viewer/styles.js';
import {REMOTE_METHODS} from '../src/shared/remote-manifest.js';
const adapter=Object.fromEntries(Object.keys(REMOTE_METHODS).map(method=>[method,async(...args)=>{const response=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});const r=await response.json();if(!r.ok)throw Object.assign(new Error(r.error.message),r.error);return r.value;}]));
const tag=document.createElement('style');tag.textContent=styles;document.head.appendChild(tag);
createRoot(document.getElementById('app')).render(React.createElement(Workspace,{sessionId:'audit-v4',adapter}));

