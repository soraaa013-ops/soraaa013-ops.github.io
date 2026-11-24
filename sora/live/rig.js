// The drawing space is 373 by 560. Joint anchors below correspond to the
// neck, raised wrist, elbow, ponytail tie and the two eye openings in sora.webp.
const vertex = `
attribute vec2 uv;
varying highp vec2 art;
uniform vec2 fit, look;
uniform float time, breath, greeting, beat, recoil;
vec2 rotateAround(vec2 p, vec2 pivot, float angle) {
  vec2 d = p-pivot;
  return pivot + vec2(d.x*cos(angle)-d.y*sin(angle), d.x*sin(angle)+d.y*cos(angle));
}
void main() {
  vec2 p = uv * vec2(373.,560.);
  art = p;
  float head = 1.-smoothstep(150.,200.,p.y);
  float body = 1.-smoothstep(180.,505.,p.y);
  float tail = smoothstep(214.,286.,p.x) * smoothstep(40.,150.,p.y)
             * (1.-smoothstep(390.,429.,p.y));
  vec2 moved = p;
  moved.x += tail*(4.8*sin(time*1.05-p.y*.016)+1.7*sin(time*1.73-p.y*.009)+8.*recoil);
  moved.y += tail*(2.*cos(time*.94-p.y*.012)+2.*beat);
  // Rotate from the elbow, then let the hand lag slightly at the wrist.
  float forearm = (1.-smoothstep(64.,105.,p.x))*(1.-smoothstep(235.,326.,p.y))*smoothstep(117.,144.,p.y);
  moved = rotateAround(moved, vec2(64.,291.), greeting*.092*forearm);
  moved = rotateAround(moved, vec2(55.,228.), greeting*.126*forearm*(1.-smoothstep(209.,229.,p.y)));
  moved = rotateAround(moved, vec2(175.,166.), head*(look.x*.024+.012*sin(time*.82)+.025*beat));
  moved.x += head*(look.x*2.4+.6*sin(time*.64));
  moved.y += head*look.y*1.9;
  moved.x += body*(1.2*sin(time*.71)+1.5*beat);
  moved.y += body*(breath*1.9+beat*2.);
  vec2 centered = (moved/vec2(373.,560.)-.5)*2.;
  gl_Position = vec4(centered.x*fit.x,-centered.y*fit.y,0.,1.);
}`;
const fragment = `
precision highp float;
varying vec2 art;
uniform sampler2D portrait;
uniform vec2 gaze;
uniform float blink;
vec2 eye(vec2 at, vec2 center, float tilt) {
  vec2 d=at-center;
  float horizontal = 1.-smoothstep(11.,16.,abs(d.x));
  float relY = d.y - tilt*d.x;
  // Invert a three-segment lid deformation. The lash travels down over the
  // iris; the surrounding skin stretches to meet it as the eye closes.
  float lid = -7. + 12.7*blink*horizontal;
  float sampleY = relY;
  if (relY > -14. && relY < lid)
    sampleY = mix(-14.,-7.,(relY+14.)/(lid+14.));
  else if (relY >= lid && relY < 7.)
    sampleY = mix(-7.,7.,(relY-lid)/(7.-lid));
  vec2 shifted = at + vec2(0.,sampleY-relY);
  float iris = (1.-smoothstep(5.,10.,length(vec2(d.x,sampleY)*vec2(1.,.87))))*horizontal;
  return shifted - gaze*iris*vec2(1.45,.9);
}
void main() {
  vec2 p = art;
  if (art.x < 169.) p=eye(art,vec2(144.,110.),-.07);
  else p=eye(art,vec2(198.,106.),-.09);
  if (min(p.x,p.y)<0. || p.x>373. || p.y>560.) discard;
  gl_FragColor=texture2D(portrait,p/vec2(373.,560.));
}`;

export function createRig(canvas, image) {
  const gl = canvas.getContext('webgl', {alpha:true, antialias:false, premultipliedAlpha:true, depth:false, stencil:false});
  if (!gl) return null;
  function compile(kind, source) {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const positions=[], indices=[];
  const columns=58, rows=80;
  for(let row=0;row<=rows;row++) for(let col=0;col<=columns;col++) {
    positions.push(col/columns,row/rows);
    if(col<columns && row<rows){
      const i=row*(columns+1)+col;
      indices.push(i,i+1,i+columns+1,i+1,i+columns+2,i+columns+1);
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);
  const uv=gl.getAttribLocation(program,'uv');
  gl.vertexAttribPointer(uv,2,gl.FLOAT,false,0,0);
  gl.enableVertexAttribArray(uv);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  // Power-of-two storage permits trilinear filtering on WebGL 1 devices.
  const atlas=document.createElement('canvas');
  atlas.width=1024;
  atlas.height=2048;
  atlas.getContext('2d').drawImage(image,0,0,atlas.width,atlas.height);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);
  gl.generateMipmap(gl.TEXTURE_2D);
  const uniforms=Object.fromEntries(['fit','time','breath','greeting','beat','recoil','blink','look','gaze'].map(k=>[k,gl.getUniformLocation(program,k)]));
  return {
    resize(w,h){
      const ratio=Math.min(devicePixelRatio || 1,2);
      canvas.width=Math.max(1,Math.round(w*ratio));
      canvas.height=Math.max(1,Math.round(h*ratio));
      gl.viewport(0,0,canvas.width,canvas.height);
      const scale=Math.min(w/373,h/560)*.976;
      gl.uniform2f(uniforms.fit,373*scale/w,560*scale/h);
    },
    draw(state){
      for(const key of ['time','breath','greeting','beat','recoil','blink']) gl.uniform1f(uniforms[key],state[key]);
      gl.uniform2fv(uniforms.look,state.look);
      gl.uniform2fv(uniforms.gaze,state.gaze);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
    }
  };
}
