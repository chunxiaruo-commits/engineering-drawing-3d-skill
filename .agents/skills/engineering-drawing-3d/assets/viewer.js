const viewport = document.querySelector('#viewport');
const stage = document.querySelector('#stage');
const message = document.querySelector('#model-status');
const viewButtons = [...document.querySelectorAll('[data-view]')];
const viewTitle = document.querySelector('#view-title');
const panButton = document.querySelector('#pan');
const axis = document.querySelector('#axis');
const presets = {
  iso: [-0.65, 0.55, '轴测'],
  front: [0, 0, '主视'],
  top: [0, Math.PI / 2, '俯视'],
  left: [-Math.PI / 2, 0, '左视'],
};
const state = { yaw: -.65, pitch: .55, zoom: 1, x: 0, y: 0, view: 'iso', pan: false };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
let activeModel = null;
let modelKey = null;
let pendingFrame = false;

function frame() {
  const sine = Math.sin(state.yaw);
  const cosine = Math.cos(state.yaw);
  const rise = Math.sin(state.pitch);
  const run = Math.cos(state.pitch);
  return {
    right: [cosine, -sine, 0],
    up: [-sine * rise, -cosine * rise, run],
    toward: [sine * run, cosine * run, rise],
  };
}

const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const lightA = [-.43,.37,.82];
const lightB = [.63,.34,.35];

function glRenderer() {
  const gl = viewport.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
    return result;
  }
  const program = gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER, '#version 300 es\n' + [
    'precision highp float;',
    'layout(location=0) in vec3 point;',
    'layout(location=1) in vec3 normal;',
    'layout(location=2) in float cut;',
    'uniform vec3 right, up, toward;',
    'uniform vec2 scale, pan;',
    'out vec3 surface, world;',
    'out float section;',
    'void main(){',
    '  world=point*1.0922333;',
    '  surface=normal;',
    '  section=cut*1.0922333;',
    '  gl_Position=vec4(vec2(dot(world,right),dot(world,up))*scale+pan,-dot(world,toward)*.86,1.);',
    '}',
  ].join('\n')));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER, '#version 300 es\n' + [
    'precision highp float;',
    'in vec3 surface, world;',
    'in float section;',
    'uniform vec3 toward;',
    'out vec4 color;',
    'void main(){',
    '  vec3 n=normalize(surface);',
    '  float key=max(dot(n,normalize(vec3(-.43,.37,.82))),0.);',
    '  float bounce=max(dot(n,normalize(vec3(.63,.34,.35))),0.);',
    '  float rim=pow(max(0.,1.-abs(dot(n,toward))),2.);',
    '  vec3 base=mix(vec3(.27,.70,.60),vec3(.65,.93,.80),smoothstep(-.6,.7,world.z));',
    '  vec3 metal=base*(.48+.61*key+.25*bounce)+vec3(.06,.10,.10)*rim;',
    '  float hatch=abs(fract((world.z+world.x+world.y)*35.)-.5);',
    '  vec3 cut=mix(vec3(.96,.71,.35),vec3(.76,.47,.18),smoothstep(.36,.47,hatch)*.57);',
    '  color=vec4(mix(metal,cut,section),1.);',
    '}',
  ].join('\n')));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  const uniform = Object.fromEntries(['right','up','toward','scale','pan'].map(key => [key,gl.getUniformLocation(program,key)]));
  const vbo = gl.createBuffer(), ibo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,vbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);
  for (const [location, count, offset] of [[0,3,0],[1,3,6],[2,1,12]]) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location,count,gl.SHORT,true,14,offset);
  }
  return {
    type: 'WebGL',
    load(model) {
      gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indices, gl.STATIC_DRAW);
    },
    draw(model, basis, w, h) {
      gl.viewport(0,0,w,h);
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      if (!model) return;
      const size = Math.min(w,h)*.89*state.zoom;
      gl.uniform3fv(uniform.right,basis.right);
      gl.uniform3fv(uniform.up,basis.up);
      gl.uniform3fv(uniform.toward,basis.toward);
      gl.uniform2f(uniform.scale,size/w,size/h);
      gl.uniform2f(uniform.pan,2*state.x,-2*state.y);
      gl.drawElements(gl.TRIANGLES,model.indices.length,model.indices.BYTES_PER_ELEMENT === 2 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,0);
    },
  };
}

