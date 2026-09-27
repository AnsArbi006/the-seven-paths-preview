import * as THREE from 'three';

// Original prototype meshes. No third-party model files are embedded here.
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .86, ...extra });
const skin = mat(0xd9ac83), darkSkin = mat(0x9e745e), cloak = mat(0x345f49), cloakLight = mat(0x527d58);
const leather = mat(0x6f4930), leatherLight = mat(0xa97a4d), linen = mat(0xb7a17b), steel = mat(0x9fa9a2, { metalness: .25, roughness: .55 });
const enemyCloth = mat(0x5e3c38), enemyArmor = mat(0x4d5552), enemyBone = mat(0xc0bca5);
const trunkMat = mat(0x5e4934), pineMats = [mat(0x2d5b45), mat(0x3b6a4a), mat(0x4a7653)];
const leafMats = [mat(0x4c7952), mat(0x699456), mat(0x7b9c5e)];

function mesh(parent, geometry, material, position, rotation) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  if (rotation) item.rotation.set(...rotation);
  parent.add(item);
  return item;
}

function limb(parent, from, to, radius, material) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const item = mesh(parent, new THREE.CylinderGeometry(radius * .82, radius, a.distanceTo(b), 7), material, a.clone().add(b).multiplyScalar(.5).toArray());
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  return item;
}

function tube(parent, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return mesh(parent, new THREE.TubeGeometry(curve, 14, radius, 5, false), material, [0, 0, 0]);
}

export function createArcher({ groundMarker = false } = {}) {
  const root = new THREE.Group();
  const figure = new THREE.Group(); root.add(figure);
  root.userData.walk = figure;

  // Boots and separate legs make the running silhouette legible from behind.
  for (const side of [-1, 1]) {
    limb(figure, [side * .19, .72, 0], [side * .22, .2, .04], .15, leather);
    mesh(figure, new THREE.BoxGeometry(.31, .21, .48), leather, [side * .22, .14, -.08]);
  }
  mesh(figure, new THREE.CylinderGeometry(.38, .48, .92, 8), cloak, [0, 1.12, 0]);
  mesh(figure, new THREE.ConeGeometry(.55, .62, 8), cloakLight, [0, .75, .17]);
  mesh(figure, new THREE.BoxGeometry(.72, .14, .54), leather, [0, .94, .03]);
  mesh(figure, new THREE.BoxGeometry(.19, .2, .59), steel, [.05, .93, -.01]);
  mesh(figure, new THREE.SphereGeometry(.31, 12, 10), skin, [0, 1.85, -.04]);
  // Hood is offset backward; the face stays visible in combat close-ups.
  mesh(figure, new THREE.ConeGeometry(.43, .56, 8), cloak, [0, 2.14, .10]);
  mesh(figure, new THREE.BoxGeometry(.56, .16, .27), cloak, [0, 1.89, .16]);
  for (const side of [-1, 1]) {
    limb(figure, [side * .42, 1.52, 0], [side * .61, 1.02, -.12], .13, cloak);
    mesh(figure, new THREE.SphereGeometry(.13, 8, 6), leatherLight, [side * .61, 1.01, -.12]);
    mesh(figure, new THREE.SphereGeometry(.2, 8, 6), leather, [side * .43, 1.57, 0]);
  }
  // A strung longbow, carried in the right hand rather than a torus placeholder.
  tube(figure, [[.72, .56, -.2], [.99, .83, -.26], [1.08, 1.31, -.3], [.99, 1.77, -.26], [.72, 2.06, -.2]], .055, leatherLight);
  limb(figure, [.72, .56, -.2], [.72, 2.06, -.2], .012, linen);
  mesh(figure, new THREE.BoxGeometry(.11, .34, .12), leather, [1.07, 1.30, -.3]);
  // Quiver and exposed arrow shafts on the opposite shoulder.
  const quiver = mesh(figure, new THREE.CylinderGeometry(.19, .14, .8, 8), leather, [-.34, 1.34, .37]);
  quiver.rotation.z = -.34;
  for (let i = 0; i < 4; i++) {
    limb(figure, [-.51 + i * .08, 1.53, .38], [-.61 + i * .08, 2.15 + (i % 2) * .07, .39], .018, linen);
    mesh(figure, new THREE.ConeGeometry(.07, .16, 5), cloakLight, [-.61 + i * .08, 2.21 + (i % 2) * .07, .39]);
  }
  if (groundMarker) {
    const ring = mesh(root, new THREE.RingGeometry(.65, .78, 30), new THREE.MeshBasicMaterial({ color: 0xe9db9e, side: THREE.DoubleSide, transparent: true, opacity: .78 }), [0, .04, 0], [-Math.PI / 2, 0, 0]);
    ring.renderOrder = 2;
  }
  return root;
}

