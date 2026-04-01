import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
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
  DoubleSide,
  WireframeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { AmbientParticle, ParticleInstance, VisualSceneFrame } from '../../visual/types';
import { TERRAIN_SEGMENTS, TERRAIN_SIZE } from '../../visual/synthwaveTerrain.ts';

const MAX_DYNAMIC_PARTICLES = 1600;

const tempMatrix = new Matrix4();
const tempPosition = new Vector3();
const tempScale = new Vector3();
const hslColor = new Color();
const tempCameraPosition = new Vector3();
const tempCameraTarget = new Vector3();
const currentCameraTarget = new Vector3();

const toThreeColor = (hue: number, saturation: number, lightness: number, alpha: number): Color =>
  hslColor.clone().setHSL(hue, saturation, lightness * alpha + 0.05);

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
  private readonly skyGeometry = new PlaneGeometry(280, 120, 1, 5);
  private readonly skyMaterial = new MeshBasicMaterial({
    vertexColors: true,
    fog: false,
    side: DoubleSide,
    depthWrite: false,
  });
  private readonly skyBackdrop = new Mesh(this.skyGeometry, this.skyMaterial);
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
    this.scene.add(this.skyBackdrop);
    this.scene.add(this.hemiLight);
    this.scene.add(this.sunLight);
    this.scene.fog = new FogExp2(0x120012, 0.018);
    this.sunLight.position.set(0, 12, -48);

    const skyColors = new Float32BufferAttribute(new Float32Array(this.skyGeometry.attributes.position.count * 3), 3);
    this.skyGeometry.setAttribute('color', skyColors);
    this.skyBackdrop.position.set(0, 26, -118);

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
    this.skyGeometry.dispose();
    this.skyMaterial.dispose();
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
    const neonGridColor = accentColor.clone().lerp(new Color(0xcc00ff), 0.7);
    const terrainFillColor = new Color(0x04010a);
    const skyTopColor = frame.background.colorHsl ? toThreeColor(frame.background.colorHsl[0], 0.88, 0.42, 1) : new Color(0xbd158f);
    const skyMidColor = accentColor.clone().lerp(new Color(0xff4f8b), 0.58);
    const skyHorizonColor = new Color().setHSL(0.08, 0.95, 0.64);
    const skyBottomColor = new Color(0x07020f);
    const skyColors = this.skyGeometry.getAttribute('color');
    const skyPosition = this.skyGeometry.attributes.position;
    for (let index = 0; index < skyPosition.count; index += 1) {
      const normalizedHeight = MathUtils.clamp((skyPosition.getY(index) + 60) / 120, 0, 1);
      const color =
        normalizedHeight > 0.82
          ? skyTopColor
          : normalizedHeight > 0.48
            ? skyMidColor
            : normalizedHeight > 0.24
              ? skyHorizonColor
              : skyBottomColor;
      skyColors.setXYZ(index, color.r, color.g, color.b);
    }
    skyColors.needsUpdate = true;

    this.terrainFillMaterial.color.copy(terrainFillColor);
    this.terrainFillMaterial.emissive.copy(new Color(0x000000));
    this.terrainFillMaterial.opacity = 0.98;
    this.terrainWireMaterial.color.copy(neonGridColor);
    this.terrainWireMaterial.opacity = 0.72 + frame.ground.gridIntensity * 0.18;
    this.hemiLight.color.copy(skyHorizonColor.clone().lerp(new Color(0xff6ea8), 0.35));
    this.hemiLight.groundColor.copy(new Color(0x020106));
    this.hemiLight.intensity = 0.9;
    this.sunLight.color.copy(skyHorizonColor);
    this.sunLight.intensity = 0.72;

    const gridMaterial = Array.isArray(this.grid.material) ? this.grid.material[0] : this.grid.material;
    gridMaterial.opacity = 0;
    gridMaterial.color.copy(neonGridColor);

    this.grid.scale.setScalar(frame.ground.gridScale);
    this.grid.position.z = frame.ground.terrainOriginZ;
    this.terrainFill.position.z = frame.ground.terrainOriginZ;
    this.terrainWire.position.z = frame.ground.terrainOriginZ;

    const positions = this.terrainGeometry.attributes.position;
    const heightCount = Math.min(positions.count, frame.ground.terrainHeights.length);
    for (let index = 0; index < heightCount; index += 1) {
      positions.setZ(index, frame.ground.terrainHeights[index]);
    }
    positions.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
    this.terrainWireGeometry.dispose();
    this.terrainWireGeometry = new WireframeGeometry(this.terrainGeometry);
    this.terrainWire.geometry = this.terrainWireGeometry;

    this.sphereAnchor.visible = frame.ground.sphereAnchorVisible;
    this.sphereAnchor.scale.setScalar(frame.ground.sphereAnchorRadius);
    this.sphereAnchor.material.color.copy(skyHorizonColor.clone().lerp(new Color(0xff7c54), 0.45));
    this.sphereAnchor.material.opacity = 0.08;
    this.sphereAnchor.position.x = 0;
    this.sphereAnchor.position.y = 4;
    this.sphereAnchor.position.z = frame.camera.position[2] - 126;
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
