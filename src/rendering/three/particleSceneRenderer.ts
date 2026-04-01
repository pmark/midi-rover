import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  FogExp2,
  GridHelper,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  DirectionalLight,
  WireframeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { AmbientParticle, ParticleInstance, VisualSceneFrame } from '../../visual/types';

const MAX_DYNAMIC_PARTICLES = 1600;
const TERRAIN_SIZE = 120;
const TERRAIN_SEGMENTS = 72;

const tempMatrix = new Matrix4();
const tempPosition = new Vector3();
const tempScale = new Vector3();
const hslColor = new Color();
const tempCameraPosition = new Vector3();
const tempCameraTarget = new Vector3();
const currentCameraTarget = new Vector3();

const toThreeColor = (hue: number, saturation: number, lightness: number, alpha: number): Color =>
  hslColor.clone().setHSL(hue, saturation, lightness * alpha + 0.05);

const fract = (value: number): number => value - Math.floor(value);

const valueNoise = (x: number, z: number): number => {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const localX = fract(x);
  const localZ = fract(z);
  const smoothX = localX * localX * (3 - 2 * localX);
  const smoothZ = localZ * localZ * (3 - 2 * localZ);
  const corner = (offsetX: number, offsetZ: number): number => {
    const hash = Math.sin((cellX + offsetX) * 127.1 + (cellZ + offsetZ) * 311.7) * 43758.5453123;
    return fract(hash);
  };
  const top = MathUtils.lerp(corner(0, 0), corner(1, 0), smoothX);
  const bottom = MathUtils.lerp(corner(0, 1), corner(1, 1), smoothX);
  return MathUtils.lerp(top, bottom, smoothZ) * 2 - 1;
};

const fractalNoise = (x: number, z: number): number =>
  valueNoise(x, z) * 0.55 + valueNoise(x * 2.1, z * 2.1) * 0.3 + valueNoise(x * 4.3, z * 4.3) * 0.15;