function softwareRenderer(canvas) {
  const context = canvas.getContext('2d');
  let points;
  return {
    type: 'Canvas',
    load(model) { points = new Float32Array(model.vertices.length / 7 * 3); },
    draw(model,basis,w,h) {
      if (!model) {
        context.clearRect(0,0,w,h);
        return;
      }
      const { vertices, indices } = model;
      const pixels = context.createImageData(w,h);
      const rgba = pixels.data;
      const depth = new Float32Array(w*h).fill(-Infinity);
      const size = Math.min(w,h)*.445*state.zoom/30000;
      const x0 = w*(.5+state.x);
      const y0 = h*(.5+state.y);
      for (let i=0,j=0; i<vertices.length; i+=7,j+=3) {
        const x = vertices[i], y = vertices[i+1], z = vertices[i+2];
        points[j] = x0 + (x*basis.right[0]+y*basis.right[1]+z*basis.right[2])*size;
        points[j+1] = y0 - (x*basis.up[0]+y*basis.up[1]+z*basis.up[2])*size;
        points[j+2] = x*basis.toward[0]+y*basis.toward[1]+z*basis.toward[2];
      }
      for (let i=0; i<indices.length; i+=3) {
        const ia=indices[i], ib=indices[i+1], ic=indices[i+2];
        const a=ia*3, b=ib*3, c=ic*3;
        const x=points[a], y=points[a+1], bx=points[b]-x, by=points[b+1]-y;
        const cx=points[c]-x, cy=points[c+1]-y;
        const area=bx*cy-by*cx;
        if (Math.abs(area)<.0001) continue;
        const startX=Math.max(0,Math.ceil(x+Math.min(0,bx,cx)));
        const endX=Math.min(w-1,Math.floor(x+Math.max(0,bx,cx)));
        const startY=Math.max(0,Math.ceil(y+Math.min(0,by,cy)));
        const endY=Math.min(h-1,Math.floor(y+Math.max(0,by,cy)));
        const j=ia*7, k=ib*7, l=ic*7;
        const normal=[vertices[j+3]+vertices[k+3]+vertices[l+3],
                      vertices[j+4]+vertices[k+4]+vertices[l+4],vertices[j+5]+vertices[k+5]+vertices[l+5]];
        const length=Math.hypot(...normal) || 1;
        const shade=.53+.58*Math.max(0,dot(normal,lightA)/length)+.27*Math.max(0,dot(normal,lightB)/length);
        const cut=vertices[j+6] > 0;
        const high=(vertices[j+2]+vertices[k+2]+vertices[l+2])/90000+.5;
        const red=(77+64*high)*shade, green=(171+43*high)*shade, blue=(149+41*high)*shade;
        for (let py=startY; py<=endY; py++) {
          for (let px=startX; px<=endX; px++) {
            const dx=px-x, dy=py-y;
            const u=(dx*cy-dy*cx)/area, v=(bx*dy-by*dx)/area;
            if (u<0 || v<0 || u+v>1) continue;
            const z=points[a+2]+u*(points[b+2]-points[a+2])+v*(points[c+2]-points[a+2]);
            const p=py*w+px;
            if (z<depth[p]) continue;
            depth[p]=z;
            const index=p*4;
            rgba[index]=cut?237:red;
            rgba[index+1]=cut?173:green;
            rgba[index+2]=cut?91:blue;
            rgba[index+3]=255;
          }
        }
      }
      context.putImageData(pixels,0,0);
    },
  };
}

let canvas = viewport;
let renderer;
function useSoftware() {
  const fallback = document.querySelector('#software-canvas');
  viewport.classList.add('event-layer');
  fallback.hidden = false;
  canvas = fallback;
  renderer = softwareRenderer(fallback);
  if (activeModel) renderer.load(activeModel);
  schedule();
}
try { renderer = glRenderer(); } catch (error) { console.warn(error); }
if (!renderer) useSoftware();
viewport.addEventListener('webglcontextlost',event => { event.preventDefault(); useSoftware(); });

function drawAxis(basis) {
  const labels = ['X','Y','Z'];
  const colors = ['#f6ad83','#7fe0c4','#9ec1fc'];
  axis.innerHTML = labels.map((label,index) => {
    const dx=basis.right[index], dy=-basis.up[index];
    if (Math.hypot(dx,dy)<.1) return '';
    const x=36+dx*21, y=36+dy*21;
    return '<line x1="36" y1="36" x2="'+x+'" y2="'+y+'" stroke="'+colors[index]+'" stroke-width="1.6"/>'
      + '<circle cx="'+x+'" cy="'+y+'" r="2.4" fill="'+colors[index]+'"/>'
      + '<text x="'+(36+dx*29)+'" y="'+(39+dy*29)+'" text-anchor="middle" fill="'+colors[index]+'">'+label+'</text>';
  }).join('')+'<circle cx="36" cy="36" r="2" fill="#e0e9e7"/>';
}

function redraw() {
  pendingFrame=false;
  const rect=stage.getBoundingClientRect();
  const ratio=renderer.type === 'Canvas' ? Math.min(1,490/Math.max(rect.width,rect.height)) : Math.min(devicePixelRatio,2);
  const w=Math.max(1,Math.round(rect.width*ratio)), h=Math.max(1,Math.round(rect.height*ratio));
  if (canvas.width!==w || canvas.height!==h) { canvas.width=w; canvas.height=h; }
  const basis=frame();
  renderer.draw(activeModel,basis,w,h);
  drawAxis(basis);
  viewport.dataset.ready=String(Boolean(activeModel));
}

function schedule() {
  if (pendingFrame) return;
  pendingFrame=true;
  requestAnimationFrame(redraw);
}

