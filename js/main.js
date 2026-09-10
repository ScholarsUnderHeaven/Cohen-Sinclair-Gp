/**
 * Co-Sinmorphism Design System - Main JavaScript
 * Handles sky shader, navigation, theme switching, and eclipse animation
 */

(function(){
'use strict';

/* Configuration */
var MRAD = 0.175, ZOOM = 4.0;
var mradEff = MRAD, sunkEff = 1;

// Allow URL parameters to override defaults
try{
  var q = new URLSearchParams(location.search);
  if(q.has('mrad')) MRAD = parseFloat(q.get('mrad')) || MRAD;
  if(q.has('zoom')) ZOOM = parseFloat(q.get('zoom')) || ZOOM;
}catch(e){}

var FLY_IN = 3800, FLY_OUT = 3800;

/* DOM Elements */
var cv = document.getElementById('sky');
var barL = document.getElementById('barL');
var barR = document.getElementById('barR');
var bevSvgL = barL.querySelector('.bevel'), bevSvgR = barR.querySelector('.bevel');
var bevPathL = bevSvgL.querySelector('.edge'), bevPathR = bevSvgR.querySelector('.edge');
var bevArcL = bevSvgL.querySelector('.arc'), bevArcR = bevSvgR.querySelector('.arc');

/* WebGL Setup */
var gl = cv.getContext('webgl', {antialias:true, alpha:false, depth:false, stencil:false})
      || cv.getContext('experimental-webgl');

function fatal(html){
  var n = document.getElementById('fatal');
  n.innerHTML = html; n.style.display = 'flex';
}

if(!gl){
  fatal('<div><b>WebGL is blocked here.</b><br>Open this page in Chrome, Edge, Safari or Firefox.</div>');
  return;
}

var ctxLost = false;
cv.addEventListener('webglcontextlost', function(e){
  e.preventDefault(); ctxLost = true;
  fatal('<div><b>Graphics context was lost.</b><br>Click anywhere to reload.</div>');
});
cv.addEventListener('webglcontextrestored', function(){ window.location.reload(); });
window.addEventListener('click', function(){ if(ctxLost) window.location.reload(); });

/* Shader Source */
var FRAG = [
  'precision highp float;',
  'uniform vec3 iResolution;',
  'uniform float uMrad;',
  'uniform float uZoom;',
  'uniform vec2 uSunPos;',
  'uniform vec2 uMoonPos;',
  'uniform float uMoonFade;',
  'uniform float uSunK;',
  '#define USE_BLACKBODY',
  '#define bias 25. / iResolution.x / uSunK',
  'vec2 bend(vec2 p, float a) {',
  '    return vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a));',
  '}',
  'float smax(float a, float b, float k)',
  '{',
  '    float x = exp(k * a);',
  '    float y = exp(k * b);',
  '    return (a * x + b * y) / (x + y);',
  '}',
  'vec3 blackbody(float i) {',
  '    float T = 1400.0 + 1400.0 * i;',
  '    vec3 L = vec3(7.4, 5.6, 4.4);',
  '    L = pow(L, vec3(5.0)) * (exp(1.43876719683e5 / (T * L)) - 1.0);',
  '    return 1.0 - exp(-50e7 / L);',
  '}',
  'float sun( in vec2 uv ) {',
  '    float d = 1.0 / length(uv);',
  '    float i = 5.0;',
  '#ifndef USE_BLACKBODY',
  '    d *= 0.8;',
  '    i = 15.0;',
  '#endif',
  '    d = pow(d, i);',
  '    return d;',
  '}',
  'vec2 moonPos() { return uMoonPos; }',
  'float moon( in vec2 uv ) {',
  '    float d = length(uv - moonPos()) - uMrad;',
  '    d = smoothstep(uMrad, uMrad+bias, d);',
  '    return d;',
  '}',
  'float hash21(vec2 p){ p = fract(p*vec2(234.34,435.345)); p += dot(p,p+34.23); return fract(p.x*p.y); }',
  'vec3 starLayer(vec2 uv, float scale, float thresh){',
  '    vec2 g = floor(uv*scale);',
  '    vec2 f = fract(uv*scale);',
  '    float h = hash21(g);',
  '    if(h < thresh) return vec3(0.0);',
  '    vec2 sp = vec2(hash21(g+0.13), hash21(g+0.71));',
  '    float d = length(f - sp);',
  '    float tw = 0.85;',
  '    float m = smoothstep(0.10, 0.0, d) * tw;',
  '    float bright = smoothstep(thresh, 1.0, h);',
  '    return vec3(0.75,0.82,1.0) * m * bright;',
  '}',
  'float discCover(float d, float r) {',
  '    if(d >= 2.0*r) return 0.0;',
  '    if(d <= 0.0) return 1.0;',
  '    float a = acos(clamp(d/(2.0*r), 0.0, 1.0));',
  '    float c = (2.0*r*r*a - 0.5*d*sqrt(max(0.0, 4.0*r*r - d*d))) / (3.14159265*r*r);',
  '    return clamp(c, 0.0, 1.0);',
  '}',
  'vec3 atmSky(vec2 s, float sunI, float m) {',
  '    vec3 vd = normalize(vec3(s.x, s.y + 0.55, 1.4));',
  '    vec3 sd = normalize(vec3(uSunPos.x, uSunPos.y + 0.55, 1.4));',
  '    float cosA = dot(vd, sd);',
  '    float elev = vd.y;',
  '    float tau = 0.22 + 0.78*pow(1.0 - max(elev, 0.0), 3.0);',
  '    vec3 sig = vec3(0.10, 0.25, 0.70);',
  '    vec3 inscat = vec3(1.0) - exp(-tau*3.0*sig);',
  '    float pr = 0.65 + 0.35*cosA*cosA;',
  '    float red = (1.0 - sunI)*(1.0 - sunI);',
  '    vec3 sunTint = vec3(1.0, 1.0 - 0.68*red, 1.0 - 0.90*red);',
  '    float t = clamp((elev + 0.30)/1.10, 0.0, 1.0);',
  '    vec3 amb = vec3(0.85, 1.70, 3.40) * (0.45 + 0.55*pow(1.0 - t, 1.2));',
  '    vec3 col = (inscat * pr * 1.4 + amb) * sunTint * sunI;',
  '    float ca = max(cosA, 0.0);',
  '    col += vec3(1.0, 0.82, 0.60) * (pow(ca, 600.0)*2.0 + pow(ca, 32.0)*0.35 + pow(ca, 8.0)*0.12) * sunTint * sunI * m;',
  '    col += mix(vec3(0.00486, 0.01143, 0.02167), vec3(0.00077, 0.00153, 0.00422), t) * (1.0 - sunI);',
  '    float ub = 1.0 - smoothstep(-0.8, 0.1, s.y);',
  '    vec3 uiBG = mix(vec3(1.08192, 0.96843, 0.75402), vec3(0.02167, 0.02350, 0.02918), 1.0 - sunI);',
  '    col = mix(col, uiBG, ub);',
  '    return col;',
  '}',
  'void mainImage( out vec4 fragColor, in vec2 fragCoord )',
  '{',
  '    vec2 s = (2. * fragCoord.xy - iResolution.xy) / iResolution.y;',
  '    vec2 uv = (s - uSunPos) * uZoom;',
  '    float _sun = sun(uv * (2.0*uSunK));',
  '    float _moon = 1.0;',
  '    float sunI = 1.0;',
  '    if(uMoonFade > 0.001) {',
  '        _moon = mix(1.0, moon(uv), uMoonFade);',
  '        sunI = 1.0 - discCover(length(moonPos()), uMrad) * uMoonFade;',
  '    }',
  '    vec3 sunCol = _sun *',
  '#ifdef USE_BLACKBODY',
  '        blackbody(smoothstep(0.1, 15., _sun));',
  '#else',
  '        vec3(0.886,0.329,0.094);',
  '#endif',
  '    vec3 sky = atmSky(s, sunI, _moon);',
  '    vec3 col = sky + sunCol * _moon;',
  '    col = (col*(2.51*col+0.03))/(col*(2.43*col+0.59)+0.14);',
  '    col = pow(col, vec3(1.0 / 2.2));',
  '    fragColor = vec4(col, 1.0);',
  '}',
  'void main(){mainImage(gl_FragColor,gl_FragCoord.xy);gl_FragColor.rgb+=(hash21(gl_FragCoord.xy)-.5)*(1.5/255.);}'
].join('\n');

var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

function fail(msg){
  var el = document.getElementById('errbox');
  el.style.display = 'block';
  el.textContent = String(msg || '(no log)').slice(0, 600);
}

function sh(type, src){
  var s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    fail((type === gl.VERTEX_SHADER ? 'VERTEX: ' : 'FRAGMENT: ') + gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
if(!vs || !fs) return;

var prog = gl.createProgram();
gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){ fail('LINK: ' + gl.getProgramInfoLog(prog)); return; }
gl.useProgram(prog);

var buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
var loc = gl.getAttribLocation(prog, 'p');
gl.enableVertexAttribArray(loc);
gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

var uRes = gl.getUniformLocation(prog, 'iResolution');
var uMrad = gl.getUniformLocation(prog, 'uMrad');
var uZoom = gl.getUniformLocation(prog, 'uZoom');
var uSunPos = gl.getUniformLocation(prog, 'uSunPos');
var uSunk = gl.getUniformLocation(prog, 'uSunK');
var uMoonPos = gl.getUniformLocation(prog, 'uMoonPos');
var uMoonFade = gl.getUniformLocation(prog, 'uMoonFade');

if(!uRes || !uMrad || !uZoom || !uSunPos || !uMoonPos || !uMoonFade || !uSunk){ 
  fail('boot: missing uniform location'); 
  return; 
}

if(gl.isContextLost()){ 
  cv.dispatchEvent(new Event('webglcontextlost')); 
  return; 
}

gl.disable(gl.DEPTH_TEST);
gl.disable(gl.BLEND);

/* Eclipse State */
var moon = [0, 0];
var fade = 0;
var anim = null;
var eclipsed = false;
var sunPx = [0, 0];
var clickR = 100;

function easeIn(k){ return k*k; }
function easeOut(k){ return 1 - Math.pow(1-k, 3); }

/* Moon path calculations - FIXED: sun center is now exactly at horizontal midpoint */
function pathR(aspect){ return Math.max(3, (aspect + 0.7) / 0.8); }

function pathEnd(){
  var a = window.innerWidth/window.innerHeight;
  return [a + 0.6, pathR(a)];
}

function pathOrbit(xs, sunY, r){
  var ys = sunY - (r - Math.sqrt(Math.max(r*r - xs*xs, 0)));
  return [xs*ZOOM, (ys - sunY)*ZOOM];
}

function discCoverJS(d, r){
  if(d >= 2*r) return 0;
  if(d <= 0) return 1;
  var a = Math.acos(Math.min(1, Math.max(0, d/(2*r))));
  var c = (2*r*r*a - 0.5*d*Math.sqrt(Math.max(0, 4*r*r - d*d))) / (Math.PI*r*r);
  return Math.min(1, Math.max(0, c));
}

function toggle(){
  eclipsed = !eclipsed;
  var pe = pathEnd();
  anim = {x0: eclipsed ? pe[0] : 0, x1: eclipsed ? 0 : -pe[0], xe: pe[0], r: pe[1], sunY: sunPos[1],
          t0: performance.now(), dur: eclipsed ? FLY_IN : FLY_OUT, dir: eclipsed ? 'in' : 'out'};
}

function overSun(cx, cy){
  var dx = cx - sunPx[0], dy = cy - sunPx[1];
  return dx*dx + dy*dy < clickR*clickR;
}

cv.addEventListener('click', function(e){ if(overSun(e.clientX, e.clientY)) toggle(); });
cv.addEventListener('mousemove', function(e){ cv.style.cursor = overSun(e.clientX, e.clientY) ? 'pointer' : 'default'; });

/* Bar Path Functions - FIXED: sun center is exactly at horizontal midpoint */
function barPath(W, H, cx, cy, nr, right){
  function f(n){ return Math.round(n*100)/100; }
  var br = H/2;
  var dxT = Math.sqrt(Math.max(nr*nr - cy*cy, 0));
  var dxB = Math.sqrt(Math.max(nr*nr - (H-cy)*(H-cy), 0));
  if(!right){
    if(dxT > 0.5 && dxB > 0.5 && cx - dxT < W - 1 && cx - dxB < W - 1)
      return 'M'+f(br)+',0 H'+f(cx-dxT)+' A'+f(nr)+','+f(nr)+' 0 0 0 '+f(cx-dxB)+','+f(H)+' H'+f(br)+' A'+f(br)+','+f(br)+' 0 0 1 '+f(br)+',0 Z';
    var dy = Math.sqrt(Math.max(nr*nr - (cx-W)*(cx-W), 0));
    if(!(dy > 0.5))
      return 'M'+f(br)+',0 H'+f(W-br)+' A'+f(br)+','+f(br)+' 0 0 1 '+f(W-br)+','+f(H)+' H'+f(br)+' A'+f(br)+','+f(br)+' 0 0 1 '+f(br)+',0 Z';
    return 'M'+f(br)+',0 H'+f(W)+' V'+f(cy-dy)+' A'+f(nr)+','+f(nr)+' 0 0 0 '+f(W)+','+f(cy+dy)+' V'+f(H)+' H'+f(br)+' A'+f(br)+','+f(br)+' 0 0 1 '+f(br)+',0 Z';
  }
  if(dxT > 0.5 && dxB > 0.5 && cx + dxT > 1 && cx + dxB > 1)
    return 'M'+f(W-br)+',0 A'+f(br)+','+f(br)+' 0 0 1 '+f(W-br)+','+f(H)+' L'+f(cx+dxB)+','+f(H)+' A'+f(nr)+','+f(nr)+' 0 0 0 '+f(cx+dxT)+',0 Z';
  var dy2 = Math.sqrt(Math.max(nr*nr - cx*cx, 0));
  if(!(dy2 > 0.5))
    return 'M'+f(br)+',0 H'+f(W-br)+' A'+f(br)+','+f(br)+' 0 0 1 '+f(W-br)+','+f(H)+' H'+f(br)+' A'+f(br)+','+f(br)+' 0 0 1 '+f(br)+',0 Z';
  return 'M'+f(W-br)+',0 A'+f(br)+','+f(br)+' 0 0 1 '+f(W-br)+','+f(H)+' L0,'+f(H)+' L0,'+f(cy+dy2)+' A'+f(nr)+','+f(nr)+' 0 0 0 0,'+f(cy-dy2)+' L0,0 Z';
}

function barArc(W, H, cx, cy, nr, right){
  function f(n){ return Math.round(n*100)/100; }
  var dxT = Math.sqrt(Math.max(nr*nr - cy*cy, 0));
  var dxB = Math.sqrt(Math.max(nr*nr - (H-cy)*(H-cy), 0));
  if(!right){
    if(dxT > 0.5 && dxB > 0.5 && cx - dxT < W - 1 && cx - dxB < W - 1)
      return 'M'+f(cx-dxT)+',0 A'+f(nr)+','+f(nr)+' 0 0 0 '+f(cx-dxB)+','+f(H);
    var dy = Math.sqrt(Math.max(nr*nr - (cx-W)*(cx-W), 0));
    if(!(dy > 0.5)) return '';
    return 'M'+f(W)+','+f(cy-dy)+' A'+f(nr)+','+f(nr)+' 0 0 0 '+f(W)+','+f(cy+dy);
  }
  if(dxT > 0.5 && dxB > 0.5 && cx + dxT > 1 && cx + dxB > 1)
    return 'M'+f(cx+dxB)+','+f(H)+' A'+f(nr)+','+f(nr)+' 0 0 0 '+f(cx+dxT)+',0';
  var dy2 = Math.sqrt(Math.max(nr*nr - cx*cx, 0));
  if(!(dy2 > 0.5)) return '';
  return 'M0,'+f(cy+dy2)+' A'+f(nr)+','+f(nr)+' 0 0 0 0,'+f(cy-dy2);
}

/* Theme System */
var THEME_L = {canvas:[233,230,222,1], plateau:[226,221,210,.78], shd:[88,82,70,.18], shl:[255,253,246,.8], edge:[255,253,246,.65], bevlo:[88,82,70,.08], ink:[42,38,32,1], inks:[141,110,99,1], blue:[121,85,72,1], onacc:[255,255,255,1], arc:[255,255,255,.9]};
var THEME_D = {canvas:[44,32,26,1], plateau:[121,85,72,.78], shd:[60,40,25,.5], shl:[255,240,220,.05], edge:[220,190,150,.10], bevlo:[60,40,25,.45], ink:[245,232,216,1], inks:[215,204,200,1], blue:[121,85,72,1], onacc:[44,32,26,1], arc:[220,190,150,.15]};
var lastNight = -1;

function applyTheme(night){
  night = Math.min(1, Math.max(0, night));
  if(Math.abs(night - lastNight) < 0.002) return;
  lastNight = night;
  var rs = document.documentElement.style, day = 1 - night;
  function mixc(a, b){
    return 'rgba(' + Math.round(a[0]*day + b[0]*night) + ',' + Math.round(a[1]*day + b[1]*night) + ',' + Math.round(a[2]*day + b[2]*night) + ',' + (a[3]*day + b[3]*night).toFixed(3) + ')';
  }
  rs.setProperty('--canvas', mixc(THEME_L.canvas, THEME_D.canvas));
  rs.setProperty('--plateau', mixc(THEME_L.plateau, THEME_D.plateau));
  rs.setProperty('--sh-dark', mixc(THEME_L.shd, THEME_D.shd));
  rs.setProperty('--sh-light', mixc(THEME_L.shl, THEME_D.shl));
  rs.setProperty('--glass-edge', mixc(THEME_L.edge, THEME_D.edge));
  rs.setProperty('--bevel-lo', mixc(THEME_L.bevlo, THEME_D.bevlo));
  rs.setProperty('--ink', mixc(THEME_L.ink, THEME_D.ink));
  rs.setProperty('--ink-soft', mixc(THEME_L.inks, THEME_D.inks));
  rs.setProperty('--logo-inv', night.toFixed(3));
  rs.setProperty('--blue', mixc(THEME_L.blue, THEME_D.blue));
  rs.setProperty('--on-accent', mixc(THEME_L.onacc, THEME_D.onacc));
  var aL = THEME_L.arc, aD = THEME_D.arc;
  rs.setProperty('--arc-light', 'rgba(' + Math.round(aL[0]*day + aD[0]*night) + ',' + Math.round(aL[1]*day + aD[1]*night) + ',' + Math.round(aL[2]*day + aD[2]*night) + ',' + ((aL[3]*day + aD[3]*night)*day).toFixed(3) + ')');
  document.documentElement.setAttribute('data-theme', night > 0.5 ? 'dark' : 'light');
}

/* Sizing - FIXED: sun center is exactly at horizontal midpoint */
var dpr = 1, sunPos = [0, 0.8];

function resize(){
  if(!window.innerWidth || !window.innerHeight) return;
  dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  cv.width = Math.round(window.innerWidth * dpr);
  cv.height = Math.round(window.innerHeight * dpr);
  gl.viewport(0, 0, cv.width, cv.height);
  
  var rL = barL.getBoundingClientRect(), rR = barR.getBoundingClientRect();
  
  // Calculate the exact center of the gap between bars
  // This is the point where the sun should be centered
  var seamX = (rL.right + rR.left) / 2;
  var sunCy = rL.top + rL.height / 2;
  
  // Use clientWidth to exclude scrollbar from width calculation
  // This ensures the coordinate system matches between DOM (getBoundingClientRect)
  // and WebGL (normalized coordinates)
  var vw = document.documentElement.clientWidth, vh = window.innerHeight;
  mradEff = MRAD * (900 / Math.max(1, vh));
  sunkEff = Math.max(1, vh) / 900;
  sunPx = [seamX, sunCy];
  
  // Set the CSS variable for sun radius
  document.documentElement.style.setProperty('--sunR', (mradEff/ZOOM*vh).toFixed(2)+'px');
  
  clickR = Math.max(84, vh * 0.13);
  
  // Calculate sun position in normalized WebGL coordinates
  // WebGL uses normalized device coordinates: x from -1 (left) to +1 (right), y from -1 (bottom) to +1 (top)
  // The canvas aspect ratio is vw/vh, so we need to account for this
  // seamX is in window pixels, convert to normalized coords: (pixelX / vw * 2) - 1 gives us [-1, +1] range
  // Then multiply by (vw/vh) to account for the aspect ratio in the shader's coordinate system
  sunPos = [(seamX / vw * 2 - 1) * (vw / vh), 1 - 2 * (sunCy / vh)];
  
  var nr = mradEff / ZOOM * vh * 2;
  
  // Generate clip paths for the bars
  var dL = barPath(rL.width, rL.height, seamX - rL.left, sunCy - rL.top, nr, 0);
  var dR = barPath(rR.width, rR.height, seamX - rR.left, sunCy - rR.top, nr, 1);
  
  barL.style.clipPath = 'path("' + dL + '")';
  barR.style.clipPath = 'path("' + dR + '")';
  
  // Set up SVG bevels
  bevSvgL.setAttribute('viewBox', '0 0 ' + rL.width + ' ' + rL.height);
  bevSvgR.setAttribute('viewBox', '0 0 ' + rR.width + ' ' + rR.height);
  bevPathL.setAttribute('d', dL);
  bevPathR.setAttribute('d', dR);
  bevArcL.setAttribute('d', barArc(rL.width, rL.height, seamX - rL.left, sunCy - rL.top, nr, 0));
  bevArcR.setAttribute('d', barArc(rR.width, rR.height, seamX - rR.left, sunCy - rR.top, nr, 1));
  bevSvgL.style.clipPath = 'path("' + dL + '")';
  bevSvgR.style.clipPath = 'path("' + dR + '")';
  
  // Adjust padding to accommodate the sun
  barL.style.paddingRight = Math.max(18, Math.round(nr - (seamX - rL.right) + 18)) + 'px';
  barR.style.paddingLeft = Math.max(18, Math.round(nr - (rR.left - seamX) + 18)) + 'px';
  
  // Initialize moon position if not in eclipse
  if(!eclipsed && !anim){ 
    var pe0 = pathEnd(); 
    moon = pathOrbit(pe0[0], sunPos[1], pe0[1]); 
  }
}

window.addEventListener('resize', resize);
resize();

/* Main Animation Loop */
var t0 = performance.now();
var lastT = t0;

function frame(now){
  var t = (now - t0) / 1000;
  var dt = Math.min(0.1, (now - lastT)/1000);
  lastT = now;
  
  if(anim){
    var k = Math.min(1, (now - anim.t0) / anim.dur);
    var e = anim.dir === 'in' ? easeOut(k) : easeIn(k);
    moon = pathOrbit(anim.x0 + (anim.x1 - anim.x0) * e, anim.sunY, anim.r);
    if(k >= 1){
      if(anim.dir === 'out'){ 
        moon = pathOrbit(anim.xe, anim.sunY, anim.r); 
        fade = 0; 
      }
      else { 
        moon = [0, 0]; 
        fade = 1; 
      }
      anim = null;
    }
  }
  
  // Moon fade based on visibility
  var aspNow = window.innerWidth / window.innerHeight;
  var mpx = (moon[0] / ZOOM / aspNow + 1) / 2 * window.innerWidth;
  var mpy = (1 - (moon[1] / ZOOM + sunPos[1])) / 2 * window.innerHeight;
  var mmrg = mradEff / ZOOM * window.innerHeight + 10;
  
  if(mpx > -mmrg && mpx < window.innerWidth + mmrg && mpy > -mmrg && mpy < window.innerHeight + mmrg) 
    fade = 1;
  else 
    fade = Math.max(0, fade - dt / 0.25);
  
  // Update uniforms
  gl.uniform3f(uRes, cv.width, cv.height, 1);
  gl.uniform1f(uMrad, mradEff);
  gl.uniform1f(uSunk, sunkEff);
  gl.uniform1f(uZoom, ZOOM);
  gl.uniform2f(uSunPos, sunPos[0], sunPos[1]);
  gl.uniform2f(uMoonPos, moon[0], moon[1]);
  gl.uniform1f(uMoonFade, fade);
  
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  
  if(!document.body.classList.contains('ready')) 
    document.body.classList.add('ready');
  
  // Calculate sun intensity based on moon coverage
  var sunI = 1 - discCoverJS(Math.hypot(moon[0], moon[1]), mradEff) * fade;
  applyTheme(1 - sunI);
  
  requestAnimationFrame(frame);
}

/* Initialize additional features */
function initExtras() {
  // Accordion functionality
  var accHeads = document.querySelectorAll('.accordion-head');
  for(var ai = 0; ai < accHeads.length; ai++){
    accHeads[ai].addEventListener('click', function(){
      var item = this.parentNode, was = item.classList.contains('open');
      var items = document.querySelectorAll('.accordion-item');
      for(var aj = 0; aj < items.length; aj++) items[aj].classList.remove('open');
      if(!was) item.classList.add('open');
    });
  }
  
  // To Top button
  var toTop = document.getElementById('toTop');
  if(toTop) {
    window.addEventListener('scroll', function(){
      if(window.scrollY > window.innerHeight) toTop.classList.add('show');
      else toTop.classList.remove('show');
    }, {passive:true});
    toTop.addEventListener('click', function(){ window.scrollTo({top:0, behavior:'smooth'}); });
  }
}

// Start animation and initialize extras
requestAnimationFrame(frame);
initExtras();

})();
