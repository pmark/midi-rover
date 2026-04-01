import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  FogExp2,
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
  Vector3,
  WebGLRenderer,
} from 'three';
import type { AmbientParticle, ParticleInstance, VisualSceneFrame } from '../../visual/types';
import { TERRAIN_COLUMNS, TERRAIN_DEPTH, TERRAIN_ROWS, TERRAIN_WIDTH } from '../../visual/synthwaveTerrain.ts';

const MAX_DYNAMIC_PARTICLES = 1600;
const TERRAIN_RING_SEGMENTS = 5;

const tempMatrix = new Matrix4();
const tempPosition = new Vector3();
const tempScale = new Vector3();
const hslColor = new Color();
const tempCameraPosition = new Vector3();
const tempCameraTarget = new Vector3();
const currentCameraTarget = new Vector3();
const tempForward = new Vector3();

interface TerrainSegmentView {
  geometry: PlaneGeometry;
  fill: Mesh;
  wireGeometry: BufferGeometry;
  wire: LineSegments;
}

const toThreeColor = (hue: number, saturation: number, lightness: number, alpha: number): Color =>
  hslColor.clone().setHSL(hue, saturation, lightness * alpha + 0.05);

const createTerrainGridGeometry = (): BufferGeometry => {
  const lineGeometry = new BufferGeometry();
  const segmentCount = TERRAIN_COLUMNS * (TERRAIN_ROWS + 1) + TERRAIN_ROWS * (TERRAIN_COLUMNS + 1);
  lineGeometry.setAttribute('position', new BufferAttribute(new Float32Array(segmentCount * 2 * 3), 3));

  return lineGeometry;
};

