import * as THREE from 'three'

/**
 * X-Ray / 全息 Fresnel：邊緣亮、中心幾乎透明，露出內部骨架與器官
 */
export const hologramFresnelShader = {
  uniforms: {
    uTime: { value: 0 },
    // 本體調暗當背景，讓部位熱點跳出來（原本 #4ad4ff、0.1，和部位同色系又一樣亮）
    uColor: { value: new THREE.Color('#2f6f8c') },
    uOpacity: { value: 0.05 },
    /** 本體整體亮度；緊急狀態時會拉回 1，讓紅色警示仍然明顯 */
    uBrightness: { value: 0.4 },
    uFresnelPower: { value: 2.6 },
    uScanEnabled: { value: 1 },
    uScanSpeed: { value: 0.28 },
    uAlertMix: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      vViewDir = normalize(cameraPosition - worldPos.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uFresnelPower;
    uniform float uScanEnabled;
    uniform float uScanSpeed;
    uniform float uAlertMix;
    uniform float uBrightness;

    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;

    void main() {
      vec3 alertColor = vec3(1.0, 0.25, 0.4);
      // 緊急時本體只帶一半紅色，重點留給出問題的部位（原本整個轉成紅色，看不出是哪裡出事）
      vec3 baseColor = mix(uColor, alertColor, uAlertMix * 0.5);

      float ndotv = max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
      float fresnel = pow(1.0 - ndotv, uFresnelPower);
      float rim = pow(1.0 - ndotv, 1.6);

      float scanBand = 0.0;
      if (uScanEnabled > 0.5) {
        float scanY = fract(uTime * uScanSpeed);
        float bodyY = clamp(vWorldPos.y / 1.7, 0.0, 1.0);
        float d = abs(bodyY - scanY);
        scanBand = pow(1.0 - smoothstep(0.0, 0.05, d), 12.0);
      }

      // 中心極透、邊緣發光 — 類似醫學全息圖
      float alpha = clamp(uOpacity + fresnel * 0.55 + rim * 0.2 + scanBand * 0.35, 0.02, 0.72);
      vec3 color = baseColor * (0.15 + fresnel * 2.2 + rim * 0.8 + scanBand * 1.6);
      // 緊急時亮度 0.4 → 0.6（原本拉到 1.0，加上泛光整片糊掉），並以每秒約 0.8 次緩慢呼吸
      // 低於 3 Hz，避免快速閃爍造成不適
      float pulse = 0.8 + 0.2 * sin(uTime * 5.0);
      color *= mix(uBrightness, 0.6 * pulse, uAlertMix);

      gl_FragColor = vec4(color, alpha);
    }
  `,
}

/** 內部骨骼用：略實一點的藍光材質參數 */
export const boneMaterialProps = {
  color: '#5adfff',
  emissive: '#1a8fb8',
  emissiveIntensity: 0.55,
  transparent: true,
  opacity: 0.78,
  roughness: 0.35,
  metalness: 0.55,
  depthWrite: false,
} as const