export class ParticleSceneRenderer {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1, 0.1, 220);
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
  private readonly groundGroup = new Group();
  private readonly grid = new GridHelper(TERRAIN_SIZE, 36, 0x8fd7ff, 0x315d68);
  private readonly terrainGeometry = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  private readonly terrainFillMaterial = new MeshStandardMaterial({
    color: 0x16061e,
    emissive: 0x1a0624,
    emissiveIntensity: 0.42,
    roughness: 0.88,
    metalness: 0.08,
    transparent: true,
    opacity: 0.92,
    flatShading: false,
  });
  private readonly terrainFill = new Mesh(this.terrainGeometry, this.terrainFillMaterial);
  private terrainWireGeometry = new WireframeGeometry(this.terrainGeometry);
  private readonly terrainWireMaterial = new LineBasicMaterial({
    color: 0x63f3ff,
    transparent: true,
    opacity: 0.68,
  });
  private readonly terrainWire = new LineSegments(this.terrainWireGeometry, this.terrainWireMaterial);
  private readonly sphereAnchorGeometry = new SphereGeometry(1, 32, 24);
  private readonly sphereAnchorMaterial = new MeshBasicMaterial({
    color: 0x7a2d91,
    transparent: true,
    opacity: 0.26,
    wireframe: true,
  });
  private readonly sphereAnchor = new Mesh(this.sphereAnchorGeometry, this.sphereAnchorMaterial);
  private readonly hemiLight = new HemisphereLight(0x6ddcff, 0x120015, 1.05);
  private readonly sunLight = new DirectionalLight(0xff8bd8, 1.7);
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
    this.scene.add(this.groundGroup);
    this.scene.add(this.hemiLight);
    this.scene.add(this.sunLight);
    this.scene.fog = new FogExp2(0x050b10, 0.06);
    this.sunLight.position.set(-14, 18, 10);

    this.grid.position.y = -4.4;
    const gridMaterial = Array.isArray(this.grid.material) ? this.grid.material[0] : this.grid.material;
    gridMaterial.transparent = true;
    this.groundGroup.add(this.grid);

    this.terrainFill.rotation.x = -Math.PI / 2;
    this.terrainFill.position.y = -5.3;
    this.groundGroup.add(this.terrainFill);

    this.terrainWire.rotation.x = -Math.PI / 2;
    this.terrainWire.position.y = -5.15;
    this.groundGroup.add(this.terrainWire);

    this.sphereAnchor.position.set(0, -16, -64);
    this.groundGroup.add(this.sphereAnchor);

    this.camera.position.set(0, 2.5, 16);
    currentCameraTarget.set(0, 0, 0);

    this.host.append(this.renderer.domElement);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
  }

  public render(frame: VisualSceneFrame): void {
    this.syncAmbient(frame.ambientParticles);
    this.syncDynamic(frame.particles);
    this.syncGround(frame);
    this.syncCamera(frame);

    const backgroundColor = toThreeColor(...frame.background.colorHsl, 1);
    this.renderer.setClearColor(backgroundColor, 1);
    const fog = this.scene.fog;
    if (fog instanceof FogExp2) {
      fog.color.copy(backgroundColor);
      fog.density = 0.024 + frame.background.fogStrength * 0.05 + frame.ground.terrainAmplitude * 0.002;
    }

    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.resizeObserver.disconnect();
    this.dynamicGeometry.dispose();
    this.dynamicMaterial.dispose();
    this.ambientGeometry.dispose();
    this.ambientMaterial.dispose();
    this.terrainGeometry.dispose();
    this.terrainFillMaterial.dispose();
    this.terrainWireGeometry.dispose();
    this.terrainWireMaterial.dispose();
    this.sphereAnchorGeometry.dispose();
    this.sphereAnchorMaterial.dispose();
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

    this.dynamicMesh.instanceMatrix.needsUpdate = true;
    if (this.dynamicMesh.instanceColor) {
      this.dynamicMesh.instanceColor.needsUpdate = true;
    }
  }

  private syncGround(frame: VisualSceneFrame): void {
    const accentColor = toThreeColor(...frame.ground.accentColorHsl, 1);
    const neonGridColor = accentColor.clone().lerp(new Color(0x6cf7ff), 0.55);
    const terrainFillColor = accentColor.clone().lerp(new Color(0x120015), 0.84);
    this.terrainFillMaterial.color.copy(terrainFillColor);
    this.terrainFillMaterial.emissive.copy(accentColor.clone().multiplyScalar(0.2));
    this.terrainFillMaterial.opacity = 0.84;
    this.terrainWireMaterial.color.copy(neonGridColor);
    this.terrainWireMaterial.opacity = 0.5 + frame.ground.gridIntensity * 0.34;
    this.hemiLight.color.copy(neonGridColor);
    this.hemiLight.groundColor.copy(terrainFillColor.clone().multiplyScalar(0.9));
    this.sunLight.color.copy(accentColor.clone().lerp(new Color(0xffd36c), 0.28));
    this.sunLight.intensity = 1.3 + frame.ground.gridIntensity * 0.8;

    const gridMaterial = Array.isArray(this.grid.material) ? this.grid.material[0] : this.grid.material;
    gridMaterial.opacity = 0.32 + frame.ground.gridIntensity * 0.3;
    gridMaterial.color.copy(neonGridColor);

    this.grid.scale.setScalar(frame.ground.gridScale);
    this.grid.position.z = frame.ground.terrainScroll * 4;

    const positions = this.terrainGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getY(index);
      const normalizedDepth = MathUtils.clamp((z + TERRAIN_SIZE * 0.5) / TERRAIN_SIZE, 0, 1);
      const horizonLift = Math.pow(1 - normalizedDepth, 2.2);
      const ridgeNoise = Math.abs(
        fractalNoise(
          x * frame.ground.terrainFrequency + frame.ground.terrainScroll,
          z * frame.ground.terrainFrequency * 0.72,
        ),
      );
      const secondaryNoise = fractalNoise(
        x * frame.ground.terrainFrequency + frame.ground.terrainScroll,
        z * frame.ground.terrainFrequency * 0.22 + 18.5,
      );
      const ridgedMountain = Math.pow(ridgeNoise, 1.85) * frame.ground.terrainAmplitude * 3.8;
      const valleyCarve = secondaryNoise * frame.ground.terrainAmplitude * 0.28;
      const baseShelf = (1 - normalizedDepth) * 0.8;
      positions.setZ(index, ridgedMountain * horizonLift - valleyCarve - baseShelf);
    }
    positions.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
    this.terrainWireGeometry.dispose();
    this.terrainWireGeometry = new WireframeGeometry(this.terrainGeometry);
    this.terrainWire.geometry = this.terrainWireGeometry;

    this.sphereAnchor.visible = frame.ground.sphereAnchorVisible;
    this.sphereAnchor.scale.setScalar(frame.ground.sphereAnchorRadius);
    this.sphereAnchor.material.color.copy(accentColor.clone().lerp(new Color(0xff5ea8), 0.5));
    this.sphereAnchor.position.x = frame.camera.position[0] * 0.22;
    this.sphereAnchor.position.y = -10;
    this.sphereAnchor.position.z = frame.camera.position[2] - 84;
  }

  private syncCamera(frame: VisualSceneFrame): void {
    tempCameraPosition.set(...frame.camera.position);
    tempCameraTarget.set(...frame.camera.target);

    this.camera.position.lerp(tempCameraPosition, 0.08);
    currentCameraTarget.lerp(tempCameraTarget, 0.12);
    this.camera.fov = MathUtils.lerp(this.camera.fov, frame.camera.fieldOfViewDegrees, 0.08);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(currentCameraTarget);
    this.camera.rotation.z = MathUtils.lerp(this.camera.rotation.z, frame.camera.rollRadians, 0.08);
  }

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
