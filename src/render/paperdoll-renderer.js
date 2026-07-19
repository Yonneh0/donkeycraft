// Donkeycraft — Paperdoll Renderer
// WebGL-based 3D entity renderer for the inventory paperdoll slot.
(function () {
  'use strict';

  var Donkeycraft = window.Donkeycraft;

  var _HEAD_YAW_LIMIT = 0.52;
  var _HEAD_PITCH_LIMIT = 0.26;
  var _CANVAS_WIDTH = 128;
  var _CANVAS_HEIGHT = 180;
  var _MAGENTA = { r: 1, g: 0, b: 1 };

  /**
   * PaperdollRenderer — Renders a 3D player entity over the inventory paperdoll slot.
   * @constructor
   * @param {HTMLElement} container - The .dk-paperdoll-container element.
   */
  Donkeycraft.PaperdollRenderer = function (container) {
    this._container = container || null;
    this._canvas = null;
    this._gl = null;

    this._running = false;
    this._paused = false;
    this._mouseInside = false;
    this._contextLost = false;

    this._animState = 'idle';
    this._animTime = 0;
    this._stateTimer = 0;
    this._lastTransforms = {};
    this._headOverride = { yaw: 0, pitch: 0 };

    this._camPos = { x: 0, y: 1.35, z: 5.0 };
    this._camTarget = { x: 0, y: 1.2, z: 0 };
    this._fov = 45;
    this._aspect = _CANVAS_WIDTH / _CANVAS_HEIGHT;

    this._entity = null;

    this._shaderProgram = null;
    this._aPositionLoc = -1;
    this._aNormalLoc = -1;
    this._uModel = -1;
    this._uColor = -1;
    this._uProjection = -1;
    this._uView = -1;
    this._uFogColor = -1;
    this._uFogDensity = -1;
    this._meshCache = {};

    this._lastFrameTime = 0;
    this._rafId = null;
    this._contextLossHandler = null;

    this._onHoverChange = [];
  };

  Donkeycraft.PaperdollRenderer.prototype._createShaderProgram = function () {
    var gl = this._gl;
    if (!gl) return false;

    var vsSource = [
      'attribute vec3 aPosition;',
      'attribute vec3 aNormal;',
      'uniform mat4 uProjection;',
      'uniform mat4 uView;',
      'uniform mat4 uModel;',
      'varying vec3 vNormal;',
      'varying float vDepth;',
      'void main() {',
      '    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);',
      '    vNormal = aNormal;',
      '    vDepth = -(uView * uModel * vec4(aPosition, 1.0)).z;',
      '}'
    ].join('\n');

    var fsSource = [
      'precision mediump float;',
      'varying vec3 vNormal;',
      'varying float vDepth;',
      'uniform vec3 uColor;',
      'uniform vec3 uFogColor;',
      'uniform float uFogDensity;',
      'void main() {',
      '    vec3 finalColor = uColor;',
      '    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));',
      '    float diff = max(dot(normalize(vNormal), lightDir), 0.25);',
      '    finalColor *= diff;',
      '    float fogFactor = 1.0 - exp(-vDepth * uFogDensity);',
      '    fogFactor = clamp(fogFactor, 0.0, 1.0);',
      '    finalColor = mix(finalColor, uFogColor, fogFactor);',
      '    gl_FragColor = vec4(finalColor, 1.0);',
      '}'
    ].join('\n');

    var vs = this._compileShader(gl.VERTEX_SHADER, vsSource);
    var fs = this._compileShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return false;

    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[PaperdollRenderer] Shader link failed:', gl.getProgramInfoLog(program));
      return false;
    }

    this._shaderProgram = program;
    this._aPositionLoc = gl.getAttribLocation(program, 'aPosition');
    this._aNormalLoc = gl.getAttribLocation(program, 'aNormal');
    this._uModel = gl.getUniformLocation(program, 'uModel');
    this._uColor = gl.getUniformLocation(program, 'uColor');
    this._uProjection = gl.getUniformLocation(program, 'uProjection');
    this._uView = gl.getUniformLocation(program, 'uView');
    this._uFogColor = gl.getUniformLocation(program, 'uFogColor');
    this._uFogDensity = gl.getUniformLocation(program, 'uFogDensity');

    return true;
  };

  Donkeycraft.PaperdollRenderer.prototype._compileShader = function (type, source) {
    var gl = this._gl;
    if (!gl) return null;

    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var typeStr = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
      console.error('[PaperdollRenderer] ' + typeStr + ' shader failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  Donkeycraft.PaperdollRenderer.prototype._createCanvas = function () {
    if (!this._container) return false;

    this._canvas = document.createElement('canvas');
    this._canvas.id = 'dk-paperdoll-canvas';
    this._canvas.style.position = 'absolute';
    this._canvas.style.left = '0px';
    this._canvas.style.bottom = '0px';
    this._canvas.style.top = 'auto';
    this._canvas.style.width = _CANVAS_WIDTH + 'px';
    this._canvas.style.height = _CANVAS_HEIGHT + 'px';
    this._canvas.style.pointerEvents = 'none';
    this._canvas.style.zIndex = '1';
    this._canvas.width = _CANVAS_WIDTH;
    this._canvas.height = _CANVAS_HEIGHT;

    this._container.appendChild(this._canvas);

    try {
      this._gl = this._canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    } catch (e) {
      console.error('[PaperdollRenderer] WebGL context creation failed:', e.message || e);
      return false;
    }

    if (!this._gl) {
      console.error('[PaperdollRenderer] WebGL context is null');
      return false;
    }

    this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    this._aspect = this._canvas.width / this._canvas.height;
    this._setupContextLossListener();
    return true;
  };

  Donkeycraft.PaperdollRenderer.prototype._createEntity = function () {
    var self = this;
    self._pos = { x: 0, y: 0, z: 0 };
    self._rot = { yaw: 0, pitch: 0 };
    var S = 1.5;

    this._entity = {
      type: 'player',
      _width: 0.6 * S,
      _height: 1.8 * S,
      getPosition: function () { return self._pos; },
      getRotation: function () { return self._rot; },
      getDimensions: function () { return { width: self._width, height: self._height }; },
      isAlive: function () { return true; },
      getBones: function () {
        return [
          { name: 'body', meshType: 'box', dimensions: { w: 0.6 * S, h: 0.9 * S, d: 0.3 * S }, color: '#3366CC', offset: { x: 0, y: 0.85 * S, z: 0 } },
          { name: 'head', meshType: 'box', dimensions: { w: 0.5 * S, h: 0.5 * S, d: 0.5 * S }, color: '#FFCC99', offset: { x: 0, y: 1.55 * S, z: 0 } },
          { name: 'leftEye', meshType: 'box', dimensions: { w: 0.08 * S, h: 0.06 * S, d: 0.04 * S }, color: '#1a1a2e', offset: { x: -0.12 * S, y: 1.62 * S, z: 0.27 * S }, parent: 'head' },
          { name: 'rightEye', meshType: 'box', dimensions: { w: 0.08 * S, h: 0.06 * S, d: 0.04 * S }, color: '#1a1a2e', offset: { x: 0.12 * S, y: 1.62 * S, z: 0.27 * S }, parent: 'head' },
          { name: 'hair', meshType: 'box', dimensions: { w: 0.54 * S, h: 0.16 * S, d: 0.52 * S }, color: '#4a3728', offset: { x: 0, y: 1.84 * S, z: -0.01 * S }, parent: 'head' },
          { name: 'leftArm', meshType: 'box', dimensions: { w: 0.25 * S, h: 0.8 * S, d: 0.25 * S }, color: '#FFCC99', offset: { x: -0.42 * S, y: 0.85 * S, z: 0 }, pivot: { x: -0.42 * S, y: 1.25 * S, z: 0 } },
          { name: 'rightArm', meshType: 'box', dimensions: { w: 0.25 * S, h: 0.8 * S, d: 0.25 * S }, color: '#FFCC99', offset: { x: 0.42 * S, y: 0.85 * S, z: 0 }, pivot: { x: 0.42 * S, y: 1.25 * S, z: 0 } },
          { name: 'leftLeg', meshType: 'box', dimensions: { w: 0.25 * S, h: 0.9 * S, d: 0.25 * S }, color: '#3366CC', offset: { x: -0.15 * S, y: 0.0, z: 0 }, pivot: { x: -0.15 * S, y: 0.45 * S, z: 0 } },
          { name: 'rightLeg', meshType: 'box', dimensions: { w: 0.25 * S, h: 0.9 * S, d: 0.25 * S }, color: '#3366CC', offset: { x: 0.15 * S, y: 0.0, z: 0 }, pivot: { x: 0.15 * S, y: 0.45 * S, z: 0 } }
        ];
      },
      getBoneTransforms: function () { return self._getLastTransforms(); }
    };
  };

  Donkeycraft.PaperdollRenderer.prototype._createBoxMesh = function (w, h, d) {
    var hw = w / 2, hh = h / 2, hd = d / 2;
    var verts = new Float32Array([
      -hw,-hh,hd, 0,0,1, 0,0,  hw,-hh,hd, 0,0,1, 1,0,
       hw, hh,hd, 0,0,1, 1,1, -hw, hh,hd, 0,0,1, 0,1,
       hw,-hh,-hd, 0,0,-1, 0,0, -hw,-hh,-hd, 0,0,-1, 1,0,
      -hw, hh,-hd, 0,0,-1, 1,1,  hw, hh,-hd, 0,0,-1, 0,1,
      -hw, hh,hd, 0,1,0, 0,0,  hw, hh,hd, 0,1,0, 1,0,
       hw, hh,-hd, 0,1,0, 1,1, -hw, hh,-hd, 0,1,0, 0,1,
      -hw,-hh,-hd, 0,-1,0, 0,0,  hw,-hh,-hd, 0,-1,0, 1,0,
       hw,-hh,hd, 0,-1,0, 1,1, -hw,-hh,hd, 0,-1,0, 0,1,
       hw,-hh,hd, 1,0,0, 0,0,  hw,-hh,-hd, 1,0,0, 1,0,
       hw, hh,-hd, 1,0,0, 1,1,  hw, hh,hd, 1,0,0, 0,1,
      -hw,-hh,-hd,-1,0,0, 0,0, -hw,-hh,hd,-1,0,0, 1,0,
      -hw, hh,hd,-1,0,0, 1,1, -hw, hh,-hd,-1,0,0, 0,1
    ]);
    var idx = new Uint16Array([
      0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11,
      12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23
    ]);
    return { vertices: verts, indices: idx, count: idx.length };
  };

  Donkeycraft.PaperdollRenderer.prototype._getOrBuildMesh = function (w, h, d) {
    if (!this._gl || this._contextLost) return null;
    var round4 = function (v) { return Math.round(v * 10000) / 10000; };
    var key = 'box:' + round4(w) + ':' + round4(h) + ':' + round4(d);
    if (this._meshCache[key]) return this._meshCache[key];

    var gl = this._gl;
    var mesh = this._createBoxMesh(w, h, d);
    if (!mesh.vertices || mesh.vertices.length === 0 || !mesh.indices || mesh.indices.length === 0) {
      console.warn('[PaperdollRenderer] Empty mesh for key "' + key + '"');
      return null;
    }

    var vbo = gl.createBuffer();
    if (!vbo) { console.warn('[PaperdollRenderer] gl.createBuffer() failed'); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    var ibo = gl.createBuffer();
    if (!ibo) { console.warn('[PaperdollRenderer] gl.createBuffer() failed for IBO'); gl.deleteBuffer(vbo); return null; }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    this._meshCache[key] = { vbo: vbo, ibo: ibo, count: mesh.count, stride: 8 * 4 };
    return this._meshCache[key];
  };

  Donkeycraft.PaperdollRenderer.prototype._drawMesh = function (cache, modelMatrix, color) {
    var gl = this._gl;
    if (!gl || !cache) return false;

    var matrixData = modelMatrix;
    if (modelMatrix && typeof modelMatrix.getData === 'function') {
      matrixData = modelMatrix.getData();
    }

    gl.useProgram(this._shaderProgram);
    gl.uniformMatrix4fv(this._uModel, false, matrixData);

    var hex = color.substring(1);
    var r, g, b;
    if (hex.length === 6) {
      r = parseInt(hex.substr(0, 2), 16) / 255;
      g = parseInt(hex.substr(2, 2), 16) / 255;
      b = parseInt(hex.substr(4, 2), 16) / 255;
    } else if (hex.length === 3) {
      r = parseInt(hex.charAt(0)+hex.charAt(0), 16) / 255;
      g = parseInt(hex.charAt(1)+hex.charAt(1), 16) / 255;
      b = parseInt(hex.charAt(2)+hex.charAt(2), 16) / 255;
    } else { r = _MAGENTA.r; g = _MAGENTA.g; b = _MAGENTA.b; }

    gl.uniform3f(this._uColor, r, g, b);
    gl.bindBuffer(gl.ARRAY_BUFFER, cache.vbo);
    gl.enableVertexAttribArray(this._aPositionLoc);
    gl.vertexAttribPointer(this._aPositionLoc, 3, gl.FLOAT, false, cache.stride, 0);
    gl.enableVertexAttribArray(this._aNormalLoc);
    gl.vertexAttribPointer(this._aNormalLoc, 3, gl.FLOAT, false, cache.stride, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cache.ibo);
    gl.drawElements(gl.TRIANGLES, cache.count, gl.UNSIGNED_SHORT, 0);
    return true;
  };

  Donkeycraft.PaperdollRenderer.prototype._computeBoneTransforms = function (dt) {
    var t = this._animTime;
    var transforms = {};

    switch (this._animState) {
      case 'idle': {
        transforms.body = { rx: 0, ry: Math.sin(t * 0.8) * 0.15, rz: 0 };
        transforms.head = { rx: Math.sin(t * 0.6) * 0.08, ry: Math.sin(t * 0.5) * 0.2, rz: 0 };
        transforms.leftArm = { rx: Math.sin(t * 0.7) * 0.1, ry: 0, rz: 0 };
        transforms.rightArm = { rx: Math.sin(t * 0.7 + 1) * 0.1, ry: 0, rz: 0 };
        transforms.leftLeg = { rx: 0, ry: Math.sin(t * 0.5) * 0.05, rz: 0 };
        transforms.rightLeg = { rx: 0, ry: Math.sin(t * 0.5 + 0.5) * 0.05, rz: 0 };
        break;
      }
      case 'walk': {
        var ws = 2.5, sa = 0.6;
        transforms.body = { rx: 0.05, ry: Math.sin(t * ws) * 0.1, rz: 0 };
        transforms.head = { rx: 0, ry: Math.sin(t * ws) * 0.08, rz: 0 };
        transforms.leftArm = { rx: -Math.sin(t * ws) * sa, ry: 0, rz: 0 };
        transforms.rightArm = { rx: Math.sin(t * ws) * sa, ry: 0, rz: 0 };
        transforms.leftLeg = { rx: Math.sin(t * ws) * sa, ry: 0, rz: 0 };
        transforms.rightLeg = { rx: -Math.sin(t * ws) * sa, ry: 0, rz: 0 };
        break;
      }
      case 'run': {
        var rs = 4.5, ra = 1.0;
        transforms.body = { rx: 0.2, ry: Math.sin(t * rs) * 0.15, rz: 0 };
        transforms.head = { rx: -0.15, ry: Math.sin(t * rs) * 0.1, rz: 0 };
        transforms.leftArm = { rx: -Math.sin(t * rs) * ra, ry: 0, rz: 0 };
        transforms.rightArm = { rx: Math.sin(t * rs) * ra, ry: 0, rz: 0 };
        transforms.leftLeg = { rx: Math.sin(t * rs) * ra, ry: 0, rz: 0 };
        transforms.rightLeg = { rx: -Math.sin(t * rs) * ra, ry: 0, rz: 0 };
        break;
      }
      case 'wave': {
        var wc = Math.sin(t * 5);
        transforms.body = { rx: 0, ry: -0.15, rz: 0 };
        transforms.head = { rx: 0, ry: 0.1, rz: 0 };
        transforms.leftArm = { rx: 0, ry: 0, rz: 0 };
        transforms.rightArm = { rx: -2.5 + wc * 0.3, ry: 0.5 + wc * 0.4, rz: 0.3 };
        transforms.leftLeg = { rx: 0, ry: 0, rz: 0 };
        transforms.rightLeg = { rx: 0, ry: 0, rz: 0 };
        break;
      }
    }

    if (this._mouseInside) {
      transforms.head = { rx: this._headOverride.pitch, ry: this._headOverride.yaw, rz: 0 };
    }

    var headRot = transforms.head || { rx: 0, ry: 0, rz: 0 };
    transforms.leftEye = { rx: headRot.rx, ry: headRot.ry, rz: headRot.rz };
    transforms.rightEye = { rx: headRot.rx, ry: headRot.ry, rz: headRot.rz };
    transforms.hair = { rx: headRot.rx, ry: headRot.ry, rz: headRot.rz };

    this._lastTransforms = transforms;
    return transforms;
  };

  Donkeycraft.PaperdollRenderer.prototype._setupContextLossListener = function () {
    var gl = this._gl;
    if (!gl || !gl.canvas) return;
    if (this._contextLossHandler) {
      gl.canvas.removeEventListener('webglcontextlost', this._contextLossHandler);
      gl.canvas.removeEventListener('webglcontextrestored', this._contextLossHandler);
    }
    var self = this;
    this._contextLossHandler = function (event) {
      if (event.type === 'webglcontextlost') self._onContextLost(event);
      else if (event.type === 'webglcontextrestored') self._onContextRestored(event);
    };
    gl.canvas.addEventListener('webglcontextlost', this._contextLossHandler, false);
    gl.canvas.addEventListener('webglcontextrestored', this._contextLossHandler, false);
  };

  Donkeycraft.PaperdollRenderer.prototype._onContextLost = function (event) {
    this._contextLost = true;
    event.preventDefault();
  };

  Donkeycraft.PaperdollRenderer.prototype._onContextRestored = function () {
    this._contextLost = false;
    this.clearMeshCache();
    if (this._shaderProgram) {
      this._gl.deleteProgram(this._shaderProgram);
      this._shaderProgram = null;
    }
    this._createShaderProgram();
  };

  Donkeycraft.PaperdollRenderer.prototype.clearMeshCache = function () {
    if (!this._gl) return;
    var gl = this._gl;
    for (var key in this._meshCache) {
      if (this._meshCache.hasOwnProperty(key)) {
        var cache = this._meshCache[key];
        if (cache.vbo) gl.deleteBuffer(cache.vbo);
        if (cache.ibo) gl.deleteBuffer(cache.ibo);
      }
    }
    this._meshCache = {};
  };

  Donkeycraft.PaperdollRenderer.prototype._getLastTransforms = function () {
    return this._lastTransforms;
  };

  Donkeycraft.PaperdollRenderer.prototype._updateAnimationState = function (dt) {
    if (this._paused) return;
    this._animTime += dt;
    this._stateTimer -= dt;
    if (this._stateTimer <= 0) {
      var states = ['idle', 'walk', 'run', 'wave'];
      var weights = [0.4, 0.25, 0.15, 0.2];
      var r = Math.random();
      var cumulative = 0;
      var newState = 'idle';
      for (var i = 0; i < states.length; i++) {
        cumulative += weights[i];
        if (r <= cumulative) { newState = states[i]; break; }
      }
      this._animState = newState;
      this._stateTimer = 2 + Math.random() * 3;
    }
  };

  Donkeycraft.PaperdollRenderer.prototype._renderFrame = function (timestamp) {
    if (!this._running) return;
    var gl = this._gl;

    if (this._lastFrameTime === 0) this._lastFrameTime = timestamp;
    var dt = Math.min((timestamp - this._lastFrameTime) / 1000, 0.1);
    this._lastFrameTime = timestamp;

    this._updateAnimationState(dt);
    var transforms = this._computeBoneTransforms(dt);

    if (!gl || !this._shaderProgram) {
      this._rafId = requestAnimationFrame(this._renderFrame.bind(this));
      return;
    }

    try {
      gl.useProgram(this._shaderProgram);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);

      if (!Donkeycraft.Matrix4 || !Donkeycraft.Vector3) {
        console.warn('[PaperdollRenderer] Matrix4/Vector3 unavailable — skipping frame');
        this._rafId = requestAnimationFrame(this._renderFrame.bind(this));
        return;
      }

      var proj = Donkeycraft.Matrix4.createPerspective((this._fov * Math.PI) / 180, this._aspect, 0.1, 100);
      var view = Donkeycraft.Matrix4.createLookAt(
        new Donkeycraft.Vector3(this._camPos.x, this._camPos.y, this._camPos.z),
        new Donkeycraft.Vector3(this._camTarget.x, this._camTarget.y, this._camTarget.z),
        new Donkeycraft.Vector3(0, 1, 0)
      );
      gl.uniformMatrix4fv(this._uProjection, false, proj.getData());
      gl.uniformMatrix4fv(this._uView, false, view.getData());
      gl.uniform3f(this._uFogColor, 0.53, 0.8, 0.97);
      gl.uniform1f(this._uFogDensity, 0.02);

      var entity = this._entity;
      if (entity) {
        var pos = entity.getPosition && entity.getPosition();
        if (pos) {
          var bones = entity.getBones();
          if (bones) {
            var rot = entity.getRotation();
            var yaw = rot && rot.yaw !== undefined ? rot.yaw : 0;
            var cosYaw = Math.cos(yaw);
            var sinYaw = Math.sin(yaw);
            var boneWorld = {};

            function applyRotToVec(vx, vy, vz, rx, ry, rz) {
              var x1 = vx * Math.cos(ry) - vz * Math.sin(ry);
              var z1 = vx * Math.sin(ry) + vz * Math.cos(ry);
              var y1 = vy;
              var y2 = y1 * Math.cos(rx) - z1 * Math.sin(rx);
              var z2 = y1 * Math.sin(rx) + z1 * Math.cos(rx);
              var x2 = x1;
              var x3 = x2 * Math.cos(rz) - y2 * Math.sin(rz);
              var y3 = x2 * Math.sin(rz) + y2 * Math.cos(rz);
              return { x: x3, y: y3, z: z2 };
            }

            function computeBoneWorld(boneDef, animTransform) {
              if (boneWorld[boneDef.name]) return boneWorld[boneDef.name];
              var offset = boneDef.offset || { x: 0, y: 0, z: 0 };
              var pivot = boneDef.pivot || null;
              var parentName = boneDef.parent || null;
              var anim = animTransform && animTransform[boneDef.name] ? animTransform[boneDef.name] : { rx: 0, ry: 0, rz: 0 };
              var wx, wy, wz;

              if (parentName) {
                var parentOffset = null, parentWorld = null;
                for (var k = 0; k < bones.length; k++) {
                  if (bones[k].name === parentName) {
                    parentOffset = bones[k].offset || { x: 0, y: 0, z: 0 };
                    parentWorld = computeBoneWorld(bones[k], animTransform);
                    break;
                  }
                }
                if (parentWorld && parentOffset) {
                  var cLx = offset.x * cosYaw - offset.z * sinYaw;
                  var cz = offset.x * sinYaw + offset.z * cosYaw;
                  var cy = offset.y;
                  var pLx = parentOffset.x * cosYaw - parentOffset.z * sinYaw;
                  var pLz = parentOffset.x * sinYaw + parentOffset.z * cosYaw;
                  var pLy = parentOffset.y;
                  var dx = cLx - pLx, dy = cy - pLy, dz = cz - pLz;
                  var rotated = applyRotToVec(dx, dy, dz, parentWorld.rx, parentWorld.ry, parentWorld.rz);
                  wx = parentWorld.x + rotated.x;
                  wy = parentWorld.y + rotated.y;
                  wz = parentWorld.z + rotated.z;
                } else {
                  wx = pos.x + (offset.x * cosYaw - offset.z * sinYaw);
                  wy = pos.y + offset.y;
                  wz = pos.z + (offset.x * sinYaw + offset.z * cosYaw);
                }
              } else if (pivot) {
                wx = pivot.x * cosYaw - pivot.z * sinYaw + pos.x;
                wy = pivot.y + pos.y;
                wz = pivot.x * sinYaw + pivot.z * cosYaw + pos.z;
              } else {
                wx = pos.x + (offset.x * cosYaw - offset.z * sinYaw);
                wy = pos.y + offset.y;
                wz = pos.z + (offset.x * sinYaw + offset.z * cosYaw);
              }

              var finalRx, finalRy, finalRz;
              if (parentName && boneWorld[parentName]) {
                var pw = boneWorld[parentName];
                finalRx = pw.rx; finalRy = pw.ry; finalRz = pw.rz;
              } else {
                finalRx = anim.rx || 0; finalRy = anim.ry || 0; finalRz = anim.rz || 0;
              }

              boneWorld[boneDef.name] = { x: wx, y: wy, z: wz, rx: finalRx, ry: finalRy, rz: finalRz };
              return boneWorld[boneDef.name];
            }

            for (var bi = 0; bi < bones.length; bi++) computeBoneWorld(bones[bi], transforms);

            for (var i = 0; i < bones.length; i++) {
              var bone = bones[i];
              var transform = transforms[bone.name] || { rx: 0, ry: 0, rz: 0 };
              var bw = computeBoneWorld(bone);

              var modelMatrix = Donkeycraft.Matrix4.createIdentity();
              if (transform.ry !== 0) modelMatrix = Donkeycraft.Matrix4.multiply(modelMatrix, Donkeycraft.Matrix4.createRotation(transform.ry, new Donkeycraft.Vector3(0, 1, 0)));
              if (transform.rx !== 0) modelMatrix = Donkeycraft.Matrix4.multiply(modelMatrix, Donkeycraft.Matrix4.createRotation(transform.rx, new Donkeycraft.Vector3(1, 0, 0)));
              if (transform.rz !== 0) modelMatrix = Donkeycraft.Matrix4.multiply(modelMatrix, Donkeycraft.Matrix4.createRotation(transform.rz, new Donkeycraft.Vector3(0, 0, 1)));

              if (bone.pivot) {
                var px = (bone.pivot.x || 0) - (bone.offset.x || 0);
                var py = (bone.pivot.y || 0) - (bone.offset.y || 0);
                var pz = (bone.pivot.z || 0) - (bone.offset.z || 0);
                var d = modelMatrix._data;
                var rpx = px * d[0] + py * d[4] + pz * d[8];
                var rpy = px * d[1] + py * d[5] + pz * d[9];
                var rpz = px * d[2] + py * d[6] + pz * d[10];
                modelMatrix._data[12] = bw.x - rpx;
                modelMatrix._data[13] = bw.y - rpy;
                modelMatrix._data[14] = bw.z - rpz;
              } else {
                modelMatrix._data[12] = bw.x;
                modelMatrix._data[13] = bw.y;
                modelMatrix._data[14] = bw.z;
              }

              var meshCache = this._getOrBuildMesh(bone.dimensions.w || 1, bone.dimensions.h || 1, bone.dimensions.d || 1);
              if (meshCache) this._drawMesh(meshCache, modelMatrix, bone.color || '#FF00FF');
            }
          }
        }
      }
    } catch (e) {
      console.error('[PaperdollRenderer] Render error:', e.message || e);
    }

    this._rafId = requestAnimationFrame(this._renderFrame.bind(this));
  };

  Donkeycraft.PaperdollRenderer.prototype.init = function () {
    if (this._running) return true;
    if (!this._container) { console.error('[PaperdollRenderer] No container element provided'); return false; }
    if (!this._createCanvas()) { console.error('[PaperdollRenderer] Canvas creation failed'); return false; }
    if (!this._createShaderProgram()) { console.error('[PaperdollRenderer] Shader program creation failed'); return false; }
    this._createEntity();
    this._setupHoverDetection();
    this._running = true;
    this._lastFrameTime = 0;
    this._rafId = requestAnimationFrame(this._renderFrame.bind(this));
    return true;
  };

  Donkeycraft.PaperdollRenderer.prototype._setupHoverDetection = function () {
    var self = this;
    var panel = document.querySelector('.dk-inventory-panel');
    var container = this._container;
    if (!panel || !container) return;

    var globalMouseMove = function (e) {
      if (!self._mouseInside) return;
      var cRect = container.getBoundingClientRect();
      if (!cRect) return;
      var mx = Math.max(-1, Math.min(1, ((e.clientX - cRect.left) / cRect.width) * 2 - 1));
      var my = Math.max(-1, Math.min(1, ((e.clientY - cRect.top) / cRect.height) * 2 - 1));
      self._headOverride.yaw = mx * _HEAD_YAW_LIMIT;
      self._headOverride.pitch = my * _HEAD_PITCH_LIMIT;
    };

    var handleEnter = function () {
      self._mouseInside = true;
      self.pause();
      document.addEventListener('mousemove', globalMouseMove);
      for (var i = 0; i < self._onHoverChange.length; i++) { try { self._onHoverChange[i](true); } catch (e) {} }
    };

    var handleLeave = function () {
      self._mouseInside = false;
      self.resume();
      document.removeEventListener('mousemove', globalMouseMove);
      self._headOverride.yaw = 0;
      self._headOverride.pitch = 0;
      for (var i = 0; i < self._onHoverChange.length; i++) { try { self._onHoverChange[i](false); } catch (e) {} }
    };

    this._hoverHandlers = { enter: handleEnter, leave: handleLeave, move: globalMouseMove };
    panel.addEventListener('mouseenter', handleEnter);
    panel.addEventListener('mouseleave', handleLeave);
  };

  /** pause — Pause animation updates while keeping the last frame rendered. */
  Donkeycraft.PaperdollRenderer.prototype.pause = function () { this._paused = true; };

  /** resume — Resume animation updates after a pause. */
  Donkeycraft.PaperdollRenderer.prototype.resume = function () { this._paused = false; };

  /** isRunning — Check if the renderer is active. */
  Donkeycraft.PaperdollRenderer.prototype.isRunning = function () { return this._running; };

  /**
   * destroy — Clean up all PaperdollRenderer resources.
   * After calling, create a new instance to use again.
   */
  Donkeycraft.PaperdollRenderer.prototype.destroy = function () {
    this._running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

    if (this._hoverHandlers) {
      var panel = document.querySelector('.dk-inventory-panel');
      if (panel) {
        panel.removeEventListener('mouseenter', this._hoverHandlers.enter);
        panel.removeEventListener('mouseleave', this._hoverHandlers.leave);
        panel.removeEventListener('mousemove', this._hoverHandlers.move);
      }
      this._hoverHandlers = null;
    }

    if (this._contextLossHandler && this._gl && this._gl.canvas) {
      this._gl.canvas.removeEventListener('webglcontextlost', this._contextLossHandler);
      this._gl.canvas.removeEventListener('webglcontextrestored', this._contextLossHandler);
      this._contextLossHandler = null;
    }

    this.clearMeshCache();

    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;
    this._gl = null;
    this._container = null;
    this._entity = null;
  };

  /**
   * onHoverChange — Subscribe to hover state changes.
   * @param {Function} callback - Called with (isHovered).
   * @returns {Function} Unsubscribe function.
   */
  Donkeycraft.PaperdollRenderer.prototype.onHoverChange = function (callback) {
    this._onHoverChange.push(callback);
    var self = this;
    return function () {
      var idx = self._onHoverChange.indexOf(callback);
      if (idx >= 0) self._onHoverChange.splice(idx, 1);
    };
  };
})();