const cache = new Map();
async function unpack(key) {
  if (!cache.has(key)) {
    const encoded=atob(meshData[key]);
    const bytes=Uint8Array.from(encoded,character=>character.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const buffer=await new Response(stream).arrayBuffer();
    const [count,indexCount,stride]=new Uint32Array(buffer,0,3);
    const vertices=new Int16Array(buffer,12,count*7);
    const offset=12+count*14;
    const indexData = stride===2 ? buffer : buffer.slice(offset);
    const indices=stride===2 ? new Uint16Array(indexData,offset,indexCount) : new Uint32Array(indexData,0,indexCount);
    cache.set(key,{vertices,indices});
  }
  return cache.get(key);
}

function setView(name, reset = false) {
  const [yaw,pitch,label]=presets[name];
  state.yaw=yaw;
  state.pitch=pitch;
  state.view=name;
  if (reset) Object.assign(state,{zoom:1,x:0,y:0});
  viewTitle.textContent=label+'视角';
  for (const button of viewButtons) button.setAttribute('aria-pressed',String(button.dataset.view===name));
  schedule();
}

async function showModel(key) {
  modelKey=key;
  activeModel=null;
  viewport.dataset.ready='false';
  message.textContent='正在载入模型…';
  message.hidden=false;
  setView('iso',true);
  try {
    const result=await unpack(key);
    if (modelKey!==key) return;
    renderer.load(result);
    activeModel=result;
    message.hidden=true;
    schedule();
  } catch (error) {
    if (modelKey!==key) return;
    console.error(error);
    message.textContent='模型载入失败。请使用近期版本的 Edge、Chrome 或 Firefox 打开文件。';
  }
}

function rotate(dx,dy) {
  state.yaw+=dx*.009;
  state.pitch=clamp(state.pitch-dy*.009,-Math.PI*.499,Math.PI*.499);
  state.view='';
  viewTitle.textContent='自由视角';
  for (const button of viewButtons) button.setAttribute('aria-pressed','false');
  schedule();
}

function pan(dx,dy) {
  state.x+=dx/stage.clientWidth;
  state.y+=dy/stage.clientHeight;
  schedule();
}

function zoom(multiplier) {
  state.zoom=clamp(state.zoom*multiplier,.32,4.6);
  schedule();
}

const pointers = new Map();
viewport.addEventListener('pointerdown',event => {
  if (event.button>2) return;
  viewport.focus({preventScroll:true});
  viewport.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,button:event.button});
  viewport.classList.add('dragging');
});
viewport.addEventListener('pointermove',event => {
  const old=pointers.get(event.pointerId);
  if (!old) return;
  const dx=event.clientX-old.x, dy=event.clientY-old.y;
  const other=[...pointers.entries()].find(([id])=>id!==event.pointerId)?.[1];
  if (other) {
    const previous=Math.hypot(old.x-other.x,old.y-other.y);
    const current=Math.hypot(event.clientX-other.x,event.clientY-other.y);
    if (previous>1) zoom(current/previous);
    pan(dx/2,dy/2);
  } else if (state.pan || event.shiftKey || old.button!==0) {
    pan(dx,dy);
  } else {
    rotate(dx,dy);
  }
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,button:old.button});
});
for (const eventName of ['pointerup','pointercancel','lostpointercapture']) {
  viewport.addEventListener(eventName,event => {
    pointers.delete(event.pointerId);
    if (!pointers.size) viewport.classList.remove('dragging');
  });
}
viewport.addEventListener('contextmenu',event=>event.preventDefault());
viewport.addEventListener('wheel',event => {
  if (event.ctrlKey) return;
  event.preventDefault();
  const pixels=event.deltaY*(event.deltaMode===1?18:event.deltaMode===2?260:1);
  zoom(Math.exp(clamp(-pixels*.0018,-.4,.4)));
},{passive:false});

viewport.addEventListener('keydown',event => {
  const directions={ArrowLeft:[-17,0],ArrowRight:[17,0],ArrowUp:[0,-17],ArrowDown:[0,17]};
  const direction=directions[event.key];
  if (direction) {
    event.preventDefault();
    if (event.shiftKey || state.pan) pan(...direction); else rotate(...direction);
  } else if (['+','=','-','0'].includes(event.key)) {
    event.preventDefault();
    if (event.key==='0') setView('iso',true);
    else zoom(event.key==='-' ? 1/1.2 : 1.2);
  }
});
panButton.addEventListener('click',() => {
  state.pan=!state.pan;
  panButton.setAttribute('aria-pressed',String(state.pan));
  viewport.classList.toggle('panning',state.pan);
});
for (const button of viewButtons) button.addEventListener('click',()=>setView(button.dataset.view,true));
for (const button of document.querySelectorAll('[data-zoom]')) button.addEventListener('click',()=>zoom(Number(button.dataset.zoom)));
for (const button of document.querySelectorAll('[data-pan]')) button.addEventListener('click',()=>pan(...button.dataset.pan.split(',').map(Number)));
document.querySelector('#reset').addEventListener('click',()=>setView('iso',true));
new ResizeObserver(schedule).observe(stage);
