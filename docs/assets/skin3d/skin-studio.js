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
  async function fullSkinsPage(filter, after, alive = () => true) {
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
        } catch (_) {}
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
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
  const COSMETICS = [
    {
      id: "tophat", name: "Haut-de-forme SUNRISE", slot: "head",
      desc: "Le grand classique, avec son ruban couleur lever de soleil.",
      /* pivot = centre du bord, posé autour du haut du crâne (la tête va de y=0 à 8) */
      pivot: [0, 6.7, 0], tilt: [-4, 0, 3],
      parts: [
        /* bord */            { from: [-6.5, -0.45, -6.5], to: [6.5, 0.4, 6.5], color: "#1d1d22" },
        /* bord, dessus */    { from: [-6.2, 0.4, -6.2], to: [6.2, 0.55, 6.2], color: "#27272e" },
        /* calotte */         { from: [-4.75, 0.4, -4.75], to: [4.75, 6.5, 4.75], color: "#212127" },
        /* ruban */           { from: [-4.85, 0.55, -4.85], to: [4.85, 2.0, 4.85], color: "#f08a24" },
        /* liseré */          { from: [-4.9, 2.0, -4.9], to: [4.9, 2.25, 4.9], color: "#ffd84a" },
        /* boucle */          { from: [-1.3, 0.7, 4.85], to: [1.3, 1.85, 5.1], color: "#ffd84a" },
        /* centre boucle */   { from: [-0.55, 1.0, 4.9], to: [0.55, 1.55, 5.15], color: "#1d1d22" },
        /* dessus */          { from: [-4.55, 6.5, -4.55], to: [4.55, 6.75, 4.55], color: "#2c2c34" },
      ],
    },
  ];
  const Cosmetics = (() => {
    const KEY = "sunrise-cosmetics";
    let equipped = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } })();
    const viewers = new Set();

    function build(v, def) {
      const head = v.playerObject.skin.head;
      const mesh = head.innerLayer || head.children.find((c) => c.geometry);
      const Mesh = mesh.constructor, Geo = mesh.geometry.constructor;
      const Mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).constructor;
      const Obj = Object.getPrototypeOf(Mesh);   /* Object3D */
      const root = new Obj();
      root.name = "cosm-" + def.id;
      const mats = new Map();
      for (const p of def.parts) {
        const [x1, y1, z1] = p.from, [x2, y2, z2] = p.to;
        const geo = new Geo(x2 - x1, y2 - y1, z2 - z1);
        let mat = mats.get(p.color);
        if (!mat) {
          mat = new Mat({ color: parseInt(p.color.slice(1), 16) });
          if ("roughness" in mat) mat.roughness = .85;
          if ("metalness" in mat) mat.metalness = 0;
          mats.set(p.color, mat);
        }
        const m = new Mesh(geo, mat);
        m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        root.add(m);
      }
      if (def.pivot) root.position.set(def.pivot[0], def.pivot[1], def.pivot[2]);
      if (def.tilt) root.rotation.set(def.tilt[0] * Math.PI / 180, def.tilt[1] * Math.PI / 180, def.tilt[2] * Math.PI / 180);
      return root;
    }
    function refresh(v) {
      const head = v?.playerObject?.skin?.head;
      if (!head) return;
      for (const c of [...head.children]) if (String(c.name).startsWith("cosm-")) head.remove(c);
      const list = v.__cosmOverride || equipped;
      /* un chapeau dépasse de la tête : on recule un peu la caméra */
      if (v.__z0 === undefined) v.__z0 = v.zoom;
      const hasHead = list.some((id) => COSMETICS.find((d) => d.id === id)?.slot === "head");
      v.zoom = hasHead ? v.__z0 * 0.86 : v.__z0;
      for (const id of list) {
        const def = COSMETICS.find((d) => d.id === id);
        if (def && def.slot === "head") { try { head.add(build(v, def)); } catch (e) { console.warn("cosmétique", e); } }
      }
    }
    function attach(v) { if (!v) return; viewers.add(v); refresh(v); document.body?.classList.toggle("cosm-head", equipped.some((id) => COSMETICS.find((d) => d.id === id)?.slot === "head")); }
    function refreshAll() {
      for (const v of viewers) refresh(v);
      document.body?.classList.toggle("cosm-head", equipped.some((id) => COSMETICS.find((d) => d.id === id)?.slot === "head"));
    }
    function set(list) {
      equipped = [...new Set(list)].filter((id) => COSMETICS.some((d) => d.id === id));
      try { localStorage.setItem(KEY, JSON.stringify(equipped)); } catch (_) {}
      refreshAll();
      publish();
    }
    function toggle(id) {
      const def = COSMETICS.find((d) => d.id === id);
      if (!def) return;
      const sameSlot = equipped.filter((e) => COSMETICS.find((d) => d.id === e)?.slot === def.slot);
      if (equipped.includes(id)) set(equipped.filter((e) => e !== id));
      else set([...equipped.filter((e) => !sameSlot.includes(e)), id]);
    }
    /* état visible par les autres joueurs SUNRISE (lu par le mod en jeu).
       ntfy.sh : sans compte, comme le réseau d'amis ; republié au lancement. */
    async function publish() {
      try {
        const name = typeof session !== "undefined" ? session?.name : null;
        if (!name) return;
        await fetch("https://ntfy.sh/sunrise-cosm-" + encodeURIComponent(String(name).toLowerCase()), {
          method: "POST", body: JSON.stringify({ v: 1, name, items: equipped, t: Date.now() }),
        });
      } catch (_) { /* hors ligne : ce n'est pas bloquant */ }
    }
    return { attach, refresh, refreshAll, toggle, set, publish, get equipped() { return [...equipped]; } };
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
        /* on vérifie chaque texture AVANT de l'afficher : seulement des skins complets */
        const ok = await validate(fresh, my);
        if (my !== token) return;
        for (const s of ok) grid.appendChild(card(s, s.name || (filter ? filter : "Skin"), s.texture, s.data, s.slim));
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
    async function validate(list, my) {
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
          } catch (_) {}
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      return out.filter(Boolean);
    }
    function card(s, label, texture, data = null, slim = null) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "lib-card";
      el.innerHTML = `<div class="lib-thumb"><i class="lib-spin"></i></div><span>${esc(label)}</span>`;
      el._skin = { texture, data, slim, label };
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
        const r = await fullSkinsPage(wardTerm, wardAfter, () => my === wardToken);
        if (my !== wardToken) return;
        if (!r.ok) { loader.textContent = r.error || "Garde-robe indisponible."; wardAfter = false; return; }
        wardAfter = r.after;
        loader.remove();
        for (const it of r.items) grid.appendChild(wardTile(it));
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
    let viewer = null;
    function init() {
      const host = $("cosm-skin");
      if (host && !viewer && host.clientWidth) viewer = makeViewer(host, { yaw: -32, zoom: 0.72 });
      if (viewer && typeof MODE !== "undefined" && MODE.skin && viewer.__skin !== MODE.skin) { viewer.loadSkin(MODE.skin).catch(() => {}); viewer.__skin = MODE.skin; }
      if (viewer && typeof MODE !== "undefined" && MODE.cape && viewer.__cape !== MODE.cape) { viewer.loadCape(MODE.cape).catch(() => {}); viewer.__cape = MODE.cape; }
      render();
    }
    function render() {
      const grid = $("cosm-grid");
      if (!grid) return;
      const eq = Cosmetics.equipped;
      grid.innerHTML = COSMETICS.map((d) => `
        <div class="cosm-card${eq.includes(d.id) ? " on" : ""}">
          <div class="cosm-thumb"><img src="cosmetics/${d.id}.png" alt=""></div>
          <div class="cosm-info"><b>${esc(d.name)}</b><small>${esc(d.desc)}</small><em>${d.slot === "head" ? "Tête" : "Dos"}</em></div>
          <button type="button" class="${eq.includes(d.id) ? "btn-secondary" : "btn-primary"}" data-cosm="${d.id}">${eq.includes(d.id) ? "Retirer" : "Porter"}</button>
        </div>`).join("") + `
        <div class="cosm-card cosm-soon"><div class="cosm-thumb"><span>?</span></div>
          <div class="cosm-info"><b>Bientôt</b><small>D'autres cosmétiques arrivent dans les prochaines mises à jour.</small></div></div>`;
      grid.querySelectorAll("[data-cosm]").forEach((b) => b.addEventListener("click", () => { Cosmetics.toggle(b.dataset.cosm); render(); }));
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
})();
