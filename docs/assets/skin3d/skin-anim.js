/* ==================================================================
   SUNRISE — animations du skin 3D (skinview3d)
   ------------------------------------------------------------------
   - respiration permanente (bras, tête, cape qui ondule)
   - la tête suit la souris
   - des « clips » joués au HASARD, jamais deux fois le même d'affilée,
     avec un temps de repos aléatoire entre chaque (pas de boucle)
   - double-clic sur le skin : un clip tout de suite
   Clips à poses clés interpolées en Catmull-Rom (mouvements fluides).
   Rotations en degrés, positions en pixels du modèle.
   ================================================================== */
(function () {
  "use strict";
  const D2R = Math.PI / 180;
  const REST_MIN = 4.0;   /* repos entre deux clips (secondes) */
  const REST_MAX = 9.0;

  /* --- interpolation Catmull-Rom d'une piste [[t,[x,y,z]], …] --- */
  function sample(track, t) {
    const n = track.length;
    if (t <= track[0][0]) return track[0][1];
    if (t >= track[n - 1][0]) return track[n - 1][1];
    let i = 0;
    while (i < n - 2 && t > track[i + 1][0]) i++;
    const p0 = track[Math.max(0, i - 1)][1], p1 = track[i][1];
    const p2 = track[i + 1][1], p3 = track[Math.min(n - 1, i + 2)][1];
    const u = (t - track[i][0]) / (track[i + 1][0] - track[i][0]);
    const u2 = u * u, u3 = u2 * u;
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
    }
    return out;
  }
  const Z = [0, 0, 0];

  /* ================= CLIPS ================= */
  const CLIPS = {
    /* VUE DE LA MAIN : lève le bras gauche devant soi, le regarde et le tourne */
    handView: {
      len: 3.8,
      rot: {
        leftArm: [[0, Z], [0.55, [-64, 10, -16]], [1.25, [-60, -24, -12]], [1.95, [-66, 22, -18]], [2.6, [-58, -6, -12]],
                  [3.2, [-12, 0, -2]], [3.8, Z]],
        rightArm: [[0, Z], [0.6, [4, 0, -5]], [2.8, [4, 0, -5]], [3.8, Z]],
        head: [[0, Z], [0.6, [24, 22, 10]], [1.3, [22, 16, 6]], [2.0, [26, 24, 12]], [2.7, [22, 18, 8]], [3.3, [4, 4, 1]], [3.8, Z]],
        body: [[0, Z], [0.6, [0, 12, 0]], [2.7, [0, 12, 0]], [3.8, Z]],
        rightLeg: [[0, Z], [0.7, [3, -8, 2]], [2.9, [3, -8, 2]], [3.8, Z]],
        leftLeg: [[0, Z], [0.7, [-1, -6, 0]], [2.9, [-1, -6, 0]], [3.8, Z]],
      },
    },
    /* VUE DE LA JAMBE : lève la jambe droite devant puis derrière, en la regardant */
    legView: {
      len: 3.6,
      rot: {
        rightLeg: [[0, Z], [0.5, [-30, 0, -8]], [1.0, [-26, -6, -8]], [1.45, [20, 0, -5]], [1.95, [24, 6, -5]],
                   [2.5, [-22, 0, -9]], [3.05, [-5, 0, -2]], [3.6, Z]],
        leftLeg: [[0, Z], [0.5, [3, 0, 1]], [3.0, [3, 0, 1]], [3.6, Z]],
        head: [[0, Z], [0.5, [40, -12, 4]], [1.0, [38, -16, 2]], [1.45, [34, -24, 0]], [1.95, [36, -20, 2]],
               [2.5, [42, -10, 5]], [3.1, [8, -2, 0]], [3.6, Z]],
        body: [[0, Z], [0.5, [3, -8, 0]], [2.6, [3, -8, 0]], [3.6, Z]],
        rightArm: [[0, Z], [0.5, [-26, 0, -14]], [1.45, [-18, 0, -18]], [2.5, [-28, 0, -14]], [3.2, [-4, 0, -2]], [3.6, Z]],
        leftArm: [[0, Z], [0.5, [10, 0, 10]], [2.6, [10, 0, 10]], [3.6, Z]],
      },
      pos: { root: [[0, Z], [0.5, [0, 0.35, 0]], [2.6, [0, 0.35, 0]], [3.6, Z]] },
    },
    /* VUE DE CÔTÉ : se tourne pour montrer un profil, puis l'autre */
    sideView: {
      len: 4.4,
      faceCam: true,
      rot: {
        /* ±90° = profil exact face à la caméra (corrigé selon l'angle de vue dans tick) */
        root: [[0, Z], [0.7, [0, -90, 0]], [1.6, [0, -88, 0]], [2.45, [0, 88, 0]], [3.35, [0, 90, 0]], [4.0, [0, 4, 0]], [4.4, Z]],
        head: [[0, Z], [0.7, [2, 18, -4]], [1.6, [0, 14, -2]], [2.45, [2, -18, 4]], [3.35, [0, -14, 2]], [4.4, Z]],
        rightArm: [[0, Z], [0.7, [-6, 0, -4]], [2.45, [6, 0, -4]], [3.35, [-6, 0, -4]], [4.4, Z]],
        leftArm: [[0, Z], [0.7, [6, 0, 4]], [2.45, [-6, 0, 4]], [3.35, [6, 0, 4]], [4.4, Z]],
        rightLeg: [[0, Z], [0.7, [4, 8, 0]], [2.45, [-3, 0, 0]], [3.35, [4, 8, 0]], [4.4, Z]],
        leftLeg: [[0, Z], [0.7, [-3, -6, 0]], [2.45, [3, 0, 0]], [3.35, [-3, -6, 0]], [4.4, Z]],
        cape: [[0, Z], [0.9, [10, 0, 0]], [2.2, [14, 0, 0]], [3.6, [8, 0, 0]], [4.4, Z]],
      },
    },
    /* salut de la main */
    wave: {
      len: 2.9,
      rot: {
        rightArm: [[0, Z], [0.35, [-12, 0, -128]], [0.62, [-14, 0, -160]], [0.9, [-14, 0, -132]], [1.18, [-14, 0, -160]],
                   [1.46, [-14, 0, -132]], [1.74, [-14, 0, -158]], [2.15, [-10, 0, -60]], [2.55, [-2, 0, -6]], [2.9, Z]],
        head: [[0, Z], [0.45, [-6, -10, -7]], [2.1, [-6, -10, -7]], [2.6, [-1, -2, -1]], [2.9, Z]],
        body: [[0, Z], [0.45, [0, -4, 2]], [2.1, [0, -4, 2]], [2.9, Z]],
        leftArm: [[0, Z], [0.45, [4, 0, 5]], [2.1, [4, 0, 5]], [2.9, Z]],
      },
    },
    /* tour sur soi-même */
    spin: {
      len: 1.9,
      rot: {
        root: [[0, Z], [0.22, [0, -14, 0]], [1.25, [0, 372, 0]], [1.6, [0, 360, 0]], [1.9, [0, 360, 0]]],
        rightArm: [[0, Z], [0.25, [0, 0, 4]], [0.75, [0, 0, -32]], [1.35, [0, 0, -6]], [1.9, Z]],
        leftArm: [[0, Z], [0.25, [0, 0, -4]], [0.75, [0, 0, 32]], [1.35, [0, 0, 6]], [1.9, Z]],
        cape: [[0, Z], [0.8, [38, 0, 0]], [1.4, [8, 0, 0]], [1.9, Z]],
        head: [[0, Z], [0.25, [6, 0, 0]], [0.8, [-6, 0, 0]], [1.9, Z]],
      },
      pos: { root: [[0, Z], [0.3, Z], [0.7, [0, 2.2, 0]], [1.1, Z], [1.9, Z]] },
    },
    /* saut */
    jump: {
      len: 1.45,
      rot: {
        rightArm: [[0, Z], [0.25, [32, 0, -6]], [0.5, [-150, 0, -14]], [0.78, [-60, 0, -10]], [1.0, [10, 0, -4]], [1.45, Z]],
        leftArm: [[0, Z], [0.25, [32, 0, 6]], [0.5, [-150, 0, 14]], [0.78, [-60, 0, 10]], [1.0, [10, 0, 4]], [1.45, Z]],
        rightLeg: [[0, Z], [0.5, [-14, 0, 0]], [0.8, [6, 0, 0]], [1.0, Z]],
        leftLeg: [[0, Z], [0.5, [12, 0, 0]], [0.8, [-4, 0, 0]], [1.0, Z]],
        head: [[0, Z], [0.25, [10, 0, 0]], [0.5, [-12, 0, 0]], [0.95, [6, 0, 0]], [1.45, Z]],
        cape: [[0, Z], [0.45, [-6, 0, 0]], [0.75, [45, 0, 0]], [1.05, [6, 0, 0]], [1.45, Z]],
      },
      pos: { root: [[0, Z], [0.22, [0, -0.9, 0]], [0.52, [0, 4.6, 0]], [0.84, Z], [0.95, [0, -0.7, 0]], [1.15, Z], [1.45, Z]] },
      crouch: [[0, [0, 0, 0]], [0.2, [0.45, 0, 0]], [0.36, [0, 0, 0]], [0.86, [0, 0, 0]], [0.96, [0.35, 0, 0]], [1.15, [0, 0, 0]], [1.45, [0, 0, 0]]],
    },
    /* coups de poing */
    hit: {
      len: 1.25,
      rot: {
        rightArm: [[0, Z], [0.14, [-35, 0, 8]], [0.26, [-108, 0, 2]], [0.4, [-38, 0, 8]], [0.54, [-108, 0, 2]], [0.8, [-35, 0, 4]], [1.25, Z]],
        leftArm: [[0, Z], [0.26, [16, 0, 6]], [0.54, [16, 0, 6]], [1.25, Z]],
        body: [[0, Z], [0.26, [0, -14, 0]], [0.4, [0, -6, 0]], [0.54, [0, -14, 0]], [1.0, [0, -2, 0]], [1.25, Z]],
        head: [[0, Z], [0.26, [4, -8, 0]], [0.54, [4, -8, 0]], [1.25, Z]],
      },
    },
    /* lancer (comme une boule de neige) */
    toss: {
      len: 1.75,
      rot: {
        rightArm: [[0, Z], [0.45, [60, 0, -12]], [0.62, [40, 0, -12]], [0.78, [-165, 0, -10]], [0.98, [-118, 0, -6]], [1.35, [-25, 0, -2]], [1.75, Z]],
        leftArm: [[0, Z], [0.45, [-35, 0, 10]], [0.78, [28, 0, 8]], [1.3, [6, 0, 2]], [1.75, Z]],
        body: [[0, Z], [0.45, [0, 18, 0]], [0.8, [0, -14, 0]], [1.3, [0, -3, 0]], [1.75, Z]],
        head: [[0, Z], [0.45, [6, 10, 0]], [0.85, [-18, -8, 0]], [1.35, [-12, -6, 0]], [1.75, Z]],
      },
      pos: { root: [[0, Z], [0.7, Z], [0.82, [0, 0.6, 0]], [1.0, Z], [1.75, Z]] },
    },
    /* s'accroupir */
    crouch: {
      len: 2.2,
      rot: { head: [[0, Z], [0.35, [12, 0, 0]], [1.55, [12, 0, 0]], [2.0, Z], [2.2, Z]] },
      crouch: [[0, [0, 0, 0]], [0.3, [1, 0, 0]], [1.6, [1, 0, 0]], [1.95, [0, 0, 0]], [2.2, [0, 0, 0]]],
    },
    /* regarder autour */
    look: {
      len: 3.4,
      rot: {
        head: [[0, Z], [0.55, [4, -50, 0]], [1.35, [6, -50, 0]], [2.05, [2, 46, 0]], [2.8, [4, 46, 0]], [3.4, Z]],
        body: [[0, Z], [0.55, [0, -10, 0]], [1.35, [0, -10, 0]], [2.05, [0, 9, 0]], [2.8, [0, 9, 0]], [3.4, Z]],
      },
    },
    /* haussement d'épaules */
    shrug: {
      len: 1.9,
      rot: {
        rightArm: [[0, Z], [0.35, [-25, 0, -32]], [1.25, [-25, 0, -32]], [1.75, Z], [1.9, Z]],
        leftArm: [[0, Z], [0.35, [-25, 0, 32]], [1.25, [-25, 0, 32]], [1.75, Z], [1.9, Z]],
        head: [[0, Z], [0.35, [-4, 0, 12]], [1.25, [-4, 0, 12]], [1.75, Z], [1.9, Z]],
      },
      pos: {
        rightArm: [[0, Z], [0.35, [0, 0.9, 0]], [1.25, [0, 0.9, 0]], [1.75, Z], [1.9, Z]],
        leftArm: [[0, Z], [0.35, [0, 0.9, 0]], [1.25, [0, 0.9, 0]], [1.75, Z], [1.9, Z]],
      },
    },
  };
  /* animations jouées au hasard (les autres restent disponibles via play()) */
  const CLIP_NAMES = ["handView", "legView", "sideView"];

  /* pose accroupie (valeurs du mode « sneak » de skinview3d), pondérée par w */
  function applyCrouch(p, w) {
    if (w <= 0) return;
    const s = p.skin;
    s.body.rotation.x += 0.4538 * w;
    s.body.position.z += -2.1244 * w;
    s.body.position.y += -2.1037 * w;
    s.head.position.y += -3.6183 * w;
    s.leftArm.position.z += 0.1683 * w;
    s.rightArm.position.z += 0.1683 * w;
    s.leftArm.rotation.x += 0.4104 * w;
    s.rightArm.rotation.x += 0.4104 * w;
    s.leftArm.position.y += -2.5394 * w;
    s.rightArm.position.y += -2.5394 * w;
    s.rightLeg.position.z += -3.45 * w;
    s.leftLeg.position.z += -3.45 * w;
    p.cape.position.y += -1.8512 * w;
    p.cape.rotation.x += 0.2942 * w;
    p.cape.position.z += 0.3366 * w;
  }


  /* ================================================================
     ANIMATIONS BLOCKBENCH (skin-bbanims.js) — « idle » en boucle,
     « run » pendant le lancement du jeu ou au double-clic.
     Hiérarchie du modèle : Waist (pivot y=12) → tête, corps, bras ;
     jambes indépendantes. Blockbench regarde vers -Z, skinview3d vers +Z :
     rotation (x, -y, -z), position (x, y, -z), ordre ZYX.
     ================================================================ */
  const BB = window.SUNRISE_BB_ANIMS || null;
  const WAIST_KIDS = ["head", "body", "rightArm", "leftArm"];
  const ALL_PARTS = ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"];
  const ONE = [1, 1, 1];
  /* positions de repos skinview3d (resetJoints ne remet pas toutes les coordonnées à zéro) */
  const REST = {
    head: [0, 0, 0], body: [0, -6, 0],
    rightArm: [-5, -2, 0], leftArm: [5, -2, 0],
    rightLeg: [-1.9, -12, -0.1], leftLeg: [1.9, -12, -0.1],
  };

  function bbGet(anim, bone, ch, t, def) {
    const tr = anim.bones[bone] && anim.bones[bone][ch];
    return tr && tr.length ? sample(tr, t) : def;
  }
  /* pose absolue (skin-local) de chaque membre pour une animation à l'instant t */
  function bbPose(p, anim, t) {
    const S = p.skin;
    const V = S.head.position.constructor, Q = S.head.quaternion.constructor, E = S.head.rotation.constructor;
    const eul = (r) => new E(r[0] * D2R, -r[1] * D2R, -r[2] * D2R, "ZYX");
    const wr = bbGet(anim, "waist", "rotation", t, Z);
    const wp = bbGet(anim, "waist", "position", t, Z);
    const ws = bbGet(anim, "waist", "scale", t, ONE);
    const qW = new Q().setFromEuler(eul(wr));
    const P = new V(0, -12, 0);
    const tW = new V(wp[0], wp[1], -wp[2]);
    const sW = new V(ws[0], ws[1], ws[2]);
    const pose = {};
    for (const name of ALL_PARTS) {
      const part = S[name];
      const r = bbGet(anim, name, "rotation", t, Z);
      const q = bbGet(anim, name, "position", t, Z);
      const sc = bbGet(anim, name, "scale", t, ONE);
      const R = REST[name];
      const base = new V(R[0] + q[0], R[1] + q[1], R[2] - q[2]);
      const qc = new Q().setFromEuler(eul(r));
      if (WAIST_KIDS.includes(name)) {
        const local = base.sub(P).multiply(sW).applyQuaternion(qW);
        pose[name] = { pos: P.clone().add(tW).add(local), quat: qW.clone().multiply(qc), scale: new V(sW.x * sc[0], sW.y * sc[1], sW.z * sc[2]) };
      } else {
        pose[name] = { pos: base, quat: qc, scale: new V(sc[0], sc[1], sc[2]) };
      }
    }
    /* la cape suit la taille (elle est accrochée dans le dos) */
    const capeRest = new V(0, 8, -2).sub(S.position);
    const capeLocal = capeRest.sub(P).multiply(sW).applyQuaternion(qW);
    const capeBase = new Q().setFromEuler(new E(0.06 * Math.PI, Math.PI, 0, "XYZ"));
    const capeQ = capeBase.clone().slerp(qW.clone().multiply(capeBase), 0.6);
    pose.cape = { pos: P.clone().add(tW).add(capeLocal).add(S.position), quat: capeQ };
    return pose;
  }
  function bbBlend(a, b, w) {
    if (!b || w <= 0) return a;
    if (w >= 1) return b;
    const out = {};
    for (const k of Object.keys(a)) {
      out[k] = { pos: a[k].pos.clone().lerp(b[k].pos, w), quat: a[k].quat.clone().slerp(b[k].quat, w) };
      if (a[k].scale) out[k].scale = a[k].scale.clone().lerp(b[k].scale, w);
    }
    return out;
  }
  function bbApply(p, pose) {
    for (const name of ALL_PARTS) {
      const part = p.skin[name], ps = pose[name];
      part.position.copy(ps.pos);
      part.quaternion.copy(ps.quat);
      part.scale.copy(ps.scale);
    }
    p.cape.position.copy(pose.cape.pos);
    p.cape.quaternion.copy(pose.cape.quat);
  }

  /* --- souris (partagée par tous les viewers) --- */
  const mouse = { x: 0, y: 0, last: 0 };
  window.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.last = performance.now(); }, { passive: true });

  function boneOf(p, name) {
    if (name === "root") return p;
    if (name === "cape") return p.cape;
    return p.skin[name];
  }

  class Controller {
    constructor(viewer, opts = {}) {
      this.v = viewer;
      this.headTrack = opts.headTrack !== false;
      this.time = 0;
      this.clip = null;
      this.clipT = 0;
      this.last = null;
      this.rest = 1.5 + Math.random() * 2.5;   /* premier clip assez vite */
      this.look = { yaw: 0, pitch: 0 };
      this.trackW = 1;
      /* Blockbench : idle démarre à un instant au hasard, run en fondu */
      this.bbT = BB && BB.idle ? Math.random() * BB.idle.len : 0;
      this.runT = 0;
      this.runW = 0;        /* poids de « run » (0 → 1) */
      this.runUntil = 0;    /* course temporaire (double-clic) */
    }
    playRandom() {
      const pool = CLIP_NAMES.filter((n) => n !== this.last);
      this.play(pool[Math.floor(Math.random() * pool.length)]);
    }
    play(name) {
      if (!CLIPS[name]) return;
      this.clip = name;
      this.clipT = 0;
      this.last = name;
    }
    tick(p, dt) {
      dt = Math.min(dt || 0, 0.1);
      this.time += dt;
      const t = this.time;

      /* pose neutre */
      p.resetJoints();
      p.position.set(0, 0, 0);
      p.rotation.set(0, 0, 0);
      for (const n of ALL_PARTS) p.skin[n].scale.set(1, 1, 1);
      /* coordonnées que resetJoints oublie : sans ça elles dérivent d'image en image */
      p.skin.head.position.set(0, 0, 0);
      p.skin.body.position.x = 0;
      p.cape.position.x = 0;
      p.cape.rotation.y = Math.PI;   /* skinview3d construit la cape retournée */
      p.cape.rotation.z = 0;

      /* ---- animations Blockbench (si présentes) ---- */
      if (BB && BB.idle) {
        try {
          const wantRun = (RUNNING || this.time < this.runUntil) && BB.run;
          this.runW += ((wantRun ? 1 : 0) - this.runW) * Math.min(1, dt * 6);
          this.bbT = (this.bbT + dt) % BB.idle.len;
          let pose = bbPose(p, BB.idle, this.bbT);
          if (this.runW > 0.01 && BB.run) {
            this.runT = (this.runT + dt) % BB.run.len;
            pose = bbBlend(pose, bbPose(p, BB.run, this.runT), this.runW);
          }
          bbApply(p, pose);
          /* la cape flotte un peu, et s'envole quand il court */
          const flap = 0.02 * Math.sin(this.time * 1.7) + this.runW * (0.45 + 0.08 * Math.sin(this.time * 14));
          if (flap) {
            const Qc = p.cape.quaternion.constructor, Ec = p.cape.rotation.constructor;
            p.cape.quaternion.multiply(new Qc().setFromEuler(new Ec(-flap, 0, 0)));
          }
          this.trackHead(p, dt, this.runW > 0.5);
          return;
        } catch (e) { /* données invalides : on retombe sur les animations intégrées */ }
      }

      /* respiration + cape au vent */
      const b = Math.sin(t * 1.7);
      p.skin.leftArm.rotation.z = 0.035 * Math.cos(t * 1.7) + 0.02 * Math.PI;
      p.skin.rightArm.rotation.z = 0.035 * Math.cos(t * 1.7 + Math.PI) - 0.02 * Math.PI;
      p.skin.head.rotation.x = 0.018 * b;
      p.skin.body.position.y += 0.06 * b;
      p.cape.rotation.x += 0.03 * Math.sin(t * 1.3) + 0.015 * Math.sin(t * 3.1);

      /* clip en cours, ou repos puis tirage au hasard */
      let playing = false;
      if (this.clip) {
        const c = CLIPS[this.clip];
        this.clipT += dt;
        if (this.clipT >= c.len) {
          this.clip = null;
          this.rest = REST_MIN + Math.random() * (REST_MAX - REST_MIN);
        } else {
          playing = true;
          const ct = this.clipT;
          for (const [bone, tr] of Object.entries(c.rot || {})) {
            const o = boneOf(p, bone); if (!o) continue;
            const r = sample(tr, ct);
            o.rotation.x += r[0] * D2R; o.rotation.y += r[1] * D2R; o.rotation.z += r[2] * D2R;
          }
          for (const [bone, tr] of Object.entries(c.pos || {})) {
            const o = boneOf(p, bone); if (!o) continue;
            const q = sample(tr, ct);
            o.position.x += q[0]; o.position.y += q[1]; o.position.z += q[2];
          }
          if (c.crouch) applyCrouch(p, Math.max(0, sample(c.crouch, ct)[0]));
          /* tourner par rapport à la caméra : un vrai profil, quel que soit l'angle de vue */
          if (c.faceCam) {
            const cam = this.v.camera.position;
            const wrapYaw = this.v.playerWrapper ? this.v.playerWrapper.rotation.y : 0;
            const camYaw = Math.atan2(cam.x, cam.z) - wrapYaw;
            const w = Math.min(1, Math.abs(sample(c.rot.root, ct)[1]) / 90);
            p.rotation.y += camYaw * w;
          }
        }
      } else if (!document.hidden) {
        this.rest -= dt;
        if (this.rest <= 0) this.playRandom();
      }

      this.trackHead(p, dt, playing);
    }
    /* la tête suit la souris (atténuée pendant un clip ou une course) */
    trackHead(p, dt, busy) {
      this.trackW += ((busy ? 0.3 : 0.75) - this.trackW) * Math.min(1, dt * 4);
      let ty = 0, tp = 0;
      const active = HEAD_ON && this.headTrack && performance.now() - mouse.last < 5000;
      if (active) {
        const rect = this.v.canvas.getBoundingClientRect();
        if (rect.width) {
          const cx = rect.left + rect.width / 2, cy = rect.top + rect.height * 0.32;
          const cam = this.v.camera.position;
          const wrapYaw = this.v.playerWrapper ? this.v.playerWrapper.rotation.y : 0;
          const camYaw = Math.atan2(cam.x, cam.z) - wrapYaw;
          const dx = (mouse.x - cx) / Math.max(320, rect.width);
          const dy = (mouse.y - cy) / Math.max(320, rect.height);
          ty = camYaw + Math.atan(dx * 2.2);
          tp = Math.atan(dy * 1.6);
          /* ramène l'angle dans [-π, π] puis limite */
          ty = Math.atan2(Math.sin(ty), Math.cos(ty));
          ty = Math.max(-0.9, Math.min(0.9, ty));
          tp = Math.max(-0.45, Math.min(0.5, tp));
        }
      }
      const k = Math.min(1, dt * 5);
      this.look.yaw += (ty - this.look.yaw) * k;
      this.look.pitch += (tp - this.look.pitch) * k;
      const head = p.skin.head;
      const Q = head.quaternion.constructor, E = head.rotation.constructor;
      head.quaternion.multiply(new Q().setFromEuler(new E(this.look.pitch * this.trackW, this.look.yaw * this.trackW, 0, "YXZ")));
    }
  }

  let RUNNING = false;
  let HEAD_ON = (() => { try { return localStorage.getItem("sunrise-head-track") !== "0"; } catch (_) { return true; } })();   /* vrai pendant le lancement de Minecraft */
  const CTRLS = [];
  function attach(viewer, opts) {
    if (!viewer || !window.skinview3d?.FunctionAnimation) return null;
    const ctrl = new Controller(viewer, opts);
    viewer.animation = new skinview3d.FunctionAnimation((player, _progress, delta) => ctrl.tick(player, delta));
    viewer.canvas.addEventListener("dblclick", () => {
      if (BB && BB.run) ctrl.runUntil = ctrl.time + 1.6;
      else ctrl.playRandom();
    });
    viewer.__sunriseAnim = ctrl;
    CTRLS.push(ctrl);
    return ctrl;
  }

  window.SunriseAnim = { attach, clips: CLIP_NAMES, controllers: CTRLS, setRunning: (on) => { RUNNING = !!on; },
    setHeadTrack: (on) => { HEAD_ON = !!on; try { localStorage.setItem("sunrise-head-track", on ? "1" : "0"); } catch (_) {} } };
})();
