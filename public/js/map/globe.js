// Planet view: the map is treated as an equirectangular projection
// (width = 360° of longitude, height = 180° of latitude) and drawn on a sphere
// in orthographic projection. The same math, in JS, converts screen <-> map for painting.

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D tex;
uniform sampler2D objs; // engravings and labels already drawn upright, in screen pixels
uniform bool hasObjs;
uniform vec2 center;   // sphere center, in WebGL pixels (y up)
uniform float R;       // radius in pixels
uniform float lon0, lat0;
uniform vec3 bg;
uniform vec3 paper;    // paper color (grain)
uniform float grain;   // grain intensity
uniform float Rpx;     // planet radius in map px (width / 2π)
uniform uint seed;
out vec4 color;
const float PI = 3.14159265;

// Paper grain computed in 3D on the sphere (on the flat map it would stretch at the poles).
float h01(ivec3 p, uint s) {
  uint h = uint(p.x) * 374761393u + uint(p.y) * 668265263u + uint(p.z) * 1440670441u + s * 1274126177u;
  h = (h ^ (h >> 13u)) * 1103515245u;
  h ^= h >> 16u;
  return float(h) / 4294967295.0;
}
float vnoise(vec3 p, uint s) {
  ivec3 i = ivec3(floor(p));
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(h01(i, s), h01(i + ivec3(1, 0, 0), s), f.x);
  float b = mix(h01(i + ivec3(0, 1, 0), s), h01(i + ivec3(1, 1, 0), s), f.x);
  float c = mix(h01(i + ivec3(0, 0, 1), s), h01(i + ivec3(1, 0, 1), s), f.x);
  float d = mix(h01(i + ivec3(0, 1, 1), s), h01(i + ivec3(1, 1, 1), s), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
float fbm(vec3 p, uint s) {
  return (0.5 * vnoise(p, s) + 0.25 * vnoise(p * 2.0, s + 31u) + 0.125 * vnoise(p * 4.0, s + 62u)) / 0.875;
}
void main() {
  vec4 o = vec4(0.0);
  if (hasObjs) o = texelFetch(objs, ivec2(gl_FragCoord.x, textureSize(objs, 0).y - 1 - int(gl_FragCoord.y)), 0);
  vec2 q = (gl_FragCoord.xy - center) / R;
  float d = length(q);
  if (d > 1.0) {
    float halo = smoothstep(1.06, 1.0, d) * 0.35; // atmosphere glow around it
    color = vec4(mix(mix(bg, vec3(0.75, 0.85, 0.95), halo), o.rgb, o.a), 1.0);
    return;
  }
  float w = sqrt(1.0 - d * d);
  float cl = cos(lat0), sl = sin(lat0);
  float y1 = q.y * cl + w * sl;
  float z1 = -q.y * sl + w * cl;
  float X = q.x * cos(lon0) + z1 * sin(lon0);
  float Z = -q.x * sin(lon0) + z1 * cos(lon0);
  float s = atan(X, Z) / (2.0 * PI) + 0.5;
  float t = 0.5 - asin(clamp(y1, -1.0, 1.0)) / PI;
  // At the seam (s jumps from 1 to 0) use the shifted coordinate, so the mipmap doesn't blur.
  float s2 = fract(s + 0.5) - 0.5;
  float sc = fwidth(s) > fwidth(s2) + 1e-6 ? s2 : s;
  vec3 c = texture(tex, vec2(sc, t)).rgb;
  c = mix(c, o.rgb, o.a); // objects get the same paper and lighting as the terrain
  if (grain > 0.0) {
    vec3 P = vec3(X, y1, Z) * Rpx;
    float fw = length(fwidth(P)); // map px per screen px: fades fine detail when zoomed out
    float fine = mix(vnoise(P * 0.12, seed + 4u), 0.5, clamp(fw * 0.12 - 0.5, 0.0, 1.0));
    float dots = mix(h01(ivec3(floor(P)), seed + 5u), 0.5, clamp(fw - 0.5, 0.0, 1.0));
    float v = 0.5 * fbm(P * 0.01, seed + 3u) + 0.3 * fine + 0.2 * dots;
    c *= mix(vec3(1.0), paper * (0.72 + 0.4 * v), grain);
  }
  float light = 0.35 + 0.65 * pow(w, 0.6);
  c *= light;
  c = mix(c, vec3(0.7, 0.82, 0.95), pow(1.0 - w, 3.0) * 0.35); // atmosphere at the rim
  color = vec4(c, 1.0);
}`;

export function createGlobe(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true });
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const objTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, objTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const u = (n) => gl.getUniformLocation(prog, n);
  gl.uniform1i(u('tex'), 0);
  gl.uniform1i(u('objs'), 1);
  let mipDirty = false;
  const U = { center: u('center'), R: u('R'), lon0: u('lon0'), lat0: u('lat0'), bg: u('bg'), hasObjs: u('hasObjs'), paper: u('paper'), grain: u('grain'), Rpx: u('Rpx'), seed: u('seed') };

  return {
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    // Without x/y replaces the whole texture; with x/y updates only that region.
    upload(source, x, y) {
      if (x === undefined) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, source);
      mipDirty = true; // mipmap rebuilt only once, on the next draw
    },
    // v = { cx, cy, R, lon0, lat0 } in CSS pixels; dpr converts to canvas pixels.
    // g = { paper: [r,g,b] 0-255, grain, W (map width in px), seed, objs (screen-sized canvas or null) }
    draw(v, dpr, g) {
      gl.uniform1i(U.hasObjs, g.objs ? 1 : 0);
      if (g.objs) {
        gl.activeTexture(gl.TEXTURE1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g.objs);
        gl.activeTexture(gl.TEXTURE0);
      }
      gl.uniform3f(U.paper, g.paper[0] / 255, g.paper[1] / 255, g.paper[2] / 255);
      gl.uniform1f(U.grain, g.grain);
      gl.uniform1f(U.Rpx, g.W / (2 * Math.PI));
      gl.uniform1ui(U.seed, g.seed >>> 0);
      if (mipDirty) { gl.generateMipmap(gl.TEXTURE_2D); mipDirty = false; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.center, v.cx * dpr, canvas.height - v.cy * dpr);
      gl.uniform1f(U.R, v.R * dpr);
      gl.uniform1f(U.lon0, v.lon0);
      gl.uniform1f(U.lat0, v.lat0);
      gl.uniform3f(U.bg, 0x14 / 255, 0x12 / 255, 0x10 / 255);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

// Screen (CSS px) -> map (px), or null outside the sphere. Same math as the shader.
export function screenToMap(sx, sy, v, W, H) {
  const qx = (sx - v.cx) / v.R, qy = -(sy - v.cy) / v.R;
  const d2 = qx * qx + qy * qy;
  if (d2 > 1) return null;
  const w = Math.sqrt(1 - d2);
  const cl = Math.cos(v.lat0), sl = Math.sin(v.lat0);
  const y1 = qy * cl + w * sl, z1 = -qy * sl + w * cl;
  const X = qx * Math.cos(v.lon0) + z1 * Math.sin(v.lon0);
  const Z = -qx * Math.sin(v.lon0) + z1 * Math.cos(v.lon0);
  const lon = Math.atan2(X, Z), lat = Math.asin(Math.max(-1, Math.min(1, y1)));
  return { x: (lon / (2 * Math.PI) + 0.5) * W, y: (0.5 - lat / Math.PI) * H };
}

// Map (px) -> screen (CSS px), or null if on the back side of the planet.
export function mapToScreen(mx, my, v, W, H) {
  const lon = (mx / W - 0.5) * 2 * Math.PI, lat = (0.5 - my / H) * Math.PI;
  const X = Math.cos(lat) * Math.sin(lon), Y = Math.sin(lat), Z = Math.cos(lat) * Math.cos(lon);
  const x1 = X * Math.cos(v.lon0) - Z * Math.sin(v.lon0);
  const z1 = X * Math.sin(v.lon0) + Z * Math.cos(v.lon0);
  const cl = Math.cos(v.lat0), sl = Math.sin(v.lat0);
  const qy = Y * cl - z1 * sl, w = Y * sl + z1 * cl;
  if (w < 0) return null;
  return { x: v.cx + x1 * v.R, y: v.cy - qy * v.R };
}
