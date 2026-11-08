import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from 'three';

const CAPACITY = 12;

/** A tiny reusable billboard pool: one unlit draw call, no textures or lights. */
export class DustPuffs {
  readonly mesh: InstancedMesh;
  private opacity = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
  private particles = Array.from({ length: CAPACITY }, () => ({ position: new Vector3(), velocity: new Vector3(), age: 1, life: .6, size: .4 }));
  private cursor = 0;
  private matrix = new Matrix4();
  private scale = new Vector3();

  constructor() {
    const geometry = new PlaneGeometry(1, 1);
    geometry.setAttribute('puffOpacity', this.opacity);
    const material = new ShaderMaterial({
      uniforms: { puffColor: { value: new Color('#e6d5b9') } }, transparent: true, depthWrite: false,
      vertexShader: `attribute float puffOpacity;
        varying vec2 vPuffUv; varying float vPuffOpacity;
        void main() { vPuffUv = uv; vPuffOpacity = puffOpacity;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 puffColor;
        varying vec2 vPuffUv; varying float vPuffOpacity;
        void main() {
          float edge = 1.0 - smoothstep(0.12, 0.5, length(vPuffUv - 0.5));
          float alpha = edge * vPuffOpacity;
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(puffColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new InstancedMesh(geometry, material, CAPACITY);
    this.mesh.name = 'KingFootstepPuffs'; this.mesh.frustumCulled = false; this.mesh.visible = false;
    for (let i = 0; i < CAPACITY; i++) this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
  }

  get activeCount() { return this.particles.reduce((count, particle) => count + Number(particle.age < particle.life), 0); }

  emit(position: Vector3, direction: Vector3, groundHeight: (x: number, z: number) => number | null) {
    for (const side of [-1, 1]) {
      const particle = this.particles[this.cursor++ % CAPACITY];
      const spread = side * (.12 + Math.random() * .05);
      particle.position.set(position.x - direction.x * .2 - direction.z * spread, position.y, position.z - direction.z * .2 + direction.x * spread);
      particle.position.y = (groundHeight(particle.position.x, particle.position.z) ?? position.y) + .07;
      particle.velocity.set(-direction.x * .12 - direction.z * side * .07, .12, -direction.z * .12 + direction.x * side * .07);
      particle.age = 0; particle.life = .5 + Math.random() * .18; particle.size = .12 + Math.random() * .06;
    }
    this.mesh.visible = true;
  }

  update(dt: number, cameraRotation: Quaternion) {
    if (!this.mesh.visible) return;
    let active = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const particle = this.particles[i]; particle.age += dt;
      if (particle.age >= particle.life) { this.opacity.setX(i, 0); this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0)); continue; }
      active++;
      const progress = particle.age / particle.life;
      particle.position.addScaledVector(particle.velocity, dt);
      this.scale.setScalar(particle.size * (1 + progress * .65));
      this.matrix.compose(particle.position, cameraRotation, this.scale); this.mesh.setMatrixAt(i, this.matrix);
      this.opacity.setX(i, Math.sin(Math.PI * progress) * (1 - progress * .35) * .27);
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.opacity.needsUpdate = true;
    this.mesh.visible = active > 0;
  }

  clear() {
    for (const particle of this.particles) particle.age = particle.life;
    this.mesh.visible = false;
  }

  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as ShaderMaterial).dispose(); }
}
