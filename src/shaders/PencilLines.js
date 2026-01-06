import * as THREE from 'three';

export const PencilLinesShader = {

    uniforms: {
        "tDiffuse": { value: null },
        "tPaper": { value: null }, // Noise/paper texture
        "resolution": { value: new THREE.Vector2(1.0 / 512, 1.0 / 512) },
        "uColor": { value: new THREE.Color(0x222222) }, // Pencil color
        "uBgColor": { value: new THREE.Color(0xffffff) }, // Background color
        "uThickness": { value: 2.0 }, // Line thickness
        "uThreshold": { value: 0.2 }, // Edge threshold
    },

    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,

    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tPaper;
        uniform vec2 resolution;
        uniform vec3 uColor;
        uniform vec3 uBgColor;
        uniform float uThickness;
        uniform float uThreshold;

        varying vec2 vUv;

        // Sobel edge detection
        float edgeDetection(sampler2D tex, vec2 uv) {
            vec2 texel = resolution * uThickness;
            
            float Gx = 0.0;
            float Gy = 0.0;
            
            // 3x3 kernel
            for(int i = -1; i <= 1; i++){
                for(int j = -1; j <= 1; j++){
                    float intensity = dot(texture2D(tex, uv + vec2(float(i), float(j)) * texel).rgb, vec3(0.299, 0.587, 0.114));
                    
                    // Sobel Kernels
                    // X: -1 0 1
                    //    -2 0 2
                    //    -1 0 1
                    
                    // Y: -1 -2 -1
                    //     0  0  0
                    //     1  2  1
                    
                    if (i == -1) { Gx -= intensity * (j == 0 ? 2.0 : 1.0); }
                    if (i ==  1) { Gx += intensity * (j == 0 ? 2.0 : 1.0); }
                    
                    if (j == -1) { Gy -= intensity * (i == 0 ? 2.0 : 1.0); }
                    if (j ==  1) { Gy += intensity * (i == 0 ? 2.0 : 1.0); }
                }
            }
            
            return sqrt(Gx * Gx + Gy * Gy);
        }

        void main() {
            vec2 uv = vUv;
            
            // Add some wobble based on paper texture to simulate hand drawn
            vec2 wobble = (texture2D(tPaper, uv).rg - 0.5) * 0.005;
            vec2 distortedUv = uv + wobble;

            float edge = edgeDetection(tDiffuse, distortedUv);
            
            // Noise grain
            float paper = texture2D(tPaper, uv * 2.0).r;
            
            // Thresholding
            // Soft threshold
            float edgeFactor = smoothstep(uThreshold - 0.1, uThreshold + 0.1, edge);
            
            // Mix background and pencil color
            // Multiply pencil color by paper grain for texture
            vec3 pencil = uColor * (0.8 + 0.2 * paper); 
            
            // Output
            vec3 finalColor = mix(uBgColor, pencil, edgeFactor);
            
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `
};
