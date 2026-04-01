import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  FogExp2,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { AmbientParticle, ParticleInstance, VisualSceneFrame } from '../../visual/types';

const MAX_DYNAMIC_PARTICLES = 1600;

const tempMatrix = new Matrix4();
const tempPosition = new Vector3();
const tempScale = new Vector3();
const hslColor = new Color();

const toThreeColor = (hue: number, saturation: number, lightness: number, alpha: number): Color =>
  hslColor.clone().setHSL(hue, saturation, lightness * alpha + 0.05);

export class ParticleSceneRenderer {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1, 0.1, 100);
  private readonly renderer: WebGLRenderer;
  private readonly dynamicMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.94,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  private readonly dynamicGeometry = new SphereGeometry(0.08, 8, 8);
  private readonly dynamicMesh = new InstancedMesh(this.dynamicGeometry, this.dynamicMaterial, MAX_DYNAMIC_PARTICLES);
  private readonly ambientMaterial = new PointsMaterial({
    size: 0.12,
    transparent: true,
    opacity: 0.8,
    vertexColors: true,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  private ambientGeometry = new BufferGeometry();
  private ambientPoints = new Points(this.ambientGeometry, this.ambientMaterial);
  private ambientPositionAttribute = new BufferAttribute(new Float32Array(0), 3);
  private ambientColorAttribute = new BufferAttribute(new Float32Array(0), 3);
  private readonly resizeObserver: ResizeObserver;

  private readonly host: HTMLElement;

  public constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.setAttribute('aria-label', 'MIDI particle field visualization');
    this.renderer.domElement.setAttribute('role', 'img');

    this.scene.add(this.dynamicMesh);
    this.scene.add(this.ambientPoints);
    this.scene.fog = new FogExp2(0x050b10, 0.06);
    this.camera.position.set(0, 0, 16);

    this.host.append(this.renderer.domElement);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
  }

  public render(frame: VisualSceneFrame): void {
    this.syncAmbient(frame.ambientParticles);
    this.syncDynamic(frame.particles);

    const backgroundColor = toThreeColor(...frame.background.colorHsl, 1);
    this.renderer.setClearColor(backgroundColor, 1);
    const fog = this.scene.fog;
    if (fog instanceof FogExp2) {
      fog.color.copy(backgroundColor);
      fog.density = 0.03 + frame.background.fogStrength * 0.06;
    }

    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.resizeObserver.disconnect();
    this.dynamicGeometry.dispose();
    this.dynamicMaterial.dispose();
    this.ambientGeometry.dispose();
    this.ambientMaterial.dispose();
    this.renderer.dispose();
    this.host.replaceChildren();
  }

  private syncAmbient(ambientParticles: AmbientParticle[]): void {
    const expectedLength = ambientParticles.length * 3;
    if (this.ambientPositionAttribute.array.length !== expectedLength) {
      this.scene.remove(this.ambientPoints);
      this.ambientGeometry.dispose();
      this.ambientGeometry = new BufferGeometry();
      this.ambientPositionAttribute = new BufferAttribute(new Float32Array(expectedLength), 3);
      this.ambientColorAttribute = new BufferAttribute(new Float32Array(expectedLength), 3);
      this.ambientGeometry.setAttribute('position', this.ambientPositionAttribute);
      this.ambientGeometry.setAttribute('color', this.ambientColorAttribute);
      this.ambientPoints = new Points(this.ambientGeometry, this.ambientMaterial);
      this.scene.add(this.ambientPoints);
    }

    ambientParticles.forEach((particle, index) => {
      this.ambientPositionAttribute.array.set(particle.position, index * 3);
      const color = toThreeColor(...particle.colorHsl, particle.alpha);
      this.ambientColorAttribute.array.set([color.r, color.g, color.b], index * 3);
    });

    this.ambientPositionAttribute.needsUpdate = true;
    this.ambientColorAttribute.needsUpdate = true;
  }

  private syncDynamic(particles: ParticleInstance[]): void {
    const count = Math.min(particles.length, MAX_DYNAMIC_PARTICLES);
    this.dynamicMesh.count = count;

    for (let index = 0; index < count; index += 1) {
      const particle = particles[index];
      tempPosition.set(...particle.position);
      tempScale.setScalar(particle.size);
      tempMatrix.compose(tempPosition, this.dynamicMesh.quaternion, tempScale);
      this.dynamicMesh.setMatrixAt(index, tempMatrix);
      this.dynamicMesh.setColorAt(index, toThreeColor(...particle.colorHsl, particle.alpha));
    }

    for (let index = count; index < this.dynamicMesh.count; index += 1) {
      tempMatrix.makeScale(0.0001, 0.0001, 0.0001);
      this.dynamicMesh.setMatrixAt(index, tempMatrix);
    }

    this.dynamicMesh.instanceMatrix.needsUpdate = true;
    if (this.dynamicMesh.instanceColor) {
      this.dynamicMesh.instanceColor.needsUpdate = true;
    }
  }

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