export function createEnemy(kind = 'scout') {
  const root = new THREE.Group();
  const boss = kind === 'boss', horde = kind === 'horde';
  const scale = boss ? 1.38 : horde ? 1.15 : 1;
  root.scale.setScalar(scale);
  const color = boss ? enemyArmor : enemyCloth;
  for (const side of [-1, 1]) {
    limb(root, [side * .24, .72, 0], [side * .3, .18, .09], .19, enemyCloth);
    mesh(root, new THREE.BoxGeometry(.35, .24, .53), leather, [side * .3, .13, -.1]);
  }
  mesh(root, new THREE.CylinderGeometry(.52, .62, 1.05, 7), color, [0, 1.22, 0]);
  mesh(root, new THREE.BoxGeometry(1.16, .19, .62), enemyArmor, [0, 1.65, 0]);
  mesh(root, new THREE.BoxGeometry(.21, .21, .7), leatherLight, [0, .96, 0]);
  mesh(root, new THREE.SphereGeometry(.39, 10, 8), darkSkin, [0, 2.04, -.03]);
  mesh(root, new THREE.CylinderGeometry(.34, .45, .3, 8), enemyArmor, [0, 2.31, -.03]);
  mesh(root, new THREE.ConeGeometry(.43, .46, 8), enemyArmor, [0, 2.57, -.03]);
  for (const side of [-1, 1]) {
    limb(root, [side * .58, 1.56, 0], [side * .8, 1.04, -.08], .19, color);
    mesh(root, new THREE.SphereGeometry(.2, 8, 6), enemyArmor, [side * .61, 1.62, 0]);
    mesh(root, new THREE.SphereGeometry(.08, 7, 5), new THREE.MeshBasicMaterial({ color: 0xff745e }), [side * .15, 2.08, .35]);
    // Side horns distinguish the raider from the archer even at a distance.
    const horn = mesh(root, new THREE.ConeGeometry(.19, boss ? .8 : .48, 7), enemyBone, [side * .39, boss ? 2.72 : 2.52, 0]);
    horn.rotation.z = -side * .5;
  }
  if (boss) {
    tube(root, [[-.59, 2.48, 0], [-.88, 3.05, 0], [-1.04, 3.45, .1]], .13, enemyBone);
    tube(root, [[.59, 2.48, 0], [.88, 3.05, 0], [1.04, 3.45, .1]], .13, enemyBone);
    mesh(root, new THREE.BoxGeometry(1.1, .9, .3), mat(0x703b42), [0, 1.23, .44]);
  }
  // Weapon silhouette: staff/axe for the scout, heavier blade for the boss.
  limb(root, [.84, .75, -.1], [.9, 2.75, -.1], .065, leather);
  mesh(root, new THREE.BoxGeometry(boss ? .8 : .58, boss ? .75 : .52, .15), steel, [1.05, 2.66, -.1]);
  if (horde) mesh(root, new THREE.CylinderGeometry(.48, .48, .12, 9), steel, [-.85, 1.18, -.1], [Math.PI / 2, 0, 0]);
  return root;
}

export function createTree(kind = 'pine', scale = 1, colorIndex = 0) {
  const root = new THREE.Group(); root.scale.setScalar(scale);
  const dark = kind === 'dark-pine';
  mesh(root, new THREE.CylinderGeometry(.18, .31, 2.15, 7), trunkMat, [0, 1.05, 0]);
  if (kind === 'broadleaf') {
    for (const [x, y, z, radius] of [[0, 3.15, 0, 1.1],[-.7, 2.72, .2, .85],[.66, 2.83, -.13, .86],[.1, 3.67, -.2, .74]]) {
      const crown = mesh(root, new THREE.IcosahedronGeometry(radius, 1), leafMats[colorIndex % leafMats.length], [x, y, z]);
      crown.scale.y = .72;
    }
  } else {
    const leaf = dark ? pineMats[0] : pineMats[colorIndex % pineMats.length];
    for (const [radius, height, y] of [[1.12, 1.85, 2.28],[.91, 1.66, 3.07],[.68, 1.3, 3.81]]) {
      mesh(root, new THREE.ConeGeometry(radius, height, 7), leaf, [0, y, 0]);
    }
  }
  return root;
}

export function createGroundTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#6f8c62'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = Math.floor((Math.sin(i * 127.13) * 43758.5453 % 1 + 1) % 1 * 256);
    const y = Math.floor((Math.sin(i * 311.77) * 26147.1281 % 1 + 1) % 1 * 256);
    ctx.fillStyle = i % 3 === 0 ? '#88a275' : i % 3 === 1 ? '#5e7e5a' : '#78966c';
    ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 11 === 0 ? 2 : 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 6); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