const updateTerrainGridGeometry = (surfaceGeometry: PlaneGeometry, lineGeometry: BufferGeometry): void => {
  const surfacePositions = surfaceGeometry.attributes.position;
  const linePositions = lineGeometry.getAttribute('position') as BufferAttribute;
  let cursor = 0;

  const writeVertex = (index: number): void => {
    linePositions.setXYZ(
      cursor,
      surfacePositions.getX(index),
      surfacePositions.getY(index),
      surfacePositions.getZ(index) + 0.08,
    );
    cursor += 1;
  };

  for (let row = 0; row <= TERRAIN_ROWS; row += 1) {
    for (let column = 0; column < TERRAIN_COLUMNS; column += 1) {
      const startIndex = row * (TERRAIN_COLUMNS + 1) + column;
      writeVertex(startIndex);
      writeVertex(startIndex + 1);
    }
  }

  for (let column = 0; column <= TERRAIN_COLUMNS; column += 1) {
    for (let row = 0; row < TERRAIN_ROWS; row += 1) {
      const startIndex = row * (TERRAIN_COLUMNS + 1) + column;
      writeVertex(startIndex);
      writeVertex(startIndex + TERRAIN_COLUMNS + 1);
    }
  }

  linePositions.needsUpdate = true;
  lineGeometry.computeBoundingSphere();
};

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
  private readonly skyGroup = new Group();
  private readonly groundGroup = new Group();
  private readonly terrainFillMaterial = new MeshStandardMaterial({
    color: 0x04010a,
    emissive: 0x08010f,
    emissiveIntensity: 0.16,
    roughness: 0.92,
    metalness: 0.04,
    transparent: true,
    opacity: 0.92,
    flatShading: false,
  });
  private readonly terrainWireMaterial = new LineBasicMaterial({
    color: 0x9f2cff,
    transparent: true,
    opacity: 0.9,
  });
  private readonly terrainSegments: TerrainSegmentView[] = Array.from({ length: TERRAIN_RING_SEGMENTS }, () => {
    const geometry = new PlaneGeometry(TERRAIN_WIDTH, TERRAIN_DEPTH, TERRAIN_COLUMNS, TERRAIN_ROWS);
    const fill = new Mesh(geometry, this.terrainFillMaterial);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = -5.3;
    const wireGeometry = createTerrainGridGeometry();
    updateTerrainGridGeometry(geometry, wireGeometry);
    const wire = new LineSegments(wireGeometry, this.terrainWireMaterial);
    wire.rotation.x = -Math.PI / 2;
    wire.position.y = -5.15;
    return { geometry, fill, wireGeometry, wire };
  });
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
    color: 0xffc24a,
    transparent: true,
    opacity: 0.96,
    fog: false,
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
    this.scene.add(this.skyGroup);
    this.scene.add(this.hemiLight);
    this.scene.add(this.sunLight);
    this.scene.fog = new FogExp2(0x160915, 0.009);
    this.sunLight.position.set(0, 20, -120);
    this.skyGroup.add(this.skyBackdrop);
    this.skyGroup.add(this.sphereAnchor);

    const skyColors = new Float32BufferAttribute(new Float32Array(this.skyGeometry.attributes.position.count * 3), 3);
    this.skyGeometry.setAttribute('color', skyColors);
    this.skyBackdrop.position.set(0, 26, -118);

    this.terrainSegments.forEach((segment) => {
      this.groundGroup.add(segment.fill);
      this.groundGroup.add(segment.wire);
    });

    this.sphereAnchor.position.set(0, 14, -156);

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
      fog.density = 0.012 + frame.background.fogStrength * 0.03 + frame.ground.terrainAmplitude * 0.0012;
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
    this.terrainFillMaterial.dispose();
    this.terrainWireMaterial.dispose();
    this.terrainSegments.forEach((segment) => {
      segment.geometry.dispose();
      segment.wireGeometry.dispose();
    });
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
    const neonGridColor = new Color(0x8a1cff);
    const terrainFillColor = new Color(0x04010a);
    const skyTopColor = new Color(0xbf1293);
    const skyMidColor = new Color(0xeb4d86);
    const skyHorizonColor = new Color(0xffb564);
    const skyBottomColor = new Color(0x140611);
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
    this.terrainFillMaterial.emissive.copy(new Color(0x090111));
    this.terrainFillMaterial.opacity = 0.98;
    this.terrainWireMaterial.color.copy(neonGridColor);
    this.terrainWireMaterial.opacity = 0.76 + frame.ground.gridIntensity * 0.18;
    this.hemiLight.color.copy(new Color(0xffd2ac));
    this.hemiLight.groundColor.copy(new Color(0x07090f));
    this.hemiLight.intensity = 0.95;
    this.sunLight.color.copy(new Color(0xffd88a));
    this.sunLight.intensity = 1.85;

    this.terrainSegments.forEach((segmentView, segmentIndex) => {
      const segmentFrame = frame.ground.terrainSegments[segmentIndex];
      segmentView.fill.visible = segmentFrame !== undefined;
      segmentView.wire.visible = segmentFrame !== undefined;
      if (!segmentFrame) {
        return;
      }

      segmentView.fill.position.z = segmentFrame.centerZ;
      segmentView.wire.position.z = segmentFrame.centerZ;

      const positions = segmentView.geometry.attributes.position;
      const heightCount = Math.min(positions.count, segmentFrame.heights.length);
      for (let index = 0; index < heightCount; index += 1) {
        positions.setZ(index, segmentFrame.heights[index]);
      }
      positions.needsUpdate = true;
      segmentView.geometry.computeVertexNormals();
      updateTerrainGridGeometry(segmentView.geometry, segmentView.wireGeometry);
    });

    this.sphereAnchor.visible = frame.ground.sphereAnchorVisible;
    this.sphereAnchor.scale.setScalar(frame.ground.sphereAnchorRadius);
    this.sphereAnchor.material.color.copy(new Color(0xffc24a));
    this.sphereAnchor.material.opacity = 0.96;
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

    tempForward.subVectors(currentCameraTarget, this.camera.position);
    tempForward.y = 0;
    if (tempForward.lengthSq() < 0.0001) {
      tempForward.set(0, 0, -1);
    } else {
      tempForward.normalize();
    }

    this.skyGroup.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.sphereAnchor.position.set(tempForward.x * 170, 13.5, tempForward.z * 170);
    this.sunLight.position.set(tempForward.x * 132, 24, tempForward.z * 132);
  }

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
