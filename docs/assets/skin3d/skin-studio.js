/* ==================================================================
   SUNRISE — Studio de skins
   · Bibliothèque  : galerie MineSkin (sans clé) + skin d'un joueur
   · Créateur      : skin assemblé pièce par pièce (peau, yeux, cheveux,
                     haut, bas, chaussures, accessoires), rendu 3D en direct
   · Cosmétiques   : chapeaux 3D portés sur le skin (launcher), état publié
                     pour les autres joueurs SUNRISE (mod en jeu)
   Dépend de : skinview3d, SunriseAnim (skin-anim.js), script.js
   (SAPI, MODE, VIEWERS, session, toast, setViewerAngle, refreshDoll…)
   ================================================================== */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const api = () => (typeof SAPI !== "undefined" ? SAPI : window.sunrise) || null;
  const say = (m, ms) => (typeof toast === "function" ? toast(m, ms) : console.log(m));
  const isMsa = () => typeof session !== "undefined" && session?.type === "msa";

  /* ================================================================
     1. OUTILS COULEUR + RENDU 2D D'UN SKIN (vignettes)
     ================================================================ */
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v | 0;
  const mul = (c, k) => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];
  const mix = (a, b, t) => [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

  /* vue de face 2D d'un skin (tête + corps + bras + jambes, avec calques) */
  function frontRender(img, scale = 4, slim = null) {
    const c = document.createElement("canvas");
    c.width = 16 * scale; c.height = 32 * scale;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    const old = img.height === 32;
    if (slim === null) slim = !old && isSlimImage(img);
    const aw = slim ? 3 : 4;
    const blit = (sx, sy, w, h, dx, dy, flip = false) => {
      if (flip) {
        g.save(); g.translate((dx + w) * scale, dy * scale); g.scale(-1, 1);
        g.drawImage(img, sx, sy, w, h, 0, 0, w * scale, h * scale); g.restore();
      } else g.drawImage(img, sx, sy, w, h, dx * scale, dy * scale, w * scale, h * scale);
    };
    /* jambes, corps, bras, tête (base puis calque) */
    blit(4, 20, 4, 12, 4, 20);                       /* jambe droite */
    if (old) blit(4, 20, 4, 12, 8, 20, true); else blit(20, 52, 4, 12, 8, 20);
    blit(20, 20, 8, 12, 4, 8);                       /* corps */
    blit(44, 20, aw, 12, 4 - aw, 8);                 /* bras droit */
    if (old) blit(44, 20, aw, 12, 12, 8, true); else blit(36, 52, aw, 12, 12, 8);
    blit(8, 8, 8, 8, 4, 0);                          /* tête */
    if (!old) {
      blit(4, 36, 4, 12, 4, 20); blit(4, 52, 4, 12, 8, 20);
      blit(20, 36, 8, 12, 4, 8);
      blit(44, 36, aw, 12, 4 - aw, 8); blit(52, 52, aw, 12, 12, 8);
    }
    blit(40, 8, 8, 8, 4, 0);                         /* chapeau */
    return c;
  }
  function isSlimImage(img) {
    try {
      const c = document.createElement("canvas"); c.width = 64; c.height = 64;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      return g.getImageData(54, 20, 1, 1).data[3] === 0 && g.getImageData(55, 31, 1, 1).data[3] === 0;
    } catch { return false; }
  }
  /* vrai skin complet ? (MineSkin mélange des textures de têtes : corps vide) */
  function isFullSkin(img) {
    try {
      if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) return false;
      const c = document.createElement("canvas"); c.width = 64; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const opaque = (x, y, w, h) => { const d = g.getImageData(x, y, w, h).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (w * h); };
      const body = opaque(20, 20, 8, 12), leg = opaque(4, 20, 4, 12), arm = opaque(44, 20, 3, 12), head = opaque(8, 8, 8, 8);
      if (body < .9 || leg < .9 || arm < .9 || head < .9) return false;
      /* corps d'une seule couleur unie = texture de tête/bloc déguisée */
      const d = g.getImageData(20, 20, 8, 12).data; const set = new Set();
      for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3));
      return set.size >= 2;
    } catch { return false; }
  }
  const loadImg = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
  /* une page de skins MineSkin, seulement les skins complets (textures chargées) */
  async function fullSkinsPage(filter, after, alive = () => true, onItem = null) {
    const A = api();
    if (!A?.skinsList) return { ok: false, error: "Disponible dans le launcher.", items: [], after: false };
    const r = await A.skinsList({ after: after || "", filter, size: 30 });
    if (!r?.ok) return { ok: false, error: r?.error, items: [], after: false };
    if (r.blocked) return { ok: false, error: "Recherche refusée par MineSkin.", items: [], after: false };
    const list = r.skins, out = new Array(list.length).fill(null);
    let i = 0;
    const worker = async () => {
      while (i < list.length && alive()) {
        const k = i++, s = list[k];
        try {
          const t = await A.skinsTexture(s.texture);
          if (!t?.ok) continue;
          const img = await loadImg(t.data);
          if (!isFullSkin(img)) continue;
          SRC.set(s.texture, img);
          out[k] = { ...s, data: t.data, img, slim: img.height === 64 && isSlimImage(img) };
          onItem?.(out[k]);
        } catch (_) {}
      }
    };
    await Promise.all(Array.from({ length: 12 }, worker));
    return { ok: true, items: out.filter(Boolean), after: r.after || false };
  }

  /* ================================================================
     2. GÉNÉRATEUR DE SKIN (créateur)
     Chaque pixel de la texture 64×64 connaît sa pièce (tête, corps…),
     sa face (devant, côté…) et sa hauteur depuis les pieds : les
     vêtements sont décrits par zones de hauteur, donc cohérents sur
     toutes les faces. Ombrage par face + grain léger = rendu propre.
     ================================================================ */
  const PARTS = {
    head: { base: [0, 0], over: [32, 0], w: 8, h: 8, d: 8, y0: 24 },
    body: { base: [16, 16], over: [16, 32], w: 8, h: 12, d: 4, y0: 12 },
    rarm: { base: [40, 16], over: [40, 32], w: 4, h: 12, d: 4, y0: 12 },
    larm: { base: [32, 48], over: [48, 48], w: 4, h: 12, d: 4, y0: 12 },
    rleg: { base: [0, 16], over: [0, 32], w: 4, h: 12, d: 4, y0: 0 },
    lleg: { base: [16, 48], over: [0, 48], w: 4, h: 12, d: 4, y0: 0 },
  };
  const FACE_LIGHT = { front: 1, back: .86, right: .92, left: .92, top: 1.08, bottom: .78 };
  function faceRects(o, w, h, d) {
    const [u, v] = o;
    return {
      top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
      right: [u, v + d, d, h], front: [u + d, v + d, w, h],
      left: [u + d + w, v + d, d, h], back: [u + d + w + d, v + d, w, h],
    };
  }

  const PAL = {
    skin: ["#f7dcc8", "#efc4a4", "#e2ad88", "#cf9068", "#b07550", "#8f5a3a", "#6e4229", "#4c2c1b"],
    eyes: ["#4a2f1e", "#2f6fd6", "#3c8d3c", "#6c7a86", "#8a6a2f", "#7b4fc9", "#c23b3b", "#1d1d1d"],
    hair: ["#1f1a17", "#3b2618", "#6b4528", "#8a4b2a", "#d9b25f", "#efe2bf", "#a8402a", "#d0692c", "#2f6fd6", "#e07ab8", "#3fa34d", "#e8e8e8", "#7b4fc9"],
    cloth: ["#c0392b", "#2e5fa8", "#1f2f55", "#2f7d3a", "#e6b422", "#e07b25", "#6b3fa0", "#2a2a2d", "#e9e9e9", "#7a7d80", "#e58fb5", "#2aa4b8", "#7a5232", "#ffd84a"],
    pants: ["#3b5b8f", "#2a2a2d", "#6d7074", "#c9b38a", "#6f6d3d", "#1f2f55", "#6b4a2e", "#e9e9e9", "#a8322a", "#e58fb5"],
    shoes: ["#efefef", "#2a2a2d", "#6b4a2e", "#c0392b", "#2e5fa8", "#ffd84a", "#3c8527"],
  };

  /* options proposées par catégorie ----------------------------------- */
  const OPTS = {
    skin: { label: "Peau", color: "skin", styles: [["normal", "Normale"], ["joues", "Joues roses"], ["taches", "Taches de rousseur"], ["barbe", "Barbe"]] },
    eyes: { label: "Yeux", color: "eyes", styles: [["classique", "Classiques"], ["grands", "Grands"], ["anime", "Anime"], ["fermes", "Souriants"], ["colere", "Déterminés"]] },
    hair: { label: "Cheveux", color: "hair", styles: [["court", "Courts"], ["frange", "Frange"], ["milong", "Mi-longs"], ["long", "Longs"], ["boucle", "Bouclés"], ["queue", "Queue-de-cheval"], ["iroquois", "Iroquois"], ["rase", "Rasés"], ["chauve", "Chauve"]] },
    top: { label: "Haut", color: "cloth", styles: [["tshirt", "T-shirt"], ["longues", "Manches longues"], ["hoodie", "Sweat à capuche"], ["chemise", "Chemise"], ["raye", "Pull rayé"], ["veste", "Veste ouverte"], ["debardeur", "Débardeur"]] },
    bottom: { label: "Bas", color: "pants", styles: [["jean", "Jean"], ["jogging", "Jogging"], ["cargo", "Cargo"], ["short", "Short"], ["jupe", "Jupe"]] },
    shoes: { label: "Chaussures", color: "shoes", styles: [["baskets", "Baskets"], ["bottes", "Bottes"], ["ville", "Chaussures"], ["nus", "Pieds nus"]] },
    acc: { label: "Accessoires", color: "cloth", styles: [["aucun", "Aucun"], ["lunettes", "Lunettes"], ["soleil", "Lunettes de soleil"], ["casquette", "Casquette"], ["bandeau", "Bandeau"], ["echarpe", "Écharpe"], ["casque", "Casque audio"]] },
  };
  const DEFAULT_LOOK = {
    skin: { style: "normal", color: "#e2ad88" }, eyes: { style: "classique", color: "#4a2f1e" },
    hair: { style: "court", color: "#3b2618" }, top: { style: "hoodie", color: "#e07b25" },
    bottom: { style: "jean", color: "#3b5b8f" }, shoes: { style: "baskets", color: "#efefef" },
    acc: { style: "aucun", color: "#2a2a2d" }, slim: false,
  };

  /* ---------- garde-robe communautaire : pièces prises sur de vrais skins ---------- */
  const SRC = new Map();   /* texture → Image (skins sources chargés) */
  const W_REGIONS = {
    /* [x, y, w, h] dans la texture 64×64 ; les calques extérieurs (y ≥ 32) sont vidés si la source est en 64×32 */
    top: [[16, 16, 24, 16], [16, 32, 24, 16], [40, 16, 16, 16], [40, 32, 16, 16], [32, 48, 16, 16], [48, 48, 16, 16]],
    bottom: [[4, 16, 4, 4], [0, 20, 16, 9], [20, 48, 4, 4], [16, 52, 16, 9], [4, 32, 4, 4], [0, 36, 16, 9], [4, 48, 4, 4], [0, 52, 16, 9]],
    shoes: [[8, 16, 4, 4], [0, 29, 16, 3], [24, 48, 4, 4], [16, 61, 16, 3], [0, 45, 16, 3], [0, 61, 16, 3]],
    hair: [[32, 0, 32, 16], [8, 0, 8, 8], [24, 8, 8, 6], [0, 8, 8, 3], [16, 8, 8, 3], [8, 8, 8, 1]],
  };
  /* régions « jambe gauche » d'une vieille texture 64×32 : on reprend la jambe/le bras droit */
  const OLD_MAP = { "16,48": [0, 16], "20,48": [4, 16], "16,52": [0, 20], "16,61": [0, 29], "24,48": [8, 16], "32,48": [40, 16] };
  function pasteWardrobe(canvas, look) {
    const g = canvas.getContext("2d");
    for (const cat of ["bottom", "shoes", "top", "hair"]) {
      const part = look[cat];
      if (part?.style !== "lib" || !part.src) continue;
      const img = SRC.get(part.src);
      if (!img) continue;
      const old = img.height === 32;
      for (const [x, y, w, h] of W_REGIONS[cat]) {
        g.clearRect(x, y, w, h);
        let sx = x, sy = y;
        if (old) {
          if (y >= 32 && !(x === 32 && y === 48 && false)) {
            const m = OLD_MAP[x + "," + y];
            if (!m) continue;          /* pas de calque extérieur dans un vieux skin */
            [sx, sy] = m;
          }
        }
        g.drawImage(img, sx, sy, w, h, x, y, w, h);
      }
    }
  }
  function generateSkin(look) {
    const c = generateBase(look);
    pasteWardrobe(c, look);
    return c;
  }
  function generateBase(look) {
    const L = look;
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const g = c.getContext("2d");
    const img = g.createImageData(64, 64);
    const D = img.data;
    const skinC = hex(L.skin.color), hairC = hex(L.hair.color), eyeC = hex(L.eyes.color);
    const topC = hex(L.top.color), botC = hex(L.bottom.color), shoeC = hex(L.shoes.color), accC = hex(L.acc.color);
    const WHITE = [238, 238, 240], RIB = 0.8;
    const lite = (col, t = .3) => mix(col, [255, 255, 255], t);
    const dark = (col, k = .72) => mul(col, k);
    const aw = L.slim ? 3 : 4;
    /* matériaux qui reçoivent un contour quand ils touchent autre chose */
    const OUTLINED = new Set(["top", "bot", "shoe", "hair", "acc", "hood"]);

    for (const [name, P] of Object.entries(PARTS)) {
      const w = (name === "rarm" || name === "larm") ? aw : P.w;
      for (const layer of ["base", "over"]) {
        const rects = faceRects(P[layer], w, P.h, P.d);
        for (const [face, [fx, fy, fw, fh]] of Object.entries(rects)) {
          /* 1) matériau + couleur de chaque pixel de la face */
          const cell = [];
          for (let py = 0; py < fh; py++) for (let px = 0; px < fw; px++) {
            const side = face !== "top" && face !== "bottom";
            const wy = side ? P.y0 + (P.h - 1 - py) : face === "top" ? P.y0 + P.h : P.y0 - 1;
            const q = { part: name, face, x: px, y: py, w: fw, h: fh, wy, ly: wy - P.y0, side, layer };
            cell.push(layer === "base" ? paintBase(q) : paintOver(q));
          }
          /* 2) ombrage propre : face + dégradé en bandes + contours */
          const at = (x, y) => (x < 0 || y < 0 || x >= fw || y >= fh) ? null : cell[y * fw + x];
          for (let py = 0; py < fh; py++) for (let px = 0; px < fw; px++) {
            const p = cell[py * fw + px];
            if (!p) continue;
            let k = FACE_LIGHT[face];
            const sideFace = face !== "top" && face !== "bottom";
            if (sideFace && p.m !== "eye" && p.m !== "detail") {
              /* lumière venant du haut : haut de chaque pièce un peu plus clair */
              const t = py / Math.max(1, fh - 1);
              k *= t < .2 ? 1.05 : t > .8 ? .93 : 1;
            }
            if ((p.m === "top" || p.m === "bot" || p.m === "top2") && (face === "front" || face === "back") && fw >= 4 && (px === 0 || px === fw - 1)) k *= .94;
            if (sideFace && p.m !== "eye" && p.m !== "detail") {
              const innerFace = (name === "rarm" && face === "left") || (name === "larm" && face === "right") || (name === "rleg" && face === "left") || (name === "lleg" && face === "right");
              if (innerFace) k *= .93;
            }
            if (OUTLINED.has(p.m) && sideFace) {
              const nb = [at(px, py - 1), at(px, py + 1), at(px - 1, py), at(px + 1, py)];
              const edge = nb.some((n) => n && n.m !== p.m && n.m !== "detail" && !(p.m === "hair" && n.m === "hair2") && !(p.m === "top" && n.m === "top2"));
              /* sur le calque extérieur, le bord contre le vide se fonce aussi */
              const rim = layer === "over" && nb.some((n) => n === null) && false;
              if (edge || rim) k *= p.m === "hair" ? .84 : .8;
            }
            const col = mul(p.c, k * (p.k ?? 1));
            const i = ((fy + py) * 64 + fx + px) * 4;
            D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = 255;
          }
        }
      }
    }
    g.putImageData(img, 0, 0);
    return c;

    /* ===== calque de base : peau, visage, vêtements ===== */
    function paintBase(q) {
      let out = { c: skinC, m: "skin" };
      if (q.part === "head") {
        if (q.side && q.y === 7 && q.face !== "front") out = { c: mul(skinC, .94), m: "skin" };
        const f = faceAt(q); if (f) out = f;
        const h = hairAt(q, false); if (h) out = h;
        const b = beardAt(q); if (b && !h) out = b;
        return out;
      }
      const isArm = q.part === "rarm" || q.part === "larm";
      if (isArm && q.side && q.ly === 0) out = { c: mul(skinC, .95), m: "skin" };   /* main */
      const bot = bottomAt(q); if (bot) out = bot;
      const top = topAt(q); if (top) out = top;
      const sh = shoesAt(q); if (sh) out = sh;
      return out;
    }
    /* ===== calque extérieur : volume (cheveux, capuche, veste, jupe, accessoires) ===== */
    function paintOver(q) {
      let out = null;
      if (q.part === "head") {
        out = hairAt(q, true) || hoodAt(q);
        const a = accAt(q); if (a) out = a;
        return out;
      }
      out = jacketAt(q) || skirtAt(q) || longHairBody(q);
      const a = accAt(q); if (a) out = a;
      return out;
    }

    /* ---------- visage ---------- */
    function faceAt(q) {
      if (q.face !== "front") return null;
      const { x, y } = q, E = L.eyes.style;
      const inL = x === 1 || x === 2, inR = x === 5 || x === 6;
      const inner = x === 2 || x === 5;          /* iris côté nez */
      const brow = mul(hairC, .85);
      if (E === "classique") {
        if (y === 4 && (inL || inR)) return { c: inner ? eyeC : WHITE, m: "eye" };
        if (y === 3 && (inL || inR)) return { c: brow, m: "eye", k: inner ? 1 : .95 };
      }
      if (E === "grands") {
        if ((y === 3 || y === 4) && (inL || inR)) return { c: inner ? (y === 3 ? lite(eyeC, .25) : dark(eyeC, .8)) : WHITE, m: "eye" };
        if (y === 2 && (inL || inR)) return { c: brow, m: "eye" };
      }
      if (E === "anime") {
        if ((y === 3 || y === 4) && (inL || inR)) {
          if (inner) return { c: y === 3 ? lite(eyeC, .45) : eyeC, m: "eye" };
          return { c: y === 3 ? [30, 30, 34] : WHITE, m: "eye" };
        }
        if (y === 2 && (inL || inR)) return { c: brow, m: "eye" };
      }
      if (E === "fermes") {
        if (y === 4 && (inL || inR)) return { c: dark(skinC, .55), m: "eye" };
        if (y === 3 && (x === 1 || x === 6)) return { c: dark(skinC, .62), m: "eye" };
      }
      if (E === "colere") {
        if (y === 4 && (inL || inR)) return { c: inner ? eyeC : WHITE, m: "eye" };
        if (y === 3 && (x === 2 || x === 5)) return { c: brow, m: "eye" };
      }
      /* nez, bouche, joues */
      if (y === 5 && (x === 3 || x === 4)) return { c: mul(skinC, .9), m: "skin" };
      if (y === 6 && (x === 3 || x === 4)) return { c: L.skin.style === "barbe" ? dark(hairC, .7) : mul(skinC, .74), m: "detail" };
      if (y === 6 && (x === 2 || x === 5) && E === "fermes") return { c: mul(skinC, .82), m: "detail" };
      if (L.skin.style === "joues" && y === 5 && (x === 1 || x === 6)) return { c: mix(skinC, [236, 118, 118], .45), m: "detail" };
      if (L.skin.style === "taches" && ((y === 5 && (x === 1 || x === 6)) || (y === 5 && (x === 2 || x === 5) && false))) return { c: mul(skinC, .82), m: "detail" };
      if (L.skin.style === "taches" && y === 4 && (x === 0 || x === 7)) return { c: mul(skinC, .85), m: "detail" };
      return null;
    }
    function beardAt(q) {
      if (L.skin.style !== "barbe" || q.part !== "head" || !q.side) return null;
      const { face, x, y } = q;
      const c2 = (k = 1) => ({ c: mul(hairC, k), m: "hair2" });
      if (face === "front" && (y === 7 || (y === 6 && x !== 3 && x !== 4) || (y === 5 && (x === 0 || x === 7)))) return c2(y === 7 ? .9 : 1);
      if ((face === "right" || face === "left") && y >= 5) {
        const front = face === "right" ? x <= 3 : x >= 4;
        if (front || y === 7) return c2(.92);
      }
      return null;
    }

    /* ---------- cheveux ---------- */
    function hairAt(q, over) {
      const H = L.hair.style;
      if (H === "chauve" || H === "lib" || q.part !== "head") return null;
      const { face, x, y } = q;
      /* mèches : 3 tons répartis en motif régulier (pas de bruit) */
      const strand = (xx, yy) => {
        const s = (xx * 3 + (yy >> 1)) % 4;
        return s === 0 ? .86 : s === 2 ? 1.08 : 1;
      };
      const col = (k = 1) => ({ c: mul(hairC, k * strand(x, y)), m: "hair" });
      if (H === "rase") {
        if (over) return null;
        if (face === "top") return { c: mix(skinC, hairC, .7), m: "hair2" };
        if (face !== "front" && face !== "bottom" && y <= 2) return { c: mix(skinC, hairC, .6), m: "hair2" };
        if (face === "front" && y === 0) return { c: mix(skinC, hairC, .6), m: "hair2" };
        return null;
      }
      if (H === "iroquois") {
        const mid = x >= 3 && x <= 4;
        if (face === "top" && mid) return col(1.1);
        if (face === "back" && mid && y <= 5) return col(.95);
        if (face === "front" && mid && y === 0) return col(1);
        if (!over && (face === "top" || ((face === "right" || face === "left") && y <= 1))) return { c: mix(skinC, hairC, .35), m: "hair2" };
        return null;
      }
      const S = {
        court: { front: 1, side: 3, back: 5 }, frange: { front: 2, side: 4, back: 6 },
        milong: { front: 1, side: 6, back: 7 }, long: { front: 1, side: 7, back: 7 },
        boucle: { front: 1, side: 4, back: 6 }, queue: { front: 1, side: 3, back: 5 },
      }[H] || { front: 1, side: 3, back: 5 };
      if (face === "bottom") return null;
      if (face === "top") return col(over ? 1.06 : 1);
      if (face === "front") {
        if (y < S.front) return col(1.06);
        if (y === S.front) {
          /* forme de la frange */
          if (H === "court" && (x === 0 || x === 1 || x === 6 || x === 7)) return col(.95);
          if (H === "frange" && x !== 6) return col(.92);
          if (H === "boucle" && x % 2 === 0) return col(.95);
          if ((H === "milong" || H === "long" || H === "queue") && (x <= 1 || x >= 6)) return col(.95);
        }
        if ((H === "milong" || H === "long") && (x === 0 || x === 7) && y <= S.side) return col(.9);
        return null;
      }
      if (face === "back") {
        if (y <= S.back) return col(.95);
        if (H === "queue" && x >= 3 && x <= 4) return col(.9);
        if ((H === "long" || H === "milong") && y === 7) return col(.88);
        return null;
      }
      /* côtés : plus long vers l'arrière, dégagé devant l'oreille */
      const back = face === "right" ? x : 7 - x;     /* 0 = devant */
      let lim = S.side + (back >= 5 ? 2 : back >= 3 ? 1 : 0);
      if (back <= 1 && (H === "court" || H === "queue")) lim = Math.min(lim, 2);
      if (y <= Math.min(7, lim)) return col(.97);
      if (H === "boucle" && over && y === lim + 1 && (x + y) % 2 === 0) return col(.9);
      return null;
    }
    function longHairBody(q) {
      const H = L.hair.style;
      if (q.part !== "body" || q.face !== "back") return null;
      const s = (q.x * 3 + (q.y >> 1)) % 4, k = s === 0 ? .86 : s === 2 ? 1.06 : 1;
      if (H === "long" && q.ly >= 6) return { c: mul(hairC, k * .95), m: "hair" };
      if (H === "queue" && q.ly >= 7 && q.x >= 3 && q.x <= 4) return { c: mul(hairC, k * .95), m: "hair" };
      return null;
    }

    /* ---------- haut ---------- */
    function topAt(q) {
      const T = L.top.style;
      const onBody = q.part === "body", onArm = q.part === "rarm" || q.part === "larm";
      if (!onBody && !onArm) return null;
      if (T === "lib") return null;
      const C = { c: topC, m: "top" };
      const stripe = (ly) => (ly % 3 === 2) ? { c: lite(topC, .62), m: "top2" } : { c: topC, m: "top" };
      if (T === "veste") {
        /* t-shirt blanc sous la veste ouverte */
        if (onBody && q.ly >= 1) return { c: WHITE, m: "top2" };
        if (onArm && q.ly >= 9) return { c: WHITE, m: "top2" };
        return null;
      }
      if (onBody) {
        if (q.face === "bottom") return null;
        if (q.face === "top") {
          if (T === "hoodie") return { c: dark(topC, .85), m: "top" };   /* bord de capuche */
          if (T === "debardeur" && (q.x <= 1 || q.x >= 6)) return null;
          return C;
        }
        if (q.ly < 1) return null;                    /* ceinture du bas */
        const { face, x, y, ly } = q;
        if (T === "tshirt" || T === "longues") {
          if (face === "front" && y === 0 && x >= 3 && x <= 4) return null;               /* col rond */
          if ((face === "front" || face === "back") && y === 0 && (x === 2 || x === 5)) return { c: lite(topC, .22), m: "top2" };
          if (face === "front" && y === 1 && x >= 3 && x <= 4) return { c: lite(topC, .22), m: "top2" };
          if (ly === 1) return { c: dark(topC, .88), m: "top" };
          return C;
        }
        if (T === "hoodie") {
          if (ly <= 2) return { c: dark(topC, RIB), m: "top2", k: (x % 2) ? .95 : 1 };   /* bas côtelé */
          if (face === "front") {
            if (y === 0 && x >= 2 && x <= 5) return { c: dark(topC, .78), m: "top2" };   /* col */
            if ((x === 2 || x === 5) && y >= 1 && y <= 4) return { c: WHITE, m: "detail" }; /* cordons */
            if (y >= 6 && y <= 8 && x >= 1 && x <= 6) {                                   /* poche */
              if (y === 6 || x === 1 || x === 6) return { c: dark(topC, .78), m: "top2" };
              return { c: mul(topC, .96), m: "top2" };
            }
          }
          return C;
        }
        if (T === "chemise") {
          if (face === "front") {
            if (y <= 1 && (x === 2 || x === 5)) return { c: lite(topC, .55), m: "top2" };    /* col */
            if (y === 0 && (x === 3 || x === 4)) return null;
            if (x === 3) return { c: dark(topC, .86), m: "top2" };                          /* patte */
            if (x === 4) return y % 3 === 1 ? { c: lite(topC, .7), m: "detail" } : { c: dark(topC, .86), m: "top2" };
            if (x === 6 && (y === 2 || y === 3)) return { c: dark(topC, .82), m: "top2" };  /* poche */
          }
          if (ly === 1) return { c: dark(topC, .88), m: "top" };
          return C;
        }
        if (T === "raye") {
          if (ly <= 1) return { c: dark(topC, RIB), m: "top2" };
          if (face === "front" && y === 0 && x >= 3 && x <= 4) return { c: dark(topC, RIB), m: "top2" };
          return stripe(ly);
        }
        if (T === "debardeur") {
          if (face === "right" || face === "left") { if (y <= 3) return null; }
          if ((face === "front" || face === "back") && y <= 1 && (x <= 1 || x >= 6)) return null;
          if (face === "front" && y <= 1 && x >= 3 && x <= 4) return null;
          if (face === "front" && y === 2 && x >= 3 && x <= 4) return { c: lite(topC, .2), m: "top2" };
          return C;
        }
        return C;
      }
      /* bras */
      const sl = { tshirt: 4, debardeur: 0, longues: 11, hoodie: 11, chemise: 11, raye: 11 }[T] ?? 4;
      if (sl === 0) return null;
      if (q.face === "top") return stripe0();
      if (q.face === "bottom") return null;
      if (q.ly < 12 - sl) return null;
      const cuffRow = q.ly === 12 - sl;
      if (T === "hoodie" && q.ly <= 2) return { c: dark(topC, RIB), m: "top2", k: (q.x % 2) ? .95 : 1 };
      if (T === "raye") return q.ly <= 1 ? { c: dark(topC, RIB), m: "top2" } : stripe(q.ly);
      if (T === "chemise" && q.ly === 1) return { c: lite(topC, .4), m: "top2" };
      if (T === "tshirt" && cuffRow) return { c: dark(topC, .88), m: "top" };
      return C;
      function stripe0() { return T === "raye" ? { c: topC, m: "top" } : C; }
    }
    function jacketAt(q) {
      if (L.top.style !== "veste") return null;
      const onBody = q.part === "body", onArm = q.part === "rarm" || q.part === "larm";
      if (q.face === "bottom") return null;
      if (onBody) {
        if (q.face === "top") return { c: topC, m: "top" };
        if (q.face === "front" && (q.x === 3 || q.x === 4)) return null;                 /* ouverte */
        if (q.face === "front" && q.y <= 3 && (q.x === 2 || q.x === 5)) return { c: lite(topC, .18), m: "top2" };   /* revers */
        if (q.face === "front" && q.y === 7 && (q.x === 1 || q.x === 6)) return { c: dark(topC, .8), m: "top2" };  /* poches */
        if (q.ly === 0) return { c: dark(topC, .85), m: "top" };
        return { c: topC, m: "top" };
      }
      if (onArm) {
        if (q.face === "top") return { c: topC, m: "top" };
        if (q.ly < 1) return null;
        if (q.ly === 1) return { c: dark(topC, .82), m: "top2" };
        return { c: topC, m: "top" };
      }
      return null;
    }
    function hoodAt(q) {
      if (L.top.style !== "hoodie" || q.part !== "head") return null;
      const { face, x, y } = q;
      if (face === "back" && y >= 4) return { c: y === 4 ? dark(topC, .85) : mul(topC, .95), m: "hood" };
      if ((face === "right" || face === "left") && y >= 6) {
        const back = face === "right" ? x : 7 - x;
        if (back >= 3) return { c: mul(topC, .95), m: "hood" };
      }
      return null;
    }

    /* ---------- bas ---------- */
    function bottomAt(q) {
      const B = L.bottom.style;
      const onLeg = q.part === "rleg" || q.part === "lleg";
      if (B === "lib") return null;
      if (q.part === "body" && q.side && q.ly < 1) {
        if (B === "jupe") return { c: dark(botC, .9), m: "bot" };
        if (q.face === "front" && (q.x === 3 || q.x === 4)) return { c: [214, 178, 74], m: "detail" };   /* boucle */
        return { c: B === "jogging" ? dark(botC, .85) : [58, 42, 30], m: "bot" };
      }
      if (!onLeg || B === "jupe") return null;
      if (q.face === "bottom") return null;
      if (q.face === "top") return { c: botC, m: "bot" };
      if (B === "short" && q.ly < 7) return null;
      const outer = (q.part === "rleg" && q.face === "right") || (q.part === "lleg" && q.face === "left");
      const inner = (q.part === "rleg" && q.face === "left") || (q.part === "lleg" && q.face === "right");
      let col = botC, m = "bot";
      if (B === "jean") {
        if ((q.x + q.ly) % 4 === 0) col = mul(botC, 1.03);                              /* sergé discret */
        if ((outer || inner) && q.x === 1) col = lite(botC, .14);                      /* couture */
        if (q.ly === 2) { col = lite(botC, .1); m = "bot"; }                           /* revers */
      }
      if (B === "jogging") {
        if (outer && q.x === 1) col = WHITE;
        if (q.ly === 2) col = dark(botC, RIB);
      }
      if (B === "cargo") {
        if (outer && q.ly >= 4 && q.ly <= 7) col = q.ly === 7 ? dark(botC, .78) : (q.x === 0 || q.x === 3) ? dark(botC, .85) : mul(botC, 1.04);
        if (q.ly === 2) col = dark(botC, .88);
      }
      if (B === "short" && q.ly === 7) col = dark(botC, .85);
      return { c: col, m };
    }
    function skirtAt(q) {
      if (L.bottom.style !== "jupe") return null;
      const onLeg = q.part === "rleg" || q.part === "lleg";
      if (!onLeg || q.face === "bottom") return null;
      if (q.face === "top") return { c: botC, m: "bot" };
      if (q.ly < 6) return null;
      if (q.ly === 6) return { c: dark(botC, .8), m: "bot" };
      return { c: q.x % 2 ? mul(botC, .9) : botC, m: "bot" };   /* plis */
    }

    /* ---------- chaussures ---------- */
    function shoesAt(q) {
      const onLeg = q.part === "rleg" || q.part === "lleg";
      if (!onLeg) return null;
      const S = L.shoes.style;
      if (S === "nus" || S === "lib") return q.face === "bottom" ? { c: mul(skinC, .88), m: "skin" } : null;
      if (q.face === "bottom") return { c: S === "baskets" ? [186, 186, 190] : dark(shoeC, .55), m: "shoe" };
      if (!q.side) return null;
      const h = { baskets: 2, bottes: 4, ville: 2 }[S] || 2;
      if (q.ly >= h) return null;
      if (S === "baskets") {
        if (q.ly === 0) return { c: q.face === "front" ? [226, 226, 228] : [210, 210, 214], m: "shoe" };   /* semelle */
        if (q.face === "front" && (q.x === 1 || q.x === 2)) return { c: shoeC === WHITE ? [190, 190, 196] : WHITE, m: "detail" };  /* lacets */
        const outer = (q.part === "rleg" && q.face === "right") || (q.part === "lleg" && q.face === "left");
        if (outer && q.x >= 1 && q.x <= 2) return { c: L.shoes.color.toLowerCase() === "#efefef" ? topC : lite(shoeC, .35), m: "detail" };
        return { c: shoeC, m: "shoe" };
      }
      if (S === "bottes") {
        if (q.ly === 0) return { c: dark(shoeC, .55), m: "shoe" };
        if (q.ly === h - 1) return { c: lite(shoeC, .12), m: "shoe" };   /* revers */
        return { c: shoeC, m: "shoe", k: q.face === "front" && q.x === 1 && q.ly === 1 ? 1.15 : 1 };
      }
      if (q.ly === 0) return { c: dark(shoeC, .55), m: "shoe" };
      return { c: shoeC, m: "shoe", k: q.face === "front" && q.x === 1 ? 1.25 : 1 };   /* reflet du cuir */
    }

    /* ---------- accessoires ---------- */
    function accAt(q) {
      const A = L.acc.style;
      if (A === "aucun") return null;
      const { part, face, x, y, layer } = q;
      if (part === "head" && layer === "over") {
        if (A === "lunettes" || A === "soleil") {
          const rim = A === "soleil" ? [26, 26, 30] : dark(accC, .8);
          if (face === "front" && y === 4) {
            if (A === "soleil" && (x === 1 || x === 2 || x === 5 || x === 6)) return { c: x === 1 || x === 5 ? [70, 76, 96] : [34, 36, 46], m: "acc" };
            if (x === 0 || x === 3 || x === 4 || x === 7) return { c: rim, m: "acc" };
          }
          if (face === "front" && y === 3 && A === "lunettes" && x !== 3 && x !== 4) return { c: rim, m: "acc" };
          if ((face === "right" || face === "left") && y === 4) return { c: rim, m: "acc" };
          return null;
        }
        if (A === "casquette") {
          if (face === "top") return { c: (x === 3 || x === 4) ? dark(accC, .85) : accC, m: "acc" };
          if (face === "bottom") return null;
          if (y <= 1) return { c: y === 1 ? dark(accC, .85) : accC, m: "acc" };
          if (face === "front" && y === 2) return { c: dark(accC, .65), m: "acc" };
          return null;
        }
        if (A === "bandeau") return (face !== "top" && face !== "bottom" && y === 1) ? { c: accC, m: "acc" } : null;
        if (A === "casque") {
          const band = [44, 44, 50];
          if (face === "top" && (y === 3 || y === 4)) return { c: band, m: "acc" };
          if ((face === "right" || face === "left") && y <= 2 && (x === 3 || x === 4)) return { c: band, m: "acc" };
          if ((face === "right" || face === "left") && y >= 3 && y <= 6 && x >= 2 && x <= 5)
            return { c: (y === 3 || y === 6 || x === 2 || x === 5) ? band : accC, m: "acc" };
          return null;
        }
        return null;
      }
      if (A === "echarpe" && part === "body" && layer === "over") {
        if (face === "top") return { c: accC, m: "acc" };
        if (q.side && q.ly >= 10) return { c: q.ly === 10 ? dark(accC, .85) : accC, m: "acc" };
        if (face === "front" && (x === 1 || x === 2) && q.ly >= 4) return { c: q.ly === 4 ? dark(accC, .8) : accC, m: "acc" };
      }
      return null;
    }
  }

  /* ================================================================
     3. VIEWERS 3D (pages créateur / cosmétiques)
     ================================================================ */
  function makeViewer(host, opts = {}) {
    host.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.className = "sv-canvas";
    host.appendChild(canvas);
    const w = host.clientWidth || 360, h = host.clientHeight || 480;
    const v = new skinview3d.SkinViewer({ canvas, width: w, height: h });
    v.fov = 40;
    v.zoom = opts.zoom ?? 0.8;   /* de la marge pour les chapeaux */
    if (v.controls) { v.controls.enableZoom = false; v.controls.enablePan = false; v.controls.rotateSpeed = 0.8; }
    if (typeof setViewerAngle === "function") setViewerAngle(v, opts.yaw ?? -30, -8);
    window.SunriseAnim?.attach(v, { headTrack: !!opts.headTrack });
    new ResizeObserver(() => { const nw = host.clientWidth, nh = host.clientHeight; if (nw && nh) { try { v.setSize(nw, nh); } catch (_) {} } }).observe(host);
    Cosmetics.attach(v);
    return v;
  }

  /* ================================================================
     4. COSMÉTIQUES
     Un cosmétique = liste de pavés en pixels, dans l'espace de la tête
     (origine au cou, +y vers le haut, +z vers l'avant). Même format
     pour le launcher (Three.js) et le mod en jeu.
     ================================================================ */
  /* ---------- catalogue libre : modèles originaux de MC-RENDER (Yutsi), format Bedrock ---------- */
  const mrMeta = (id, name, category, attachedTo, position = "", extra = {}) => ({ id: "b_" + id, name, category, attachedTo, position, scale: 1, type: "COSMETIC", ...extra });
  const MCR_COSMETICS = [
    { meta: mrMeta('crown', 'Couronne royale', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#f5c518', '#d99a00', '#e8384f', '#3b82f6'],
      bones: [{ name: 'crown', cubes: [
        { o: [-4.5, 8, -4.5], s: [9, 2, 1], c: 0 }, { o: [-4.5, 8, 3.5], s: [9, 2, 1], c: 0 }, { o: [-4.5, 8, -3.5], s: [1, 2, 7], c: 1 }, { o: [3.5, 8, -3.5], s: [1, 2, 7], c: 1 },
        { o: [-4.5, 10, -4.5], s: [1, 2, 1], c: 0 }, { o: [3.5, 10, -4.5], s: [1, 2, 1], c: 0 }, { o: [-0.5, 10, -4.5], s: [1, 2, 1], c: 0 },
        { o: [-4.5, 10, 3.5], s: [1, 2, 1], c: 0 }, { o: [3.5, 10, 3.5], s: [1, 2, 1], c: 0 }, { o: [-0.5, 10, 3.5], s: [1, 2, 1], c: 0 },
        { o: [-1, 8.5, -4.8], s: [2, 1, 1], c: 2 }, { o: [-1, 8.5, 3.8], s: [2, 1, 1], c: 3 }] }] },
    { meta: mrMeta('tophat', 'Haut-de-forme', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#1b1b1f', '#2a2a30', '#b0263a'],
      bones: [{ name: 'hat', cubes: [{ o: [-5.5, 8, -5.5], s: [11, 1, 11], c: 0 }, { o: [-3.5, 9, -3.5], s: [7, 6, 7], c: 1 }, { o: [-3.6, 9, -3.6], s: [7.2, 1.2, 7.2], c: 2 }] }] },
    { meta: mrMeta('cap', 'Casquette', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#2563eb', '#1e40af', '#f8fafc'],
      bones: [{ name: 'cap', cubes: [{ o: [-4.3, 7, -4.3], s: [8.6, 2, 8.6], c: 0 }, { o: [-3.5, 9, -3.5], s: [7, 0.8, 7], c: 1 }, { o: [-4, 7, -8.5], s: [8, 0.6, 4.4], c: 1 }, { o: [-0.5, 9.6, -0.5], s: [1, 0.5, 1], c: 2 }] }] },
    { meta: mrMeta('wizard', 'Chapeau de mage', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#4c1d95', '#6d28d9', '#facc15'],
      bones: [
        { name: 'brim', cubes: [{ o: [-6, 8, -6], s: [12, 1, 12], c: 0 }, { o: [-4, 9, -4], s: [8, 3, 8], c: 1 }, { o: [-4.1, 9, -4.1], s: [8.2, 1, 8.2], c: 2 }] },
        { name: 'tip', pivot: [0, 12, 0], rotation: [-8, 0, 6], cubes: [{ o: [-3, 12, -3], s: [6, 3, 6], c: 1 }, { o: [-2, 15, -1.5], s: [4, 3, 4], c: 0 }, { o: [-1, 18, 0], s: [2, 2, 2], c: 1 }] }] },
    { meta: mrMeta('halo', 'Auréole', 'HEADGEAR', 'HEAD', 'HEAD_TOP'), palette: ['#fff3b0'],
      bones: [{ name: 'glow_halo', cubes: [
        { o: [-4, 11, -5], s: [8, 0.8, 1], c: 0 }, { o: [-4, 11, 4], s: [8, 0.8, 1], c: 0 }, { o: [-5, 11, -4], s: [1, 0.8, 8], c: 0 }, { o: [4, 11, -4], s: [1, 0.8, 8], c: 0 }] }] },
    { meta: mrMeta('horns', 'Cornes de démon', 'HEADGEAR', 'HEAD', 'HEAD_TOP'), palette: ['#7f1d1d', '#b91c1c', '#1f1f1f'],
      bones: [
        { name: 'horn_r', pivot: [-3, 8, 0], rotation: [0, 0, 20], cubes: [{ o: [-4, 8, -1], s: [2, 3, 2], c: 1 }, { o: [-3.8, 11, -0.8], s: [1.6, 2, 1.6], c: 0 }, { o: [-3.5, 13, -0.5], s: [1, 1.5, 1], c: 2 }] },
        { name: 'horn_l', pivot: [3, 8, 0], rotation: [0, 0, -20], cubes: [{ o: [2, 8, -1], s: [2, 3, 2], c: 1 }, { o: [2.2, 11, -0.8], s: [1.6, 2, 1.6], c: 0 }, { o: [2.5, 13, -0.5], s: [1, 1.5, 1], c: 2 }] }] },
    { meta: mrMeta('catears', 'Oreilles de chat', 'HEADGEAR', 'HEAD', 'HEAD_TOP'), palette: ['#2b2b2b', '#f9a8d4'],
      bones: [{ name: 'ears', cubes: [{ o: [-4, 8, -1], s: [3, 3, 1], c: 0 }, { o: [1, 8, -1], s: [3, 3, 1], c: 0 }, { o: [-3.5, 8.5, -1.3], s: [2, 2, 0.4], c: 1 }, { o: [1.5, 8.5, -1.3], s: [2, 2, 0.4], c: 1 }] }] },
    { meta: mrMeta('shades', 'Lunettes de soleil', 'FACE', 'HEAD', 'FACE'), palette: ['#111111', '#2b2b2b'],
      bones: [{ name: 'shades', cubes: [{ o: [-4.2, 4, -4.6], s: [3.4, 1.6, 0.4], c: 0 }, { o: [0.8, 4, -4.6], s: [3.4, 1.6, 0.4], c: 0 }, { o: [-0.8, 4.8, -4.6], s: [1.6, 0.5, 0.4], c: 1 }, { o: [-4.6, 4.8, -4.6], s: [0.4, 0.5, 4], c: 1 }, { o: [4.2, 4.8, -4.6], s: [0.4, 0.5, 4], c: 1 }] }] },
    { meta: mrMeta('angelwings', 'Ailes d\'ange', 'WING', 'BODY', 'BACK'), palette: ['#ffffff', '#eef2f7', '#d7dee8', '#c3ccd8'],
      bones: [
        { name: 'wing_r', pivot: [-1, -2, 2], rotation: [12, -38, -8], cubes: [
          { o: [-9, -4, 2], s: [8, 3, 1], c: 0 }, { o: [-13, -6, 2.2], s: [12, 3, 0.8], c: 1 }, { o: [-16, -9, 2.4], s: [14, 3, 0.7], c: 2 },
          { o: [-17, -12, 2.6], s: [13, 3, 0.6], c: 3 }, { o: [-17, -15, 2.7], s: [9, 3, 0.5], c: 2 }, { o: [-16, -17, 2.8], s: [5, 2, 0.5], c: 3 }] },
        { name: 'wing_l', pivot: [1, -2, 2], rotation: [12, 38, 8], cubes: [
          { o: [1, -4, 2], s: [8, 3, 1], c: 0 }, { o: [1, -6, 2.2], s: [12, 3, 0.8], c: 1 }, { o: [2, -9, 2.4], s: [14, 3, 0.7], c: 2 },
          { o: [4, -12, 2.6], s: [13, 3, 0.6], c: 3 }, { o: [8, -15, 2.7], s: [9, 3, 0.5], c: 2 }, { o: [11, -17, 2.8], s: [5, 2, 0.5], c: 3 }] }] },
    { meta: mrMeta('dragonwings', 'Ailes de dragon', 'WING', 'BODY', 'BACK'), palette: ['#3b0a45', '#7e22ce', '#1e1b2e'],
      bones: [
        { name: 'wing_r', pivot: [-1, -3, 2], rotation: [10, -30, 10], cubes: [{ o: [-16, -4, 2], s: [15, 1, 1], c: 2 }, { o: [-15, -13, 2.2], s: [14, 9, 0.4], c: 0 }, { o: [-18, -11, 2.2], s: [3, 7, 0.4], c: 1 }] },
        { name: 'wing_l', pivot: [1, -3, 2], rotation: [10, 30, -10], cubes: [{ o: [1, -4, 2], s: [15, 1, 1], c: 2 }, { o: [1, -13, 2.2], s: [14, 9, 0.4], c: 0 }, { o: [15, -11, 2.2], s: [3, 7, 0.4], c: 1 }] }] },
    { meta: mrMeta('backpack', 'Sac à dos', 'BACK', 'BODY', 'BACK'), palette: ['#9a5b2a', '#6b3d1a', '#d1a054'],
      bones: [{ name: 'bag', cubes: [{ o: [-3.5, -10, 2], s: [7, 8, 3], c: 0 }, { o: [-3, -6, 5], s: [6, 3, 1], c: 1 }, { o: [-0.5, -5, 5.8], s: [1, 1, 0.4], c: 2 }, { o: [-3.5, -2.5, 2], s: [7, 1, 3], c: 1 }] }] },
    { meta: mrMeta('scarf', 'Écharpe', 'LANYARD', 'BODY', 'CHEST'), palette: ['#dc2626', '#f8fafc'],
      bones: [{ name: 'scarf', cubes: [{ o: [-4.5, -2, -2.5], s: [9, 2, 5], c: 0 }, { o: [1, -7, -2.8], s: [2, 5, 1], c: 0 }, { o: [1, -7.5, -2.8], s: [2, 0.6, 1], c: 1 }] }] },
    { meta: mrMeta('aura', 'Aura magique', 'AURA', 'BODY', 'BODY'), palette: ['#a855f7', '#22d3ee'],
      bones: [{ name: 'glow_aura', cubes: [
        { o: [-7, -10, -1], s: [1, 1, 1], c: 0 }, { o: [6, -4, 2], s: [1, 1, 1], c: 1 }, { o: [-6, 2, 3], s: [1, 1, 1], c: 1 }, { o: [5, -14, -3], s: [1, 1, 1], c: 0 },
        { o: [-3, -20, 4], s: [1, 1, 1], c: 0 }, { o: [7, -18, 0], s: [1, 1, 1], c: 1 }, { o: [-8, -16, -3], s: [1, 1, 1], c: 1 }, { o: [2, 4, -4], s: [1, 1, 1], c: 0 }] }] },
    { meta: mrMeta('bee', 'Abeille compagnon', 'PETS', 'BODY', 'SHOULDER', { type: 'SHOULDER_PET' }), palette: ['#facc15', '#1f1f1f', '#e0f2fe'],
      bones: [{ name: 'bee', cubes: [{ o: [-2, 1, -2], s: [4, 3, 5], c: 0 }, { o: [-2.05, 1, 0], s: [4.1, 3.05, 1], c: 1 }, { o: [-1.5, 4, -1], s: [1, 0.4, 3], c: 2 }, { o: [0.5, 4, -1], s: [1, 0.4, 3], c: 2 }] }] },
    // ---------- chapeaux
    { meta: mrMeta('beanie', 'Bonnet', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#e11d48', '#f8fafc', '#be123c'],
      bones: [{ name: 'beanie', cubes: [{ o: [-4.5, 6, -4.5], s: [9, 2, 9], c: 1 }, { o: [-4.2, 8, -4.2], s: [8.4, 2, 8.4], c: 0 }, { o: [-3.5, 10, -3.5], s: [7, 1, 7], c: 2 }, { o: [-1.5, 11, -1.5], s: [3, 2, 3], c: 1 }] }] },
    { meta: mrMeta('cowboy', 'Chapeau de cowboy', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#8b5a2b', '#6b4220', '#3f2a14'],
      bones: [{ name: 'cowboy', cubes: [{ o: [-7, 8, -6], s: [14, 1, 12], c: 0 }, { o: [-7, 9, -6], s: [2, 1, 12], c: 0 }, { o: [5, 9, -6], s: [2, 1, 12], c: 0 },
        { o: [-4, 9, -4], s: [8, 4, 8], c: 1 }, { o: [-4.1, 9, -4.1], s: [8.2, 1, 8.2], c: 2 }, { o: [-1, 12.6, -4], s: [2, 0.6, 8], c: 0 }] }] },
    { meta: mrMeta('chef', 'Toque de chef', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#ffffff', '#e5e7eb'],
      bones: [{ name: 'chef', cubes: [{ o: [-4.3, 8, -4.3], s: [8.6, 3, 8.6], c: 1 }, { o: [-5, 11, -5], s: [10, 4, 10], c: 0 }, { o: [-4, 15, -4], s: [8, 1, 8], c: 0 }] }] },
    { meta: mrMeta('pirate', 'Bicorne de pirate', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#111827', '#facc15', '#f8fafc'],
      bones: [{ name: 'pirate', cubes: [{ o: [-6, 8, -2], s: [12, 4, 4], c: 0 }, { o: [-4, 12, -2], s: [8, 2, 4], c: 0 }, { o: [-6, 8, -2.2], s: [12, 0.6, 4.4], c: 1 }, { o: [-1, 10, -2.4], s: [2, 2, 0.4], c: 2 }] }] },
    { meta: mrMeta('party', 'Chapeau de fête', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#8b5cf6', '#facc15', '#ec4899'],
      bones: [{ name: 'party', pivot: [0, 8, 0], rotation: [0, 0, 8], cubes: [{ o: [-2.5, 8, -2.5], s: [5, 2, 5], c: 0 }, { o: [-2, 10, -2], s: [4, 2, 4], c: 1 }, { o: [-1.5, 12, -1.5], s: [3, 2, 3], c: 0 }, { o: [-1, 14, -1], s: [2, 1.5, 2], c: 1 }, { o: [-0.75, 15.5, -0.75], s: [1.5, 1.5, 1.5], c: 2 }] }] },
    { meta: mrMeta('viking', 'Casque viking', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#9ca3af', '#6b7280', '#f5f5dc'],
      bones: [
        { name: 'helm', cubes: [{ o: [-4.5, 5, -4.5], s: [9, 4, 9], c: 0 }, { o: [-3.5, 9, -3.5], s: [7, 1, 7], c: 1 }, { o: [-0.5, 2, -4.8], s: [1, 4, 0.4], c: 1 }] },
        { name: 'horn_r', pivot: [-4.5, 7, 0], rotation: [0, 0, 25], cubes: [{ o: [-7.5, 6.5, -1], s: [3, 2, 2], c: 2 }, { o: [-8.5, 8.5, -0.75], s: [1.5, 3, 1.5], c: 2 }] },
        { name: 'horn_l', pivot: [4.5, 7, 0], rotation: [0, 0, -25], cubes: [{ o: [4.5, 6.5, -1], s: [3, 2, 2], c: 2 }, { o: [7, 8.5, -0.75], s: [1.5, 3, 1.5], c: 2 }] }] },
    { meta: mrMeta('santa', 'Bonnet de Noël', 'HAT', 'HEAD', 'HEAD_TOP'), palette: ['#dc2626', '#ffffff'],
      bones: [{ name: 'santa', pivot: [0, 9, 0], rotation: [0, 0, -12], cubes: [{ o: [-4.5, 7, -4.5], s: [9, 2, 9], c: 1 }, { o: [-3.8, 9, -3.8], s: [7.6, 3, 7.6], c: 0 }, { o: [-2.5, 12, -2.5], s: [5, 2, 5], c: 0 }, { o: [-1.5, 14, -1.5], s: [3, 2, 3], c: 0 }, { o: [-1.2, 16, -1.2], s: [2.4, 2.4, 2.4], c: 1 }] }] },
    // ---------- tête
    { meta: mrMeta('headphones', 'Casque audio', 'HEADGEAR', 'HEAD', 'HEAD_TOP'), palette: ['#1f2937', '#22d3ee', '#374151'],
      bones: [{ name: 'phones', cubes: [{ o: [-4.6, 8, -1], s: [9.2, 1, 2], c: 0 }, { o: [-5.2, 4, -1], s: [1, 4, 2], c: 2 }, { o: [4.2, 4, -1], s: [1, 4, 2], c: 2 },
        { o: [-5.6, 2, -2], s: [1.4, 4, 4], c: 0 }, { o: [4.2, 2, -2], s: [1.4, 4, 4], c: 0 }, { o: [-5.8, 2.5, -1.5], s: [0.3, 3, 3], c: 1 }, { o: [5.5, 2.5, -1.5], s: [0.3, 3, 3], c: 1 }] }] },
    { meta: mrMeta('flowers', 'Couronne de fleurs', 'HEADGEAR', 'HEAD', 'HEAD_TOP'), palette: ['#4d7c0f', '#f472b6', '#facc15', '#ffffff'],
      bones: [{ name: 'flowers', cubes: [{ o: [-4.4, 8, -4.4], s: [8.8, 0.8, 0.8], c: 0 }, { o: [-4.4, 8, 3.6], s: [8.8, 0.8, 0.8], c: 0 }, { o: [-4.4, 8, -3.6], s: [0.8, 0.8, 7.2], c: 0 }, { o: [3.6, 8, -3.6], s: [0.8, 0.8, 7.2], c: 0 },
        { o: [-3, 8.3, -4.8], s: [1.5, 1.5, 1], c: 1 }, { o: [0.5, 8.3, -4.8], s: [1.5, 1.5, 1], c: 2 }, { o: [-4.8, 8.3, 0], s: [1, 1.5, 1.5], c: 3 }, { o: [3.8, 8.3, -1], s: [1, 1.5, 1.5], c: 1 }, { o: [-1, 8.3, 3.8], s: [1.5, 1.5, 1], c: 2 }] }] },
    { meta: mrMeta('bunny', 'Oreilles de lapin', 'HEADGEAR', 'HEAD', 'HEAD_TOP'), palette: ['#f5f5f4', '#fbcfe8'],
      bones: [
        { name: 'ear_r', pivot: [-2, 8, 0], rotation: [-10, 0, 8], cubes: [{ o: [-3.5, 8, -0.5], s: [2.5, 7, 1], c: 0 }, { o: [-3, 9, -0.8], s: [1.5, 5, 0.4], c: 1 }] },
        { name: 'ear_l', pivot: [2, 8, 0], rotation: [-10, 0, -8], cubes: [{ o: [1, 8, -0.5], s: [2.5, 7, 1], c: 0 }, { o: [1.5, 9, -0.8], s: [1.5, 5, 0.4], c: 1 }] }] },
    { meta: mrMeta('foxears', 'Oreilles de renard', 'HEADGEAR', 'HEAD', 'HEAD_TOP'), palette: ['#ea580c', '#fff7ed', '#1c1917'],
      bones: [{ name: 'ears', cubes: [{ o: [-4, 8, -0.5], s: [3, 2, 1.5], c: 0 }, { o: [-3.5, 10, -0.5], s: [2, 1.5, 1.5], c: 0 }, { o: [-3, 11.5, -0.5], s: [1, 1, 1.5], c: 2 },
        { o: [1, 8, -0.5], s: [3, 2, 1.5], c: 0 }, { o: [1.5, 10, -0.5], s: [2, 1.5, 1.5], c: 0 }, { o: [2, 11.5, -0.5], s: [1, 1, 1.5], c: 2 }, { o: [-3.5, 8.3, -0.8], s: [2, 1.5, 0.4], c: 1 }, { o: [1.5, 8.3, -0.8], s: [2, 1.5, 0.4], c: 1 }] }] },
    { meta: mrMeta('nerd', 'Lunettes rondes', 'FACE', 'HEAD', 'FACE'), palette: ['#292524', '#bae6fd'],
      bones: [{ name: 'nerd', cubes: [{ o: [-4, 3.5, -4.6], s: [3, 0.5, 0.4], c: 0 }, { o: [-4, 5.5, -4.6], s: [3, 0.5, 0.4], c: 0 }, { o: [-4, 3.5, -4.6], s: [0.5, 2.5, 0.4], c: 0 }, { o: [-1.5, 3.5, -4.6], s: [0.5, 2.5, 0.4], c: 0 },
        { o: [1, 3.5, -4.6], s: [3, 0.5, 0.4], c: 0 }, { o: [1, 5.5, -4.6], s: [3, 0.5, 0.4], c: 0 }, { o: [1, 3.5, -4.6], s: [0.5, 2.5, 0.4], c: 0 }, { o: [3.5, 3.5, -4.6], s: [0.5, 2.5, 0.4], c: 0 },
        { o: [-1, 5, -4.6], s: [2, 0.5, 0.4], c: 0 }, { o: [-3.5, 4, -4.5], s: [2, 1.5, 0.2], c: 1 }, { o: [1.5, 4, -4.5], s: [2, 1.5, 0.2], c: 1 }, { o: [-4.6, 5, -4.4], s: [0.4, 0.5, 4], c: 0 }, { o: [4.2, 5, -4.4], s: [0.4, 0.5, 4], c: 0 }] }] },
    { meta: mrMeta('ninja', 'Bandeau de ninja', 'FACE', 'HEAD', 'FACE'), palette: ['#1e3a8a', '#1e40af'],
      bones: [{ name: 'band', cubes: [{ o: [-4.3, 5.5, -4.3], s: [8.6, 1.5, 8.6], c: 0 },
        { o: [-1, 5, 4.3], s: [1, 1, 3], c: 1, r: [30, 15, 0], p: [-0.5, 5.5, 4.3] }, { o: [0, 4.5, 4.3], s: [1, 1, 3.5], c: 1, r: [40, -15, 0], p: [0.5, 5.5, 4.3] }] }] },
    // ---------- corps
    { meta: mrMeta('foxtail', 'Queue de renard', 'TAIL', 'BODY', 'BACK'), palette: ['#ea580c', '#fff7ed'],
      bones: [{ name: 'tail', pivot: [0, -11, 2], rotation: [-35, 0, 0], cubes: [{ o: [-1, -12, 2], s: [2, 2, 3], c: 0 }, { o: [-1.5, -12.5, 5], s: [3, 3, 4], c: 0 }, { o: [-1.25, -12.25, 9], s: [2.5, 2.5, 2], c: 1 }] }] },
    { meta: mrMeta('swordback', 'Épée dans le dos', 'BACK', 'BODY', 'BACK'), palette: ['#6b7280', '#e5e7eb', '#78350f', '#facc15'],
      bones: [{ name: 'sword', pivot: [0, -6, 2.5], rotation: [0, 0, 35], cubes: [{ o: [-0.5, -14, 2.2], s: [1, 13, 0.6], c: 1 }, { o: [-2.5, -1, 2], s: [5, 1, 1], c: 3 }, { o: [-0.5, 0, 2.2], s: [1, 4, 0.6], c: 2 }, { o: [-0.75, 4, 2.1], s: [1.5, 1, 0.8], c: 3 }] }] },
    { meta: mrMeta('jetpack', 'Jetpack', 'BACK', 'BODY', 'BACK'), palette: ['#9ca3af', '#ef4444', '#4b5563', '#f97316'],
      bones: [
        { name: 'pack', cubes: [{ o: [-4, -9, 2], s: [3, 7, 3], c: 0 }, { o: [1, -9, 2], s: [3, 7, 3], c: 0 }, { o: [-1, -7, 2], s: [2, 3, 2], c: 2 }, { o: [-4, -3, 2], s: [3, 1, 3], c: 1 }, { o: [1, -3, 2], s: [3, 1, 3], c: 1 }, { o: [-3.5, -10, 2.5], s: [2, 1, 2], c: 2 }, { o: [1.5, -10, 2.5], s: [2, 1, 2], c: 2 }] },
        { name: 'glow_flame', cubes: [{ o: [-3, -12, 3], s: [1, 2, 1], c: 3 }, { o: [2, -12, 3], s: [1, 2, 1], c: 3 }] }] },
    { meta: mrMeta('butterfly', 'Ailes de papillon', 'WING', 'BODY', 'BACK'), palette: ['#38bdf8', '#a78bfa', '#1e1b4b'],
      bones: [
        { name: 'wing_r', pivot: [-1, -4, 2.2], rotation: [0, -30, 0], cubes: [{ o: [-11, -6, 2.2], s: [10, 8, 0.4], c: 0 }, { o: [-9, -12, 2.2], s: [8, 6, 0.4], c: 1 }, { o: [-11.5, -6.5, 2.1], s: [11, 0.6, 0.6], c: 2 }] },
        { name: 'wing_l', pivot: [1, -4, 2.2], rotation: [0, 30, 0], cubes: [{ o: [1, -6, 2.2], s: [10, 8, 0.4], c: 0 }, { o: [1, -12, 2.2], s: [8, 6, 0.4], c: 1 }, { o: [0.5, -6.5, 2.1], s: [11, 0.6, 0.6], c: 2 }] }] },
    { meta: mrMeta('tie', 'Cravate', 'LANYARD', 'BODY', 'CHEST'), palette: ['#1d4ed8', '#1e3a8a'],
      bones: [{ name: 'tie', cubes: [{ o: [-1, -2, -2.4], s: [2, 1.5, 0.4], c: 1 }, { o: [-0.8, -7, -2.4], s: [1.6, 5, 0.4], c: 0 }, { o: [-0.5, -8, -2.4], s: [1, 1, 0.4], c: 0 }] }] },
    { meta: mrMeta('medal', 'Médaille d\'or', 'LANYARD', 'BODY', 'CHEST'), palette: ['#dc2626', '#facc15', '#ca8a04'],
      bones: [{ name: 'medal', cubes: [{ o: [-2.5, -2, -2.3], s: [1, 4, 0.3], c: 0, r: [0, 0, 25], p: [-2, 0, -2.3] }, { o: [1.5, -2, -2.3], s: [1, 4, 0.3], c: 0, r: [0, 0, -25], p: [2, 0, -2.3] }, { o: [-1.5, -6.5, -2.6], s: [3, 3, 0.5], c: 1 }, { o: [-0.5, -5.5, -2.8], s: [1, 1, 0.3], c: 2 }] }] },
    // ---------- pieds
    { meta: mrMeta('sneakers', 'Baskets', 'FEET', 'FEET', 'FEET'), palette: ['#f8fafc', '#ef4444', '#1f2937'],
      bones: [{ name: 'shoe', cubes: [{ o: [-2.3, -12.3, -2.6], s: [4.6, 2, 4.9], c: 0 }, { o: [-2.35, -12.4, -2.7], s: [4.7, 0.6, 5], c: 2 }, { o: [-2.4, -11.6, -1], s: [4.8, 1, 2.5], c: 1 }, { o: [-1.5, -10.4, -2.7], s: [3, 0.4, 0.3], c: 1 }] }] },
    { meta: mrMeta('boots', 'Bottes de cuir', 'FEET', 'FEET', 'FEET'), palette: ['#7c4a1e', '#5b3714', '#d4a373'],
      bones: [{ name: 'boot', cubes: [{ o: [-2.3, -12.3, -2.8], s: [4.6, 1.5, 5.1], c: 1 }, { o: [-2.25, -10.8, -2.3], s: [4.5, 5, 4.6], c: 0 }, { o: [-2.4, -6.2, -2.4], s: [4.8, 0.8, 4.8], c: 2 }] }] },
    // ---------- compagnons
    { meta: mrMeta('slime', 'Slime flottant', 'PETS', 'BODY', 'SHOULDER', { type: 'FLYING_PET' }), palette: ['#84cc16', '#4d7c0f', '#14532d'],
      bones: [{ name: 'slime', cubes: [{ o: [-3, 0, -3], s: [6, 6, 6], c: 0 }, { o: [-1.5, 1.5, -1.5], s: [3, 3, 3], c: 1 }, { o: [-2, 3.5, -3.2], s: [1, 1, 0.3], c: 2 }, { o: [1, 3.5, -3.2], s: [1, 1, 0.3], c: 2 }] }] },
    { meta: mrMeta('parrot', 'Perroquet', 'PETS', 'BODY', 'SHOULDER', { type: 'SHOULDER_PET' }), palette: ['#dc2626', '#facc15', '#2563eb', '#111827'],
      bones: [{ name: 'parrot', cubes: [{ o: [-1.5, 0, -1.5], s: [3, 4, 3], c: 0 }, { o: [-1, 4, -2], s: [2, 2, 2.5], c: 0 }, { o: [-0.5, 4.5, -3], s: [1, 1, 1], c: 1 },
        { o: [-1.8, 0.5, -1], s: [0.4, 3, 2], c: 2 }, { o: [1.4, 0.5, -1], s: [0.4, 3, 2], c: 2 }, { o: [-0.5, -1, 1], s: [1, 2, 1], c: 2 }, { o: [-0.9, 5, -2.1], s: [0.3, 0.5, 0.3], c: 3 }, { o: [0.6, 5, -2.1], s: [0.3, 0.5, 0.3], c: 3 }] }] },
  ];
  /* géométrie Bedrock + texture-palette (2×2 px par couleur), comme builtinGeo de MC-RENDER */
  function paletteGeo(def) {
    const cell = 2, cols = Math.max(1, def.palette.length);
    const c = document.createElement("canvas"); c.width = cols * cell; c.height = cell;
    const g = c.getContext("2d");
    def.palette.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * cell, 0, cell, cell); });
    const bones = def.bones.map((b) => ({
      name: b.name, pivot: b.pivot ?? [0, 0, 0], rotation: b.rotation,
      cubes: b.cubes.map((cu) => {
        const uv = {};
        for (const d of ["north", "south", "east", "west", "up", "down"]) uv[d] = { uv: [cu.c * cell + 0.5, 0.5], uv_size: [1, 1] };
        return { origin: cu.o, size: cu.s, pivot: cu.p, rotation: cu.r, uv };
      }),
    }));
    return { geo: { "minecraft:geometry": [{ description: { texture_width: cols * cell, texture_height: cell }, bones }] }, texture: c.toDataURL("image/png") };
  }

  /* haut-de-forme SUNRISE (format Bedrock : avant = -Z, tête depuis le cou, dessus à y = 8) */
  const SUNRISE_COSMETICS = [
    { meta: mrMeta("sunrise_tophat", "Haut-de-forme SUNRISE", "HAT", "HEAD", "HEAD_TOP"), palette: ["#1d1d22", "#27272e", "#212127", "#f08a24", "#ffd84a", "#2c2c34"],
      bones: [{ name: "hat", pivot: [0, 6.7, 0], cubes: [
        { o: [-6.5, 6.25, -6.5], s: [13, 0.85, 13], c: 0 }, { o: [-6.2, 7.1, -6.2], s: [12.4, 0.15, 12.4], c: 1 },
        { o: [-4.75, 7.1, -4.75], s: [9.5, 6.1, 9.5], c: 2 }, { o: [-4.85, 7.25, -4.85], s: [9.7, 1.45, 9.7], c: 3 },
        { o: [-4.9, 8.7, -4.9], s: [9.8, 0.25, 9.8], c: 4 }, { o: [-1.3, 7.4, -5.1], s: [2.6, 1.15, 0.25], c: 4 },
        { o: [-0.55, 7.7, -5.15], s: [1.1, 0.55, 0.25], c: 0 }, { o: [-4.55, 13.2, -4.55], s: [9.1, 0.25, 9.1], c: 5 }] }] },
  ];
  const ALL_COSM = [...SUNRISE_COSMETICS, ...MCR_COSMETICS];
  const COSMETICS = ALL_COSM.map((d) => d.meta);   /* métadonnées (id, nom, catégorie…) */
  /* rangement : chaque cosmétique (SUNRISE ou LabyMod) va dans UNE catégorie claire */
  const COSM_GROUPS = [
    { id: "hats", name: "Chapeaux" },
    { id: "head", name: "Tête & visage" },
    { id: "wings", name: "Ailes" },
    { id: "back", name: "Capes & dos" },
    { id: "body", name: "Corps" },
    { id: "feet", name: "Chaussures" },
    { id: "auras", name: "Auras" },
    { id: "pets", name: "Compagnons" },
  ];
  function groupOf(m) {
    const c = String(m?.category || "").toUpperCase(), p = String(m?.position || "").toUpperCase(), a = String(m?.attachedTo || "").toUpperCase();
    if (/PET/.test(m?.type || "") || c === "PETS" || c === "PARTNER") return "pets";
    if (c === "HAT") return "hats";
    if (c === "HEADGEAR" || c === "HEAD" || c === "FACE") return "head";
    if (c === "WING") return "wings";
    if (c === "CLOAK" || c === "BACK" || c === "TAIL") return "back";
    if (c === "AURA" || c === "UNDERGLOW") return "auras";
    if (c === "SHOES" || c === "FEET") return "feet";
    if (c === "BODY" || c === "ARMS" || c === "LANYARD") return "body";
    /* catégorie absente : on se fie à la position */
    if (p === "HEAD_TOP") return "hats";
    if (p === "FACE" || a === "HEAD") return "head";
    if (p === "FEET" || p === "LEGS_BACK" || a === "LEG") return "feet";
    if (p === "BACK") return "back";
    if (p === "SHOULDER") return "pets";
    return "body";
  }

  const geoCacheC = new Map();
  function cosmItem(id) {
    const def = ALL_COSM.find((d) => d.meta.id === id);
    if (!def) return null;
    let g = geoCacheC.get(id);
    if (!g) { g = paletteGeo(def); geoCacheC.set(id, g); }
    return { ...def.meta, geo: g.geo, texture: g.texture, colors: [] };
  }
  /* anciens identifiants (versions précédentes) */
  const COSM_ALIASES = { tophat: "b_sunrise_tophat", sunrise_tophat: "b_sunrise_tophat" };

  /* ---------- animateur des cosmétiques : textures animées + ailes, queues, compagnons ---------- */
  const CosmAnim = (() => {
    const list = new Set();
    let raf = 0;
    function loop(t) {
      raf = requestAnimationFrame(loop);
      for (const a of list) {
        if (!a.obj.parent) { list.delete(a); continue; }
        try { a.fn(t / 1000); } catch (_) { list.delete(a); }
      }
      if (!list.size) { cancelAnimationFrame(raf); raf = 0; }
    }
    function add(obj, fn) { list.add({ obj, fn }); if (!raf) raf = requestAnimationFrame(loop); }
    return { add };
  })();

  /* ---------- LabyMod : géométrie Bedrock → objets 3D (portage de MC-RENDER) ---------- */
  const Laby = (() => {
    const D2R = Math.PI / 180;
    function boxUV(u, v, size, mirror) {
      const w = Math.floor(size[0] + 1e-7), h = Math.floor(size[1] + 1e-7), d = Math.floor(size[2] + 1e-7);
      const f = {
        north: [u + d, v + d, u + d + w, v + d + h], east: [u, v + d, u + d, v + d + h],
        south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h], west: [u + d + w, v + d, u + 2 * d + w, v + d + h],
        up: [u + d + w, v + d, u + d, v], down: [u + d + 2 * w, v, u + d + w, v + d],
      };
      if (mirror) { const e = f.east; f.east = f.west; f.west = e; for (const k in f) { const r = f[k]; f[k] = [r[2], r[1], r[0], r[3]]; } }
      return f;
    }
    function corners(dir, f, t) {
      switch (dir) {
        case "south": return [[f[0], t[1], t[2]], [t[0], t[1], t[2]], [t[0], f[1], t[2]], [f[0], f[1], t[2]]];
        case "north": return [[t[0], t[1], f[2]], [f[0], t[1], f[2]], [f[0], f[1], f[2]], [t[0], f[1], f[2]]];
        case "east": return [[t[0], t[1], t[2]], [t[0], t[1], f[2]], [t[0], f[1], f[2]], [t[0], f[1], t[2]]];
        case "west": return [[f[0], t[1], f[2]], [f[0], t[1], t[2]], [f[0], f[1], t[2]], [f[0], f[1], f[2]]];
        case "up": return [[f[0], t[1], f[2]], [t[0], t[1], f[2]], [t[0], t[1], t[2]], [f[0], t[1], t[2]]];
        case "down": return [[f[0], f[1], t[2]], [t[0], f[1], t[2]], [t[0], f[1], f[2]], [f[0], f[1], f[2]]];
      }
    }
    /* constructeurs Three.js empruntés au skin (le bundle skinview3d n'exporte pas THREE) */
    function kit(v) {
      const inner = v.playerObject.skin.head.children.find((c) => c.geometry);
      const Mesh = inner.constructor, Box = inner.geometry.constructor;
      return {
        Mesh, Obj: Object.getPrototypeOf(Mesh), Geo: Object.getPrototypeOf(Box),
        Attr: inner.geometry.attributes.position.constructor, Mat: inner.material.constructor,
        Tex: inner.material.map.constructor, map: inner.material.map,
      };
    }
    /* attendre que le skin soit chargé (la texture du skin fournit le type Texture) */
    async function skinReady(v) {
      for (let i = 0; i < 100; i++) {
        const inner = v.playerObject?.skin?.head?.children?.find((c) => c.geometry);
        if (inner?.material?.map) return;
        await new Promise((r) => setTimeout(r, 80));
      }
      throw new Error("skin pas encore chargé");
    }
    async function build(v, item) {
      await skinReady(v);
      const K = kit(v);
      const geos = item.geo["minecraft:geometry"] || (item.geo.geometry ? [item.geo.geometry] : null);
      let geo = Array.isArray(geos) ? geos[0] : null;
      if (!geo) {
        const k = Object.keys(item.geo).find((x) => x.startsWith("geometry."));
        if (k) geo = { description: { texture_width: item.geo[k].texturewidth, texture_height: item.geo[k].textureheight }, bones: item.geo[k].bones };
      }
      if (!geo) throw new Error("géométrie introuvable");
      const tw = geo.description?.texture_width ?? 64, th = geo.description?.texture_height ?? 64;
      let tex = null, frames = 1, frameH = 0, frameCanvas = null, sheet = null;
      if (item.texture) {
        const img = await loadImg(item.texture);
        /* hauteur d'une image : frame_aspect_ratio de LabyMod, sinon proportions de la géométrie */
        /* une image = les proportions de la géométrie (texture_width × texture_height), quelle que soit
           la résolution (×1, ×4…) ; les images suivantes sont empilées dessous. frame_aspect_ratio ne
           sert qu'en secours : beaucoup de cosmétiques fixes l'ont à 1:1. */
        const fr = item.frameRatio;
        frameH = tw > 0 && th > 0 ? Math.round(img.width * th / tw) : (fr && fr.width > 0 ? Math.round(img.width * fr.height / fr.width) : img.height);
        if (!frameH || frameH > img.height) frameH = img.height;
        frames = Math.max(1, Math.floor(img.height / frameH + 0.01));
        frameCanvas = document.createElement("canvas"); frameCanvas.width = img.width; frameCanvas.height = frameH;
        frameCanvas.getContext("2d").drawImage(img, 0, 0, img.width, frameH, 0, 0, img.width, frameH);
        sheet = img;
        tex = new K.Tex(frameCanvas);
        tex.magFilter = K.map.magFilter; tex.minFilter = K.map.minFilter; tex.generateMipmaps = false;
        tex.flipY = K.map.flipY; tex.colorSpace = K.map.colorSpace; tex.needsUpdate = true;
      }
      const baseMat = new K.Mat({ map: tex, transparent: true, alphaTest: 0.1, side: 2 });
      if (!tex) baseMat.color.set(0xd0d0d0);
      const bones = geo.bones || [], groups = new Map(), roots = [];
      for (const b of bones) {
        const g = new K.Obj();
        g.name = b.name || "";
        const origin = b.pivot ? [-b.pivot[0], b.pivot[1], b.pivot[2]] : [0, 0, 0];
        const r = b.rotation ? [-b.rotation[0], -b.rotation[1], b.rotation[2]] : [0, 0, 0];
        g.userData = { origin, rot: r, parent: b.parent, mirror: !!b.mirror };
        groups.set(b.name, g);
        for (const c of b.cubes || []) {
          const size = c.size || [0, 0, 0], o = c.origin || [0, 0, 0], inf = c.inflate || 0;
          const from = [-(o[0] + size[0]), o[1], o[2]], to = [from[0] + size[0], from[1] + size[1], from[2] + size[2]];
          const piv = c.pivot ? [-c.pivot[0], c.pivot[1], c.pivot[2]] : origin;
          const rot = c.rotation ? [-c.rotation[0], -c.rotation[1], c.rotation[2]] : [0, 0, 0];
          let faces;
          if (Array.isArray(c.uv)) faces = boxUV(c.uv[0], c.uv[1], size, c.mirror ?? b.mirror);
          else if (c.uv && typeof c.uv === "object") {
            faces = {};
            for (const [dir, fd] of Object.entries(c.uv)) {
              if (!fd?.uv) continue;
              const [u, vv] = fd.uv, [sw, sh] = fd.uv_size || [0, 0];
              /* format Bedrock : les faces du dessus/dessous sont retournées (même règle que Blockbench) */
              faces[dir] = dir === "up" || dir === "down" ? [u + sw, vv + sh, u, vv] : [u, vv, u + sw, vv + sh];
            }
          }
          else faces = boxUV(0, 0, size, false);
          const f = [from[0] - piv[0] - inf, from[1] - piv[1] - inf, from[2] - piv[2] - inf];
          const t = [to[0] - piv[0] + inf, to[1] - piv[1] + inf, to[2] - piv[2] + inf];
          const pos = [], uv = [], idx = [];
          for (const dir of ["north", "south", "east", "west", "up", "down"]) {
            const fr = faces[dir]; if (!fr) continue;
            const q = corners(dir, f, t), base = pos.length / 3;
            const U = [[fr[0], fr[1]], [fr[2], fr[1]], [fr[2], fr[3]], [fr[0], fr[3]]];
            for (let i = 0; i < 4; i++) { pos.push(...q[i]); uv.push(U[i][0] / tw, 1 - U[i][1] / th); }
            idx.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
          }
          if (!idx.length) continue;
          const gg = new K.Geo();
          gg.setAttribute("position", new K.Attr(new Float32Array(pos), 3));
          gg.setAttribute("uv", new K.Attr(new Float32Array(uv), 2));
          gg.setIndex(idx);
          gg.computeVertexNormals();
          let mat = baseMat;
          if (/^glow/i.test(b.name || "")) { mat = baseMat.clone(); if (mat.emissive) { mat.emissive.set(0xffffff); mat.emissiveMap = tex; mat.emissiveIntensity = 1.2; } }
          const m = new K.Mesh(gg, mat);
          m.userData = { pivot: piv };
          m.rotation.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R, "ZYX");
          g.add(m);
        }
      }
      /* hiérarchie + positions relatives aux pivots parents */
      for (const g of groups.values()) {
        const pg = g.userData.parent && groups.get(g.userData.parent);
        const po = pg ? pg.userData.origin : [0, 0, 0];
        g.position.set(g.userData.origin[0] - po[0], g.userData.origin[1] - po[1], g.userData.origin[2] - po[2]);
        g.rotation.set(g.userData.rot[0] * D2R, g.userData.rot[1] * D2R, g.userData.rot[2] * D2R, "ZYX");
        for (const m of g.children) if (m.userData.pivot) { const p = m.userData.pivot, o = g.userData.origin; m.position.set(p[0] - o[0], p[1] - o[1], p[2] - o[2]); }
        if (pg) pg.add(g); else roots.push(g);
      }
      /* effet « pochoir » LabyMod : un grand fond visible seulement à travers la forme du premier
         plan (capes « hacker », portails…). Sans pochoir, on masque le fond. */
      const bgs = [...groups.values()].filter((g) => /background/i.test(g.name));
      if (bgs.length && [...groups.values()].some((g) => /foreground/i.test(g.name))) for (const g of bgs) g.visible = false;
      /* couleurs : os color_N_* teintés */
      if (item.colors?.length) {
        for (const g of groups.values()) {
          let p = g, ci = -1;
          while (p && ci < 0) { const mm = /^color_(\d+)/.exec(p.name || ""); if (mm) ci = +mm[1]; p = p.parent; }
          if (ci >= 0 && item.colors[ci]) for (const m of g.children) if (m.material) { m.material = m.material.clone(); m.material.color.set(item.colors[ci]); }
        }
      }
      /* LabyMod : un calque « layer_<id de texture> » par variante de texture (géométrie dupliquée).
         On ne garde que le calque de la texture choisie, sinon les faces identiques se superposent
         et clignotent (z-fighting). */
      const tid = String(item.texId || "").replace(/-/g, "").toLowerCase();
      const layerId = (r) => (r.name.match(/^layer_([0-9a-f]{32})/i) || [])[1]?.toLowerCase();
      const layers = roots.filter((r) => layerId(r));
      if (layers.length > 1) {
        let keep = layers.filter((r) => layerId(r) === tid);
        if (!keep.length) keep = [layers[0]];
        for (const r of layers) if (!keep.includes(r)) roots.splice(roots.indexOf(r), 1);
      }
      const turn = new K.Obj();
      turn.rotation.y = Math.PI;               /* modèles Bedrock tournés vers -Z */
      if (Array.isArray(item.offset)) turn.position.set(-(item.offset[0] || 0), item.offset[1] || 0, -(item.offset[2] || 0));
      turn.scale.setScalar(item.scale || 1);
      for (const r of roots) turn.add(r);
      const root = new K.Obj();
      root.name = "laby-" + item.id;
      root.add(turn);
      /* texture animée (images empilées verticalement) */
      if (frames > 1 && frameCanvas && sheet) {
        const delay = Math.max(40, item.frameDelay || 100) / 1000, g2 = frameCanvas.getContext("2d");
        let last = -1;
        CosmAnim.add(root, (t) => {
          const f = Math.floor(t / delay) % frames;
          if (f === last) return;
          last = f;
          g2.clearRect(0, 0, frameCanvas.width, frameH);
          g2.drawImage(sheet, 0, f * frameH, sheet.width, frameH, 0, 0, sheet.width, frameH);
          tex.needsUpdate = true;
        });
      }
      /* mouvements : ailes qui battent, queues qui balancent, compagnons qui flottent */
      const all = [...groups.values()];
      /* « rotationN » n'est qu'un pivot dans la plupart des modèles (ailes…) : on ne fait tourner que
         les auras / lueurs au sol, qui orbitent autour du joueur comme dans LabyMod */
      const isAura = ["AURA", "UNDERGLOW"].includes(String(item.category || "").toUpperCase());
      const spinners = isAura ? all.filter((g) => /spin|rotat/i.test(g.name)) : [];
      if (isAura) {
        const seedA = Math.random() * 6;
        CosmAnim.add(root, (t) => { turn.rotation.y = Math.PI + t * 0.5 + seedA; });
      }
      const physics = all.filter((g) => /^physics/i.test(g.name));
      const wings = physics.length ? [] : all.filter((g) => /wing/i.test(g.name) && !/^glow/i.test(g.name) && !g.parent?.name?.match(/wing/i));
      const tails = all.filter((g) => /tail|queue/i.test(g.name) && !/^physics/i.test(g.name));
      const isPet = /PET/.test(item.type || "") || item.category === "PETS";
      for (const g of [...spinners, ...physics]) g.userData.r0 = g.rotation.clone();
      if (spinners.length || physics.length) {
        const seed = Math.random() * 6;
        CosmAnim.add(root, (t) => {
          for (const g of spinners) {
            g.rotation.y = g.userData.r0.y + t * 1.1;
          }
          for (const g of physics) {
            /* physics_<amplitude>_<axes>_<sens>_… : balancement doux au repos */
            const m = g.name.match(/^physics_(\d+)_([a-z]+)?/i) || [];
            const amp = Math.min(40, parseFloat(m[1]) || 20) * Math.PI / 180 * 0.14;
            const code = (m[2] || "x").toLowerCase();
            /* « xz » = axes ; « nng », « fnn »… = un caractère par axe x/y/z (n/p mobile, f/g fixe) */
            const axes = /^[xyz]+$/.test(code) ? code : ["x", "y", "z"].filter((a, i) => /[np]/.test(code[i] || "")).join("") || "x";
            const side = /left|_l(\d|_|$)/i.test(g.name) ? 1 : /right|_r(\d|_|$)/i.test(g.name) ? -1 : 1;
            const k = Math.sin(t * 2.0 + seed);
            if (axes.includes("x")) g.rotation.x = g.userData.r0.x + amp * 0.5 * (k + 1) * 0.5;
            if (axes.includes("y")) g.rotation.y = g.userData.r0.y + side * amp * k;
            if (axes.includes("z")) g.rotation.z = g.userData.r0.z + side * amp * 0.6 * k;
          }
        });
      }
      if (wings.length || tails.length || isPet) {
        for (const g of [...wings, ...tails]) g.userData.r0 = g.rotation.clone();
        const y0 = root.position.y, seed = Math.random() * 6;
        CosmAnim.add(root, (t) => {
          const k = Math.sin(t * 2.2 + seed);
          for (const g of wings) {
            const nm = g.name.toLowerCase();
            const side = /left|gauche|(^|_)l(_|$)/.test(nm) ? -1 : /right|droit|(^|_)r(_|$)/.test(nm) ? 1 : (g.position.x >= 0 ? -1 : 1);
            g.rotation.y = g.userData.r0.y + side * 0.18 * k;
          }
          for (const g of tails) { g.rotation.y = g.userData.r0.y + 0.22 * Math.sin(t * 1.6 + seed); }
          if (isPet) turn.position.y = 0.8 * Math.sin(t * 1.8 + seed);
        });
        void y0;
      }
      return root;
    }
    function joints(v, item) {
      const s = v.playerObject.skin;
      if (item.type === "SHOULDER_PET") return [[s.body, [-5, 6, 0]]];
      if (item.type === "FLYING_PET") return [[s.body, [11, 12, 2]]];
      switch (item.attachedTo) {
        case "HEAD": return [[s.head, [0, 0, 0]]];
        case "ARM": return item.mirror || (/glove|hand|gant/i.test(item.name) && item.category === "ARMS") ? [[s.rightArm, [0, 2, 0]], [s.leftArm, [0, 2, 0], true]] : [[s.rightArm, [0, 2, 0]]];
        case "LEG": case "FEET":
          /* LabyMod : « mirror » = une pièce par jambe, la gauche en miroir */
          return item.mirror === false ? [[s.rightLeg, [0, 0, 0]]] : [[s.rightLeg, [0, 0, 0]], [s.leftLeg, [0, 0, 0], true]];
        default: return [[s.body, [0, 6, 0]]];
      }
    }
    async function attachAll(v, items, key = "__labyObjs") {
      const gen = (v[key + "Gen"] = (v[key + "Gen"] || 0) + 1);
      /* une cape LabyMod remplace la cape Minecraft */
      v.__hideCape = v.__hideCape || {};
      v.__hideCape[key] = items.some((it) => it.hideCape || it.category === "CLOAK");
      if (v.playerObject?.cape) v.playerObject.cape.visible = !v.__noCape && !Object.values(v.__hideCape).some(Boolean);
      for (const o of v[key] || []) o.parent?.remove(o);
      v[key] = [];
      for (const it of items) {
        for (const [joint, off, mirrored] of joints(v, it)) {
          try {
            const obj = await build(v, it);
            if (v[key + "Gen"] !== gen) return;       /* une mise à jour plus récente a pris le relais */
            obj.position.set(off[0], off[1], off[2]);
            if (mirrored) obj.scale.x = -1;
            joint.add(obj);
            v[key].push(obj);
          } catch (e) { console.warn("cosmétique", it.name, e); }
        }
      }
    }
    return { attachAll };
  })();

  /* catalogue public LabyMod : tous les cosmétiques, chargés à la demande */
  const LabyCatalog = (() => {
    let metas = null, pending = null, error = "";
    const items = new Map();
    function load() {
      if (metas) return Promise.resolve(metas);
      if (pending) return pending;
      const A = api();
      if (!A?.labyCatalog) { metas = []; return Promise.resolve(metas); }
      pending = A.labyCatalog().then((r) => {
        if (!r?.ok) { error = r?.error || "Catalogue LabyMod indisponible."; metas = []; return metas; }
        error = "";
        metas = (r.items || []).filter((m) => m && m.id);
        return metas;
      }).catch((e) => { error = e?.message || "Catalogue LabyMod indisponible."; metas = []; return metas; })
        .finally(() => { pending = null; });
      return pending;
    }
    function item(id) {
      if (items.has(id)) return Promise.resolve(items.get(id));
      const A = api();
      if (!A?.labyItem) return Promise.resolve(null);
      return A.labyItem(id)
        .then((r) => { const it = r?.ok ? r.item : null; if (it) items.set(id, it); return it; })
        .catch(() => null);
    }
    const meta = (id) => (metas || []).find((m) => m.id === id) || null;
    return { load, item, meta, get metas() { return metas; }, get error() { return error; } };
  })();

  const Cosmetics = (() => {
    const KEY = "sunrise-cosmetics";
    let equipped = (() => {
      try { return JSON.parse(localStorage.getItem(KEY) || "[]").map((id) => COSM_ALIASES[id] || id).filter((id) => COSMETICS.some((d) => d.id === id)); }
      catch { return []; }
    })();
    const viewers = new Set();
    const headCats = ["HAT", "HEADGEAR"];
    function hasHat(list) { return list.some((id) => headCats.includes(COSMETICS.find((d) => d.id === id)?.category)); }
    function refresh(v) {
      if (!v?.playerObject) return;
      const list = (v.__cosmOverride || equipped).map((id) => COSM_ALIASES[id] || id);
      /* un chapeau dépasse de la tête : on recule un peu la caméra */
      if (v.__z0 === undefined) v.__z0 = v.zoom;
      v.zoom = hasHat(list) ? v.__z0 * 0.86 : v.__z0;
      Laby.attachAll(v, list.map(cosmItem).filter(Boolean), "__cosmObjs");
    }
    function refreshAll() {
      for (const v of viewers) refresh(v);
      document.body?.classList.toggle("cosm-head", hasHat(equipped));
    }
    let labyItems = [], labyOn = (() => { try { return localStorage.getItem("sunrise-laby-cosm") !== "0"; } catch { return true; } })();
    /* cosmétiques LabyMod choisis dans le launcher (catalogue public, sans compte LabyMod) */
    const LKEY = "sunrise-laby-equipped";
    let labyEquipped = (() => { try { return JSON.parse(localStorage.getItem(LKEY) || "[]").map(String); } catch { return []; } })();
    async function applyLabyEquip(v) {
      if (!v?.playerObject || v.__cosmOverride) return;
      const gen = (v.__labyCatGen = (v.__labyCatGen || 0) + 1);
      const items = [];
      for (const id of labyEquipped) { const it = await LabyCatalog.item(id); if (it) items.push(it); }
      if (v.__labyCatGen !== gen) return;      /* une mise à jour plus récente a pris le relais */
      if (v.__z0 === undefined) v.__z0 = v.zoom;
      const hat = labyEquipped.some((id) => headCats.includes(LabyCatalog.meta(id)?.category));
      const base = (v.__cosmOverride || equipped).map((id) => COSM_ALIASES[id] || id);
      v.zoom = hat || hasHat(base) ? v.__z0 * 0.86 : v.__z0;
      Laby.attachAll(v, items, "__labyCatObjs");
    }
    function refreshLabyEquip() { for (const v of viewers) if (!v.__cosmOverride) applyLabyEquip(v); }
    function toggleLaby(id) {
      if (!id) return;
      if (labyEquipped.includes(id)) labyEquipped = labyEquipped.filter((x) => x !== id);
      else {
        const cat = LabyCatalog.meta(id)?.category || "";
        labyEquipped = [...(cat ? labyEquipped.filter((x) => LabyCatalog.meta(x)?.category !== cat) : labyEquipped), id];
      }
      try { localStorage.setItem(LKEY, JSON.stringify(labyEquipped)); } catch (_) {}
      /* un choix local remplace les cosmétiques portés sur le compte LabyMod */
      if (labyEquipped.length) for (const v of viewers) { for (const o of v.__labyObjs || []) o.parent?.remove(o); v.__labyObjs = []; }
      else for (const v of viewers) if (!v.__cosmOverride) Laby.attachAll(v, labyOn ? labyItems : []);
      refreshLabyEquip();
    }
    async function loadLaby() {
      const A = api();
      const uuid = typeof session !== "undefined" && session?.type === "msa" ? session.uuid : null;
      if (!A?.labyWorn || !uuid) { labyItems = []; return { ok: false, reason: "msa" }; }
      const r = await A.labyWorn(uuid);
      labyItems = r?.ok ? r.items : [];
      for (const v of viewers) if (!v.__cosmOverride) { if (labyEquipped.length) applyLabyEquip(v); else Laby.attachAll(v, labyOn ? labyItems : []); }
      return r;
    }
    function setLabyOn(on) {
      labyOn = !!on;
      try { localStorage.setItem("sunrise-laby-cosm", on ? "1" : "0"); } catch (_) {}
      for (const v of viewers) if (!v.__cosmOverride) Laby.attachAll(v, labyOn ? labyItems : []);
    }
    function attach(v) {
      if (!v) return;
      viewers.add(v);
      refresh(v);
      if (!v.__cosmOverride) {
        if (labyEquipped.length) applyLabyEquip(v);
        else if (labyOn && labyItems.length) Laby.attachAll(v, labyItems);
      }
      document.body?.classList.toggle("cosm-head", hasHat(equipped));
    }
    function set(list) {
      equipped = [...new Set(list)].filter((id) => COSMETICS.some((d) => d.id === id));
      try { localStorage.setItem(KEY, JSON.stringify(equipped)); } catch (_) {}
      refreshAll();
      publish();
    }
    /* un seul cosmétique par catégorie (un chapeau, une paire d'ailes…) */
    function toggle(id) {
      const def = COSMETICS.find((d) => d.id === id);
      if (!def) return;
      if (equipped.includes(id)) set(equipped.filter((e) => e !== id));
      else set([...equipped.filter((e) => COSMETICS.find((d) => d.id === e)?.category !== def.category), id]);
    }
    /* état visible par les autres joueurs SUNRISE (lu en jeu). ntfy.sh : sans compte. */
    async function publish() {
      try {
        const name = typeof session !== "undefined" ? session?.name : null;
        if (!name) return;
        await fetch("https://ntfy.sh/sunrise-cosm-" + encodeURIComponent(String(name).toLowerCase()), {
          method: "POST", body: JSON.stringify({ v: 2, name, items: equipped, t: Date.now() }),
        });
      } catch (_) { /* hors ligne : pas bloquant */ }
    }
    return { attach, refresh, refreshAll, toggle, set, publish, loadLaby, setLabyOn, toggleLaby, refreshLabyEquip, get equipped() { return [...equipped]; }, get laby() { return labyItems; }, get labyOn() { return labyOn; }, get labyEquipped() { return [...labyEquipped]; } };
  })();

  /* vignettes 3D des cosmétiques : un petit viewer hors écran, rendu une fois par cosmétique */
  const CosmThumbs = (() => {
    let v = null, ready = null;
    const cache = new Map(), queue = [];
    let busy = false;
    function init() {
      if (ready) return ready;
      const canvas = document.createElement("canvas");
      v = new skinview3d.SkinViewer({ canvas, width: 220, height: 220, preserveDrawingBuffer: true });
      v.background = null; v.fov = 30; v.renderPaused = true;
      if (v.controls) v.controls.enabled = false;
      v.playerObject.cape.visible = false;
      v.__noCape = true;
      ready = v.loadSkin(typeof MODE !== "undefined" && MODE.skin ? MODE.skin : "steve.png").catch(() => v.loadSkin("steve.png")).catch(() => {});
      return ready;
    }
    async function renderItem(item) {
      await init();
      v.__cosmOverride = [item.id];
      await Laby.attachAll(v, [item], "__cosmObjs");
      const s = v.playerObject.skin, gid = groupOf(item);
      /* cadrage : chaussures → jambes, ailes/capes → dos, chapeaux → tête… */
      /* repère : tête de 0 à 8, corps de -12 à 0, jambes de -24 à -12 */
      const F = {
        hats: [9, 38, -0.6, 6], head: [5, 30, -0.55, 3], feet: [-21, 24, -0.6, 8],
        wings: [-4, 66, Math.PI + 0.55, 6], back: [-6, 50, Math.PI + 0.55, 4],
        body: [-5, 40, -0.55, 3], auras: [-7, 78, -0.6, 6], pets: [-2, 76, -0.7, 8],
      }[gid] || [-6, 64, -0.6, 6];
      s.position.y = 0;
      const [ty, dist, yaw, up] = F;
      v.controls.target.set(0, ty, 0);
      v.camera.position.set(Math.sin(yaw) * dist, ty + up, Math.cos(yaw) * dist);
      v.camera.lookAt(0, ty, 0);
      s.position.y = 0;
      v.render();
      return v.canvas.toDataURL("image/png");
    }
    function get(id) {
      return once("cosm:" + id, () => { const item = cosmItem(id); if (!item) throw new Error("Cosmétique inconnu"); return renderItem(item); });
    }
    /* vignette d'un cosmétique LabyMod (catalogue public) */
    function getLaby(id) {
      return once("laby:" + id, async () => {
        const item = await LabyCatalog.item(id);
        if (!item) throw new Error("Cosmétique LabyMod indisponible");
        return renderItem(item);
      });
    }
    function once(key, fn) {
      if (cache.has(key)) return Promise.resolve(cache.get(key));
      return new Promise((ok) => { queue.push([key, fn, ok]); pump(); });
    }
    async function pump() {
      if (busy) return;
      busy = true;
      while (queue.length) {
        const [key, fn, ok] = queue.shift();
        try { const url = cache.get(key) || await fn(); cache.set(key, url); ok(url); } catch { ok(null); }
      }
      busy = false;
    }
    return { get, getLaby };
  })();


  /* ================================================================
     5. BIBLIOTHÈQUE DE SKINS (page Skins & capes)
     ================================================================ */
  const Library = (() => {
    const CATS = [
      ["", "Récents"], ["knight", "Chevalier"], ["anime", "Anime"], ["girl", "Fille"], ["boy", "Garçon"],
      ["ninja", "Ninja"], ["pirate", "Pirate"], ["robot", "Robot"], ["hoodie", "Hoodie"], ["zombie", "Zombie"],
      ["fox", "Renard"], ["cat", "Chat"], ["dragon", "Dragon"], ["santa", "Noël"], ["suit", "Costume"],
    ];
    let filter = "", after = null, busy = false, token = 0, mode = "gallery";
    let selected = null;   /* { texture|url, data, slim, label } */
    const seen = new Set();

    function init() {
      const cats = $("lib-cats");
      if (!cats || cats.dataset.ready) return;
      cats.dataset.ready = "1";
      cats.innerHTML = CATS.map(([q, l], i) => `<button type="button" class="mod-tab${i ? "" : " cur"}" data-q="${esc(q)}">${esc(l)}</button>`).join("");
      cats.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-q]"); if (!b) return;
        cats.querySelectorAll("button").forEach((x) => x.classList.toggle("cur", x === b));
        $("lib-search").value = "";
        start(b.dataset.q);
      });
      $("lib-go").addEventListener("click", () => search());
      $("lib-search").addEventListener("keydown", (e) => { if (e.key === "Enter") search(); });
      $("lib-player-go").addEventListener("click", () => player());
      $("lib-player").addEventListener("keydown", (e) => { if (e.key === "Enter") player(); });
      const grid = $("lib-grid");
      grid.addEventListener("scroll", () => { if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 260) more(); });
      grid.addEventListener("click", (e) => { const card = e.target.closest(".lib-card"); if (card?._skin) pick(card); });
      $("lib-apply").addEventListener("click", apply);
      $("lib-cancel").addEventListener("click", cancel);
      document.querySelectorAll("#custom-tabs [data-tab]").forEach((b) => b.addEventListener("click", () => tab(b.dataset.tab)));
      start("");
    }
    function tab(name) {
      document.querySelectorAll("#custom-tabs [data-tab]").forEach((b) => b.classList.toggle("cur", b.dataset.tab === name));
      $("custom-lib").classList.toggle("hidden", name !== "lib");
      $("custom-capes").classList.toggle("hidden", name !== "capes");
    }
    function search() {
      const q = $("lib-search").value.trim();
      document.querySelectorAll("#lib-cats button").forEach((x) => x.classList.toggle("cur", !q && x.dataset.q === ""));
      start(q);
    }
    function start(q) {
      mode = "gallery"; filter = q; after = null; seen.clear(); token++;
      $("lib-grid").innerHTML = "";
      setNote("");
      more();
    }
    function setNote(t) { const n = $("lib-note"); if (n) { n.textContent = t; n.classList.toggle("hidden", !t); } }
    async function more() {
      const A = api();
      if (busy || mode !== "gallery" || after === false) return;
      if (!A?.skinsList) { setNote("La bibliothèque fonctionne dans le launcher (Electron)."); return; }
      busy = true;
      const my = token;
      const grid = $("lib-grid");
      const loader = document.createElement("div"); loader.className = "lib-loading"; loader.textContent = "Chargement…";
      grid.appendChild(loader);
      try {
        const r = await A.skinsList({ after: after || "", filter, size: 30 });
        if (my !== token) return;
        if (!r?.ok) { setNote(r?.error || "Bibliothèque indisponible."); after = false; return; }
        if (r.blocked) { setNote("Cette recherche n'est pas autorisée par MineSkin. Essaie un autre mot."); after = false; return; }
        after = r.after || false;
        const fresh = r.skins.filter((s) => !seen.has(s.texture));
        fresh.forEach((s) => seen.add(s.texture));
        /* chaque texture est vérifiée puis affichée dès qu'elle arrive (seulement les skins complets) */
        await validate(fresh, my, (s) => { if (my === token) grid.insertBefore(card(s, s.name || (filter ? filter : "Skin"), s.texture, s.data, s.slim), loader); });
        if (my !== token) return;
        if (!grid.querySelector(".lib-card") && !after) setNote(filter ? "Aucun skin complet pour « " + filter + " »." : "Aucun skin pour le moment.");
        /* remplir l'écran si la grille ne défile pas encore */
        if (after && grid.scrollHeight <= grid.clientHeight + 40) setTimeout(more, 50);
      } catch (e) {
        setNote("Bibliothèque indisponible : " + (e?.message || e));
      } finally {
        loader.remove();
        busy = false;
      }
    }
    async function validate(list, my, onOk) {
      const out = new Array(list.length).fill(null);
      let i = 0;
      const worker = async () => {
        while (i < list.length && my === token) {
          const k = i++, s = list[k];
          try {
            const r = await api().skinsTexture(s.texture);
            if (!r?.ok) continue;
            const img = await loadImg(r.data);
            if (!isFullSkin(img)) continue;
            out[k] = { ...s, data: r.data, slim: img.height === 64 && isSlimImage(img) };
            onOk?.(out[k]);
          } catch (_) {}
        }
      };
      await Promise.all(Array.from({ length: 12 }, worker));
      return out.filter(Boolean);
    }
    function card(s, label, texture, data = null, slim = null) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "lib-card";
      el.innerHTML = `<div class="lib-thumb"><i class="lib-spin"></i></div><span>${esc(label)}</span>`;
      el._skin = { texture, data, slim, label };
      if (data) {
        loadImg(data).then((img) => { const th = el.querySelector(".lib-thumb"); th.innerHTML = ""; th.appendChild(frontRender(img, 5, el._skin.slim ?? null)); }).catch(() => {});
        return el;
      }
      const io = new IntersectionObserver(async (en) => {
        if (!en.some((x) => x.isIntersecting)) return;
        io.disconnect();
        try {
          let d = data;
          if (!d) { const r = await api().skinsTexture(texture); if (!r?.ok) throw new Error(r?.error); d = r.data; }
          const img = await loadImg(d);
          el._skin.data = d;
          if (el._skin.slim === null) el._skin.slim = img.height === 64 && isSlimImage(img);
          const c = frontRender(img, 5, el._skin.slim);
          const th = el.querySelector(".lib-thumb"); th.innerHTML = ""; th.appendChild(c);
        } catch { el.classList.add("broken"); el.querySelector(".lib-thumb").innerHTML = "<em>indisponible</em>"; }
      }, { root: $("lib-grid"), rootMargin: "200px" });
      io.observe(el);
      return el;
    }
    async function player() {
      const A = api();
      const name = $("lib-player").value.trim();
      if (!name) return;
      if (!A?.skinsPlayer) return;
      mode = "player"; token++;
      const grid = $("lib-grid");
      grid.innerHTML = ""; setNote("Recherche de " + name + "…");
      const r = await A.skinsPlayer(name);
      if (!r?.ok) { setNote(r?.error || "Joueur introuvable."); return; }
      setNote("");
      const el = card(null, r.name, r.url, r.data, r.slim);
      el._skin.url = r.url;
      grid.appendChild(el);
      pick(el);
    }
    function preview() { return (typeof VIEWERS !== "undefined" && VIEWERS.get("custom-skin")?.v) || null; }
    function pick(el) {
      if (!el._skin.data) return;
      document.querySelectorAll(".lib-card.sel").forEach((x) => x.classList.remove("sel"));
      el.classList.add("sel");
      selected = el._skin;
      const v = preview();
      if (v) v.loadSkin(selected.data, { model: selected.slim ? "slim" : "default" }).catch(() => {});
      $("lib-pick-name").textContent = selected.label || "Skin";
      $("lib-pick").classList.remove("hidden");
      $("lib-apply-note").textContent = isMsa() ? "Il sera visible en jeu par tout le monde." : "Compte hors-ligne : visible dans le launcher (Minecraft affiche ton skin seulement avec un compte Microsoft).";
    }
    function cancel() {
      if (!selected) { $("lib-pick")?.classList.add("hidden"); return; }
      selected = null;
      document.querySelectorAll(".lib-card.sel").forEach((x) => x.classList.remove("sel"));
      $("lib-pick").classList.add("hidden");
      const v = preview();
      if (v && MODE.skin) v.loadSkin(MODE.skin, { model: MODE.slim ? "slim" : "auto-detect" }).catch(() => {});
    }
    async function apply() {
      if (!selected) return;
      const btn = $("lib-apply");
      btn.disabled = true;
      try {
        const url = selected.url || (selected.texture ? "https://textures.minecraft.net/texture/" + selected.texture : null);
        await applySkin({ data: selected.data, url, slim: selected.slim });
        $("lib-pick").classList.add("hidden");
        selected = null;
      } finally { btn.disabled = false; }
    }
    return { init, tab, cancel };
  })();

  /* appliquer un skin : compte Microsoft = Mojang ; hors-ligne = skin local */
  async function applySkin({ data, url = null, slim = false }) {
    const A = api();
    if (!A) { say("Disponible dans le launcher."); return false; }
    if (isMsa()) {
      const r = await A.mcSetSkin(slim ? "slim" : "classic", url ? null : data, url);
      if (!r?.ok) { say(r?.error || "Changement de skin impossible", 5200); return false; }
      if (r.head) session.head = r.head;
      if (typeof refreshDoll === "function") await refreshDoll();
      say("Skin appliqué ✓ (visible en jeu)");
    } else {
      const r = await A.skinsSaveLocal?.(data, slim);
      if (r && !r.ok) { say(r.error || "Enregistrement impossible"); return false; }
      MODE.skin = data; MODE.slim = !!slim;
      if (typeof updateSkinRender === "function") updateSkinRender();
      for (const id of ["skin-render", "custom-skin"]) { const e = VIEWERS.get(id); if (e) { e.v.loadSkin(data, { model: slim ? "slim" : "default" }).catch(() => {}); e.skin = data; } }
      try {
        const img = await loadImg(data);
        const c = document.createElement("canvas"); c.width = c.height = 8;
        const g = c.getContext("2d"); g.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8); g.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
        session.head = c.toDataURL();
        const av = $("avatar-img"); if (av) av.src = session.head;
      } catch (_) {}
      say("Skin enregistré ✓ (visible dans le launcher)");
    }
    return true;
  }

  /* ================================================================
     6. CRÉATEUR DE SKIN
     ================================================================ */
  const Creator = (() => {
    const KEY = "sunrise-creator";
    let look = (() => { try { return { ...structuredClone(DEFAULT_LOOK), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return structuredClone(DEFAULT_LOOK); } })();
    let cat = "hair", viewer = null, pending = 0;
    const WARD = {
      hair: ["hair", "hat", "crown", "helmet", "cap", "anime", "bunny", "witch"],
      top: ["hoodie", "jacket", "suit", "armor", "dress", "sweater", "uniform", "shirt", "kimono"],
      bottom: ["jeans", "skirt", "shorts", "pants", "suit", "armor"],
      shoes: ["boots", "sneakers", "shoes", "armor", "socks"],
    };
    let wardMode = false, wardTerm = "", wardAfter = null, wardBusy = false, wardToken = 0;

    function init() {
      const host = $("creator-skin");
      if (!host) return;
      if (!viewer && host.clientWidth) viewer = makeViewer(host, { yaw: -28 });
      const tabs = $("creator-tabs");
      if (!tabs.dataset.ready) {
        tabs.dataset.ready = "1";
        tabs.innerHTML = Object.entries(OPTS).map(([k, o]) => `<button type="button" class="mod-tab${k === cat ? " cur" : ""}" data-cat="${k}">${esc(o.label)}</button>`).join("");
        tabs.addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (!b) return; cat = b.dataset.cat; if (!WARD[cat]) wardMode = false; else if (wardMode) wardTerm = WARD[cat][0]; tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("cur", x === b)); renderOptions(); });
        $("creator-styles").addEventListener("click", (e) => { const b = e.target.closest("[data-style]"); if (!b) return; look[cat] = { style: b.dataset.style, color: look[cat].color }; changed(true); });
        $("creator-colors").addEventListener("click", (e) => { const b = e.target.closest("[data-color]"); if (!b) return; look[cat].color = b.dataset.color; changed(true); });
        $("creator-color-custom").addEventListener("input", (e) => { look[cat].color = e.target.value; changed(false); });
        $("creator-color-custom").addEventListener("change", () => renderOptions());
        $("creator-model").addEventListener("change", (e) => { look.slim = e.target.value === "slim"; changed(true); });
        $("creator-random").addEventListener("click", randomize);
        $("creator-reset").addEventListener("click", () => { look = structuredClone(DEFAULT_LOOK); changed(true); });
        $("creator-download").addEventListener("click", download);
        $("creator-apply").addEventListener("click", async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try { await applySkin({ data: generateSkin(look).toDataURL("image/png"), slim: look.slim }); } finally { btn.disabled = false; }
        });
      }
      /* recharger les pièces de garde-robe déjà choisies */
      for (const k of Object.keys(WARD)) {
        const p = look[k];
        if (p?.style === "lib" && p.src && p.srcData && !SRC.has(p.src)) loadImg(p.srcData).then((img) => { SRC.set(p.src, img); updatePreview(); renderOptions(); }).catch(() => {});
      }
      $("creator-model").value = look.slim ? "slim" : "classic";
      $("creator-apply-note").textContent = isMsa() ? "Appliquer l'envoie sur ton compte Microsoft : visible en jeu." : "Compte hors-ligne : le skin s'affiche dans le launcher.";
      renderOptions();
      updatePreview();
    }
    function changed(rerender) {
      try { localStorage.setItem(KEY, JSON.stringify(look)); } catch (_) {}
      updatePreview();
      if (rerender) renderOptions();
    }
    function updatePreview() {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        const c = generateSkin(look);
        if (!viewer) { const host = $("creator-skin"); if (host?.clientWidth) viewer = makeViewer(host, { yaw: -28 }); }
        viewer?.loadSkin(c, { model: look.slim ? "slim" : "default" });
      });
    }
    function modeBar() {
      let bar = $("creator-mode");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "creator-mode"; bar.className = "creator-mode";
        $("creator-styles").before(bar);
        bar.addEventListener("click", (e) => {
          const m = e.target.closest("[data-mode]");
          if (m) { wardMode = m.dataset.mode === "ward"; if (wardMode) wardTerm = WARD[cat][0]; renderOptions(); return; }
          const t = e.target.closest("[data-term]");
          if (t) { wardTerm = t.dataset.term; renderOptions(); }
        });
        bar.addEventListener("keydown", (e) => { if (e.target.id === "ward-q" && e.key === "Enter") { wardTerm = e.target.value.trim() || WARD[cat][0]; renderOptions(); } });
        $("creator-styles").addEventListener("scroll", () => { const g = $("creator-styles"); if (wardMode && g.scrollTop + g.clientHeight > g.scrollHeight - 220) wardMore(); });
      }
      if (!WARD[cat]) { bar.classList.add("hidden"); wardMode = false; return; }
      bar.classList.remove("hidden");
      bar.innerHTML = `<div class="creator-mode-tabs">
          <button type="button" class="mod-tab${wardMode ? "" : " cur"}" data-mode="models">Modèles SUNRISE</button>
          <button type="button" class="mod-tab${wardMode ? " cur" : ""}" data-mode="ward">Garde-robe communauté</button>
        </div>` + (wardMode ? `<div class="creator-terms">${WARD[cat].map((t) => `<button type="button" class="chip-t${t === wardTerm ? " cur" : ""}" data-term="${t}">${t}</button>`).join("")}
          <input id="ward-q" class="inst-input" placeholder="Autre mot-clé…" spellcheck="false" value="${WARD[cat].includes(wardTerm) ? "" : esc(wardTerm)}"></div>` : "");
    }
    async function wardMore() {
      if (wardBusy || wardAfter === false) return;
      wardBusy = true;
      const my = wardToken, grid = $("creator-styles");
      const loader = document.createElement("div"); loader.className = "lib-loading"; loader.textContent = "Recherche de pièces…";
      grid.appendChild(loader);
      try {
        const r = await fullSkinsPage(wardTerm, wardAfter, () => my === wardToken, (it) => { if (my === wardToken) grid.insertBefore(wardTile(it), loader); });
        if (my !== wardToken) return;
        if (!r.ok) { loader.textContent = r.error || "Garde-robe indisponible."; wardAfter = false; return; }
        wardAfter = r.after;
        loader.remove();
        if (!grid.querySelector(".creator-opt") && !wardAfter) grid.insertAdjacentHTML("beforeend", `<div class="lib-loading">Aucune pièce pour « ${esc(wardTerm)} ».</div>`);
        if (wardAfter && grid.scrollHeight <= grid.clientHeight + 40) setTimeout(wardMore, 50);
      } finally { loader.remove(); wardBusy = false; }
    }
    function wardTile(it) {
      const variant = structuredClone(look);
      variant[cat] = { style: "lib", color: look[cat].color, src: it.texture };
      if (cat === "top") variant.slim = it.slim;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "creator-opt" + (look[cat].style === "lib" && look[cat].src === it.texture ? " cur" : "");
      b.appendChild(thumbFor(variant, cat, null));
      const s = document.createElement("span"); s.textContent = it.name || wardTerm; b.appendChild(s);
      b.addEventListener("click", () => {
        look[cat] = { style: "lib", color: look[cat].color, src: it.texture, srcData: it.data };
        if (cat === "top") look.slim = it.slim;
        $("creator-model").value = look.slim ? "slim" : "classic";
        try { localStorage.setItem(KEY, JSON.stringify(look)); } catch (_) {}
        updatePreview();
        $("creator-styles").querySelectorAll(".creator-opt.cur").forEach((x) => x.classList.remove("cur"));
        b.classList.add("cur");
      });
      return b;
    }
    function thumbFor(variant, c, id) {
      const thumb = frontRender(generateSkin(variant), 4, variant.slim);
      const box = document.createElement("div"); box.className = "creator-thumb";
      if (c === "hair" || c === "eyes" || c === "skin" || (c === "acc" && ["lunettes", "soleil", "casquette", "bandeau", "casque"].includes(id))) {
        const z = document.createElement("canvas"); z.width = 64; z.height = 64;
        const g = z.getContext("2d"); g.imageSmoothingEnabled = false;
        g.drawImage(thumb, 16, 0, 32, 32, 0, 0, 64, 64);
        box.appendChild(z);
      } else box.appendChild(thumb);
      return box;
    }
    function renderOptions() {
      const o = OPTS[cat];
      const styles = $("creator-styles");
      styles.innerHTML = "";
      modeBar();
      $("creator-colors").parentElement.classList.toggle("hidden", wardMode);
      if (wardMode) { wardToken++; wardAfter = null; wardBusy = false; styles.scrollTop = 0; wardMore(); return; }
      for (const [id, label] of o.styles) {
        const variant = structuredClone(look);
        variant[cat].style = id;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "creator-opt" + (look[cat].style === id ? " cur" : "");
        b.dataset.style = id;
        b.appendChild(thumbFor(variant, cat, id));
        const s = document.createElement("span"); s.textContent = label; b.appendChild(s);
        styles.appendChild(b);
      }
      const colors = $("creator-colors");
      const pal = PAL[o.color] || PAL.cloth;
      colors.innerHTML = pal.map((c) => `<button type="button" class="creator-swatch${look[cat].color.toLowerCase() === c ? " cur" : ""}" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join("");
      $("creator-color-custom").value = look[cat].color;
      $("creator-color-label").textContent = cat === "skin" ? "Teint" : cat === "eyes" ? "Couleur des yeux" : cat === "hair" ? "Couleur des cheveux" : "Couleur";
    }
    function randomize() {
      const r = (a) => a[Math.floor(Math.random() * a.length)];
      for (const [k, o] of Object.entries(OPTS)) look[k] = { style: r(o.styles)[0], color: r(PAL[o.color]) };
      if (Math.random() < .5) look.acc.style = "aucun";
      changed(true);
    }
    function download() {
      const a = document.createElement("a");
      a.href = generateSkin(look).toDataURL("image/png");
      a.download = "skin-sunrise.png";
      a.click();
    }
    return { init };
  })();

  /* ================================================================
     7. PAGE COSMÉTIQUES
     ================================================================ */
  const CosmPage = (() => {
    let viewer = null, group = "hats", query = "", io = null, token = 0;
    const CAT_FR = { hats: "Chapeau", head: "Tête", wings: "Ailes", back: "Dos", body: "Corps", feet: "Chaussures", auras: "Aura", pets: "Compagnon" };
    function init() {
      const host = $("cosm-skin");
      if (host && !viewer && host.clientWidth) viewer = makeViewer(host, { yaw: -32, zoom: 0.62 });
      if (viewer && typeof MODE !== "undefined" && MODE.skin && viewer.__skin !== MODE.skin) { viewer.loadSkin(MODE.skin).catch(() => {}); viewer.__skin = MODE.skin; }
      if (viewer && typeof MODE !== "undefined" && MODE.cape && viewer.__cape !== MODE.cape) { viewer.loadCape(MODE.cape).catch(() => {}); viewer.__cape = MODE.cape; }
      const tabs = $("cosm-tabs");
      if (tabs && !tabs.dataset.ready) {
        tabs.dataset.ready = "1";
        tabs.innerHTML = COSM_GROUPS.map((g) => `<button type="button" class="mod-tab${g.id === group ? " cur" : ""}" data-g="${g.id}">${esc(g.name)}</button>`).join("")
          + `<input type="text" class="inst-input cosm-search" id="cosm-search" placeholder="Chercher…" spellcheck="false">`;
        tabs.addEventListener("click", (e) => {
          const b = e.target.closest("[data-g]"); if (!b) return;
          group = b.dataset.g; query = ""; $("cosm-search").value = "";
          tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("cur", x === b));
          render();
        });
        $("cosm-search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); render(); });
      }
      render();
      LabyCatalog.load().then(() => render());
    }
    /* un seul cosmétique par catégorie, toutes sources confondues */
    function wear(entry) {
      const g = entry.group;
      if (entry.src === "sunrise") {
        const on = Cosmetics.equipped.includes(entry.id);
        if (!on) for (const id of Cosmetics.labyEquipped) if (groupOf(LabyCatalog.meta(id)) === g) Cosmetics.toggleLaby(id);
        if (!on) Cosmetics.set([...Cosmetics.equipped.filter((id) => groupOf(COSMETICS.find((d) => d.id === id)) !== g), entry.id]);
        else Cosmetics.set(Cosmetics.equipped.filter((id) => id !== entry.id));
      } else {
        const on = Cosmetics.labyEquipped.includes(entry.id);
        if (!on) {
          Cosmetics.set(Cosmetics.equipped.filter((id) => groupOf(COSMETICS.find((d) => d.id === id)) !== g));
          for (const id of Cosmetics.labyEquipped) if (id !== entry.id && groupOf(LabyCatalog.meta(id)) === g) Cosmetics.toggleLaby(id);
        }
        Cosmetics.toggleLaby(entry.id);
      }
      sync();
    }
    function isOn(e) { return e.src === "sunrise" ? Cosmetics.equipped.includes(e.id) : Cosmetics.labyEquipped.includes(e.id); }
    function entries() {
      const out = COSMETICS.map((d) => ({ src: "sunrise", id: d.id, name: d.name, group: groupOf(d) }));
      for (const m of LabyCatalog.metas || []) out.push({ src: "laby", id: m.id, name: m.name, group: groupOf(m) });
      return out;
    }
    function sync() {
      for (const el of document.querySelectorAll("#cosm-grid .cosm-card")) {
        const on = isOn(el._entry);
        el.classList.toggle("on", on);
        const b = el.querySelector("button");
        b.textContent = on ? "Retirer" : "Porter";
        b.className = on ? "btn-secondary" : "btn-primary";
      }
    }
    function render() {
      const grid = $("cosm-grid");
      if (!grid) return;
      const my = ++token;
      io?.disconnect();
      grid.innerHTML = "";
      let list = entries();
      list = query ? list.filter((e) => e.name.toLowerCase().includes(query)) : list.filter((e) => e.group === group);
      /* SUNRISE d'abord, puis ordre alphabétique */
      list.sort((a, b) => (a.src === b.src ? a.name.localeCompare(b.name, "fr") : a.src === "sunrise" ? -1 : 1));
      if (!list.length) {
        grid.innerHTML = `<p class="auth-note cosm-empty">${LabyCatalog.metas === null ? "Chargement du catalogue…" : query ? "Aucun cosmétique trouvé." : "Rien dans cette catégorie pour le moment."}</p>`;
        return;
      }
      io = new IntersectionObserver((en) => {
        for (const e of en) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const el = e.target, it = el._entry;
          (it.src === "sunrise" ? CosmThumbs.get(it.id) : CosmThumbs.getLaby(it.id)).then((url) => {
            if (my !== token) return;
            const t = el.querySelector(".cosm-thumb");
            if (t) t.innerHTML = url ? `<img src="${url}" alt="">` : `<span class="laby-fallback">${esc(CAT_FR[it.group] || "")}</span>`;
          });
        }
      }, { root: grid, rootMargin: "200px" });
      for (const e of list) {
        const el = document.createElement("div");
        el._entry = e;
        el.className = "cosm-card";
        el.innerHTML = `<div class="cosm-thumb"><i class="lib-spin"></i></div>
          <div class="cosm-info"><b>${esc(e.name)}</b><em>${esc(CAT_FR[e.group] || "Cosmétique")}${e.src === "sunrise" ? " · SUNRISE" : ""}</em></div>
          <button type="button" class="btn-primary">Porter</button>`;
        el.querySelector("button").addEventListener("click", () => wear(e));
        grid.appendChild(el);
        io.observe(el);
      }
      sync();
    }
    return { init };
  })();

  /* ================================================================
     8. BRANCHEMENTS
     ================================================================ */
  function onPage(name) {
    if (name === "custom") { Library.init(); }
    else Library.cancel?.();
    if (name === "creator") setTimeout(() => Creator.init(), 30);
    if (name === "cosmetics") setTimeout(() => CosmPage.init(), 30);
  }
  window.SunriseStudio = { onPage, generateSkin, frontRender, applySkin, DEFAULT_LOOK, COSMETICS };
  window.SunriseCosmetics = Cosmetics;
  window.SunriseCosmetics.__debugAttach = (v, items) => Laby.attachAll(v, items, "__dbgObjs");
})();
