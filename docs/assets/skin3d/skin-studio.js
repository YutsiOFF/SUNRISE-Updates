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
  const loadImg = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });

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

  function generateSkin(look) {
    const L = look;
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const g = c.getContext("2d");
    const base = g.createImageData(64, 64);
    const D = base.data;
    const put = (x, y, col, a = 255) => { const i = (y * 64 + x) * 4; D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = a; };
    const skinC = hex(L.skin.color), hairC = hex(L.hair.color), eyeC = hex(L.eyes.color);
    const topC = hex(L.top.color), botC = hex(L.bottom.color), shoeC = hex(L.shoes.color), accC = hex(L.acc.color);
    const aw = L.slim ? 3 : 4;

    let pIndex = 0;
    for (const [name, P] of Object.entries(PARTS)) {
      pIndex++;
      const w = (name === "rarm" || name === "larm") ? aw : P.w;
      for (const layer of ["base", "over"]) {
        const rects = faceRects(P[layer], w, P.h, P.d);
        for (const [face, [fx, fy, fw, fh]] of Object.entries(rects)) {
          for (let py = 0; py < fh; py++) for (let px = 0; px < fw; px++) {
            const side = face !== "top" && face !== "bottom";
            const wy = side ? P.y0 + (P.h - 1 - py) : face === "top" ? P.y0 + P.h : P.y0 - 1;
            const ctx = { part: name, face, x: px, y: py, w: fw, h: fh, wy, ly: wy - P.y0, side, layer };
            const col = layer === "base" ? paintBase(ctx) : paintOver(ctx);
            if (!col) continue;
            const n = 1 + (hash(fx + px, fy + py, pIndex) - .5) * (col.grain ?? .06);
            const k = FACE_LIGHT[face] * n * (col.k ?? 1);
            put(fx + px, fy + py, mul(col.c, k), col.a ?? 255);
          }
        }
      }
    }
    g.putImageData(base, 0, 0);
    return c;

    /* ------------------------------------------------------------ */
    function paintBase(q) {
      let out = { c: skinC, grain: .03 };
      const S = L.skin.style;
      /* peau : ombre sous le menton, mains un peu plus foncées */
      if (q.part === "head" && q.side && q.y === 7) out = { c: mul(skinC, .93), grain: .02 };
      if (q.part === "head") {
        const f = headFace(q);
        if (f) out = f;
      }
      /* bas (pantalon / short / jupe) */
      const bot = bottomAt(q);
      if (bot) out = bot;
      /* haut */
      const top = topAt(q, "base");
      if (top) out = top;
      /* chaussures */
      const sh = shoesAt(q);
      if (sh) out = sh;
      /* cheveux sur la tête */
      if (q.part === "head") { const h = hairAt(q, "base"); if (h) out = h; }
      if (S === "barbe" && q.part === "head" && (q.face === "front" || q.side) && !hairAt(q, "base")) {
        const yy = q.y;
        if (q.face === "front" && (yy >= 6 || (yy === 5 && (q.x <= 1 || q.x >= 6)))) out = { c: mul(hairC, 1.05), grain: .14 };
        if ((q.face === "right" || q.face === "left") && yy >= 5) out = { c: mul(hairC, 1.0), grain: .14 };
        if (q.face === "front" && yy === 6 && q.x >= 3 && q.x <= 4) out = { c: mul(skinC, .62) };
      }
      return out;
    }
    function paintOver(q) {
      let out = null;
      if (q.part === "head") {
        out = hairAt(q, "over");
        const a = accAt(q); if (a) out = a;
      } else {
        const t = topAt(q, "over"); if (t) out = t;
        const b = bottomOver(q); if (b) out = b;
        if (q.part === "body" && L.hair.style === "long" && q.face === "back" && q.ly >= 6) out = { c: mul(hairC, 1.02), grain: .16 };
        if (q.part === "body" && L.hair.style === "queue" && q.face === "back" && q.ly >= 8 && q.x >= 3 && q.x <= 4) out = { c: mul(hairC, 1.02), grain: .16 };
        const a = accAt(q); if (a) out = a;
      }
      return out;
    }

    /* visage --------------------------------------------------------- */
    function headFace(q) {
      if (q.face !== "front") return null;
      const { x, y } = q;
      const E = L.eyes.style;
      const white = [244, 244, 244];
      const L_EYE = [1, 2], R_EYE = [5, 6];
      const inL = x >= 1 && x <= 2, inR = x >= 5 && x <= 6;
      const pupil = (inL && x === 2) || (inR && x === 5);
      if (E === "classique" && y === 4 && (inL || inR)) return { c: pupil ? eyeC : white, grain: 0 };
      if (E === "grands" && (y === 3 || y === 4) && (inL || inR)) return { c: pupil ? (y === 3 ? mix(eyeC, white, .35) : eyeC) : white, grain: 0 };
      if (E === "anime" && (y === 3 || y === 4) && (inL || inR)) {
        if (y === 3 && !pupil) return { c: white, grain: 0 };
        return { c: pupil ? (y === 3 ? mix(eyeC, white, .55) : eyeC) : mul(eyeC, .55), grain: 0 };
      }
      if (E === "fermes" && y === 4 && (inL || inR)) return { c: mul(hairC, .7), grain: 0 };
      if (E === "colere") {
        if (y === 4 && (inL || inR)) return { c: pupil ? eyeC : white, grain: 0 };
        if (y === 3 && ((inL && x === 2) || (inR && x === 5))) return { c: mul(hairC, .8), grain: 0 };
      }
      /* sourcils (sauf frange qui les cache) */
      if (y === 2 && (inL || inR) && E !== "colere" && E !== "grands" && E !== "anime") return { c: mul(hairC, .9), grain: .05 };
      /* bouche */
      if (y === 6 && x >= 3 && x <= 4) return { c: mul(skinC, .72), grain: 0 };
      if (L.skin.style === "joues" && y === 5 && (x === 1 || x === 6)) return { c: mix(skinC, [232, 120, 120], .45), grain: 0 };
      if (L.skin.style === "taches" && y === 5 && (x === 1 || x === 2 || x === 5 || x === 6) && (x + y) % 2) return { c: mul(skinC, .8), grain: 0 };
      if (y === 5 && (x === 3 || x === 4)) return { c: mul(skinC, .9), grain: 0 };   /* nez */
      return null;
    }

    /* cheveux -------------------------------------------------------- */
    function hairAt(q, layer) {
      const H = L.hair.style;
      if (H === "chauve") return null;
      const col = (k = 1) => ({ c: mul(hairC, k * (1 + (((q.x * 7 + q.y * 3) % 5) - 2) * .025)), grain: .1 });
      const { face, x, y } = q;
      if (H === "rase") {
        if (layer === "over") return null;
        if (face === "top") return { c: mix(skinC, hairC, .65), grain: .2 };
        if (face !== "front" && face !== "bottom" && y <= 2) return { c: mix(skinC, hairC, .55), grain: .2 };
        return null;
      }
      if (H === "iroquois") {
        if (face === "top" && x >= 3 && x <= 4) return col(1.05);
        if (face === "back" && x >= 3 && x <= 4 && y <= 5) return col(.95);
        if (face === "front" && x >= 3 && x <= 4 && y === 0) return col(1);
        if (layer === "base" && face === "top") return { c: mix(skinC, hairC, .3), grain: .2 };
        return null;
      }
      /* zones par style (hauteur de couverture sur chaque face) */
      const cover = {
        court: { front: [0, 1], side: 3, back: 5 },
        frange: { front: [0, 2], side: 4, back: 6 },
        milong: { front: [0, 1], side: 6, back: 7 },
        long: { front: [0, 1], side: 7, back: 7 },
        boucle: { front: [0, 1], side: 4, back: 6 },
        queue: { front: [0, 1], side: 3, back: 6 },
      }[H] || { front: [0, 1], side: 3, back: 5 };
      const over = layer === "over";
      if (face === "top") return col(over ? 1.08 : 1);
      if (face === "bottom") return null;
      if (face === "front") {
        const [, rows] = cover.front;
        if (y <= rows - 1) return col(over ? 1.04 : 1);
        /* mèches de frange */
        if (H === "frange" && y === rows && x % 3 !== 1) return col(.92);
        if (H === "court" && y === rows && (x === 0 || x === 7 || x === 3)) return col(.9);
        if ((H === "milong" || H === "long") && (x === 0 || x === 7) && y <= cover.side) return col(.9);
        if (H === "boucle" && y === rows && x % 2 === 0) return col(.95);
        return null;
      }
      if (face === "back") {
        if (y <= cover.back) return col(over ? .98 : .94);
        if (H === "queue" && x >= 3 && x <= 4) return col(.9);
        return null;
      }
      /* côtés : dégradé vers l'arrière */
      const towardBack = face === "right" ? x : (7 - x);   /* 0 = devant */
      const lim = cover.side + (towardBack >= 4 ? 2 : towardBack >= 2 ? 1 : 0);
      if (y <= Math.min(7, lim)) return col(over ? 1 : .96);
      if (H === "boucle" && over && y === lim + 1 && (x + y) % 2 === 0) return col(.9);
      return null;
    }

    /* haut ----------------------------------------------------------- */
    function topAt(q, layer) {
      const T = L.top.style;
      if (q.part === "head") {
        if (T === "hoodie" && layer === "over" && (q.face === "back" || q.face === "right" || q.face === "left") && q.y >= (q.face === "back" ? 4 : 6)) {
          return { c: mul(topC, q.face === "back" ? .95 : .9), grain: .05 };
        }
        return null;
      }
      const onBody = q.part === "body";
      const onArm = q.part === "rarm" || q.part === "larm";
      if (!onBody && !onArm) return null;
      const lining = mix(topC, [255, 255, 255], .82);
      if (layer === "over") {
        if (T === "veste") {
          if (onBody && q.face === "front" && (q.x === 3 || q.x === 4)) return null;   /* ouverte devant */
          if (onBody && q.face === "front" && q.y === 0 && (q.x === 2 || q.x === 5)) return { c: mul(topC, 1.15) };
          if (onBody && q.face !== "bottom") return { c: topC, grain: .05 };
          if (onArm && q.ly >= 1 && q.face !== "bottom") return { c: q.ly === 1 ? mul(topC, .82) : topC, grain: .05 };
        }
        if (T === "hoodie" && onBody && q.face === "front") {
          if ((q.x === 2 || q.x === 5) && q.y >= 1 && q.y <= 4) return { c: [236, 236, 236], grain: .02 };   /* cordons */
          if (q.y >= 7 && q.y <= 9 && q.x >= 1 && q.x <= 6) return { c: mul(topC, q.y === 7 ? .85 : .95), grain: .04 };   /* poche */
        }
        return null;
      }
      /* base */
      if (T === "veste") {
        /* t-shirt blanc dessous */
        if (onBody && q.ly >= 1) return { c: lining, grain: .03 };
        if (onArm && q.ly >= 8) return { c: lining, grain: .03 };
        return null;
      }
      if (onBody) {
        if (q.ly < 1 && !(T === "debardeur")) return null;   /* ceinture du pantalon */
        if (q.ly < 1) return null;
        let c = topC;
        if (T === "raye") c = (q.ly % 3 === 0) ? mul(topC, .55) : ((q.ly % 3 === 1) ? topC : mix(topC, [255, 255, 255], .5));
        if (T === "chemise" && q.face === "front") {
          if (q.y === 0 && (q.x === 2 || q.x === 5)) c = mix(topC, [255, 255, 255], .7);   /* col */
          if ((q.x === 4) && q.y % 3 === 1) c = mul(topC, .62);   /* boutons */
          if (q.x === 3) c = mul(topC, .9);
        }
        if (T === "tshirt" && q.face === "front" && q.y === 0 && q.x >= 3 && q.x <= 4) return null;   /* col rond */
        if (T === "debardeur") {
          if (q.face === "right" || q.face === "left") { if (q.y <= 2) return null; }
          if ((q.face === "front" || q.face === "back") && q.y <= 1 && (q.x <= 1 || q.x >= 6)) return null;
          if (q.face === "front" && q.y === 0 && q.x >= 3 && q.x <= 4) return null;
        }
        if (q.ly === 1 && T !== "debardeur") c = mul(c, .86);   /* ourlet */
        return { c, grain: .05 };
      }
      /* bras */
      const sleeves = { tshirt: 4, debardeur: 0, longues: 10, hoodie: 10, chemise: 10, raye: 10 }[T] ?? 4;
      if (q.face === "top" && sleeves > 0) return { c: topC, grain: .05 };
      if (q.side && q.ly >= 12 - sleeves) {
        let c = topC;
        if (T === "raye") c = (q.ly % 3 === 0) ? mul(topC, .55) : ((q.ly % 3 === 1) ? topC : mix(topC, [255, 255, 255], .5));
        if (q.ly === 12 - sleeves) c = mul(c, .82);   /* poignet / ourlet */
        return { c, grain: .05 };
      }
      return null;
    }

    /* bas ------------------------------------------------------------ */
    function bottomAt(q) {
      const B = L.bottom.style;
      const onLeg = q.part === "rleg" || q.part === "lleg";
      if (q.part === "body" && q.ly < 1 && q.side) {
        /* ceinture */
        if (B === "jupe") return { c: mul(botC, .9), grain: .04 };
        return { c: q.face === "front" && (q.x === 3 || q.x === 4) ? [190, 160, 70] : mul(botC, .55), grain: .03 };
      }
      if (!onLeg) return null;
      const outer = (q.part === "rleg" && q.face === "right") || (q.part === "lleg" && q.face === "left");
      if (B === "short") { if (q.ly < 7) return null; }
      if (B === "jupe") return null;
      if (q.face === "bottom") return null;
      let c = botC;
      if (B === "jean" && q.side && q.face !== "back" && q.x === (q.part === "rleg" ? 0 : q.w - 1) && q.face === "front") c = mul(botC, 1.18);
      if (B === "jogging" && outer && q.x === 1) c = [236, 236, 236];
      if (B === "cargo" && outer && q.ly >= 5 && q.ly <= 7) c = mul(botC, q.ly === 7 ? .78 : .9);
      if (B === "short" && q.ly === 7) c = mul(c, .82);
      if (q.ly === 11 && q.face === "front") c = mul(c, .92);
      return { c, grain: B === "jean" ? .1 : .05 };
    }
    function bottomOver(q) {
      const onLeg = q.part === "rleg" || q.part === "lleg";
      if (L.bottom.style !== "jupe" || !onLeg || q.face === "bottom") return null;
      if (q.face === "top") return { c: botC };
      if (q.ly >= 6) return { c: q.ly === 6 ? mul(botC, .8) : (q.ly % 2 ? botC : mul(botC, .93)), grain: .04 };
      return null;
    }

    /* chaussures ------------------------------------------------------ */
    function shoesAt(q) {
      const onLeg = q.part === "rleg" || q.part === "lleg";
      if (!onLeg) return null;
      const S = L.shoes.style;
      if (S === "nus") return q.face === "bottom" ? { c: mul(skinC, .9) } : null;
      if (q.face === "bottom") return { c: S === "baskets" ? [200, 200, 200] : mul(shoeC, .6) };
      const h = { baskets: 2, bottes: 4, ville: 2 }[S] || 2;
      if (!q.side || q.ly >= h) return null;
      if (S === "baskets") {
        if (q.ly === 0) return { c: [214, 214, 214], grain: .02 };
        return { c: (q.face === "right" || q.face === "left") && q.x >= 1 && q.x <= 2 ? mul(shoeC, .82) : shoeC, grain: .03 };
      }
      if (S === "bottes") return { c: q.ly === h - 1 ? mul(shoeC, .8) : shoeC, grain: .08 };
      return { c: q.ly === 0 ? mul(shoeC, .65) : shoeC, grain: .04 };
    }

    /* accessoires ------------------------------------------------------ */
    function accAt(q) {
      const A = L.acc.style;
      if (A === "aucun") return null;
      if (q.part === "head" && q.layer === "over") {
        const { face, x, y } = q;
        if (A === "lunettes" || A === "soleil") {
          const rim = A === "soleil" ? [24, 24, 26] : mul(accC, .9);
          if (face === "front" && y === 4) {
            if (A === "soleil" && (x >= 1 && x <= 2 || x >= 5 && x <= 6)) return { c: [30, 30, 36], grain: 0 };
            if (x === 0 || x === 3 || x === 4 || x === 7) return { c: rim, grain: 0 };
          }
          if (face === "front" && y === 3 && x >= 0 && x <= 7 && x !== 3 && x !== 4 && A === "lunettes") return { c: rim, grain: 0 };
          if ((face === "right" || face === "left") && y === 4) return { c: rim, grain: 0 };
          return null;
        }
        if (A === "casquette") {
          if (face === "top") return { c: accC, grain: .05 };
          if (face !== "bottom" && y <= 1) return { c: y === 1 ? mul(accC, .85) : accC, grain: .05 };
          if (face === "front" && y === 2) return { c: mul(accC, .7), grain: 0 };   /* visière */
          return null;
        }
        if (A === "bandeau") {
          if (face !== "top" && face !== "bottom" && y === 1) return { c: accC, grain: .04 };
          return null;
        }
        if (A === "casque") {
          if (face === "top" && (x === 0 || x === 7 || y === 3 || y === 4)) return { c: [40, 40, 44], grain: 0 };
          if ((face === "right" || face === "left") && y >= 3 && y <= 6 && x >= 2 && x <= 5) return { c: (y === 3 || y === 6 || x === 2 || x === 5) ? [40, 40, 44] : accC, grain: .02 };
          if ((face === "right" || face === "left") && y <= 2 && x >= 3 && x <= 4) return { c: [40, 40, 44], grain: 0 };
          return null;
        }
        return null;
      }
      if (A === "echarpe" && q.part === "body" && q.layer === "over") {
        if (q.side && q.ly >= 10) return { c: q.ly === 10 ? mul(accC, .85) : accC, grain: .06 };
        if (q.face === "front" && q.x >= 1 && q.x <= 2 && q.ly >= 5) return { c: q.ly === 5 ? mul(accC, .85) : accC, grain: .06 };
        if (q.face === "top") return { c: accC };
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
      tilt: [-6, 0, 4],
      parts: [
        /* bord */            { from: [-6.5, 8.6, -6.5], to: [6.5, 9.6, 6.5], color: "#1c1c21" },
        /* bord (dessus)  */  { from: [-6, 9.6, -6], to: [6, 9.85, 6], color: "#26262c" },
        /* calotte */         { from: [-4.4, 9.6, -4.4], to: [4.4, 16.6, 4.4], color: "#202026" },
        /* ruban */           { from: [-4.55, 9.85, -4.55], to: [4.55, 11.6, 4.55], color: "#f08a24" },
        /* liseré ruban */    { from: [-4.6, 11.6, -4.6], to: [4.6, 11.85, 4.6], color: "#ffd84a" },
        /* boucle */          { from: [-1.3, 9.95, 4.55], to: [1.3, 11.5, 4.85], color: "#ffd84a" },
        /* centre boucle */   { from: [-0.55, 10.4, 4.6], to: [0.55, 11.05, 4.9], color: "#1c1c21" },
        /* dessus */          { from: [-4.2, 16.6, -4.2], to: [4.2, 16.85, 4.2], color: "#2b2b33" },
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
        if (!fresh.length && !grid.querySelector(".lib-card")) setNote(filter ? "Aucun skin pour « " + filter + " »." : "Aucun skin pour le moment.");
        for (const s of fresh) grid.appendChild(card(s, s.name || (filter ? filter : "Skin"), s.texture));
        /* remplir l'écran si la grille ne défile pas encore */
        if (after && grid.scrollHeight <= grid.clientHeight + 40) setTimeout(more, 50);
      } catch (e) {
        setNote("Bibliothèque indisponible : " + (e?.message || e));
      } finally {
        loader.remove();
        busy = false;
      }
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

    function init() {
      const host = $("creator-skin");
      if (!host) return;
      if (!viewer && host.clientWidth) viewer = makeViewer(host, { yaw: -28 });
      const tabs = $("creator-tabs");
      if (!tabs.dataset.ready) {
        tabs.dataset.ready = "1";
        tabs.innerHTML = Object.entries(OPTS).map(([k, o]) => `<button type="button" class="mod-tab${k === cat ? " cur" : ""}" data-cat="${k}">${esc(o.label)}</button>`).join("");
        tabs.addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (!b) return; cat = b.dataset.cat; tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("cur", x === b)); renderOptions(); });
        $("creator-styles").addEventListener("click", (e) => { const b = e.target.closest("[data-style]"); if (!b) return; look[cat].style = b.dataset.style; changed(true); });
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
    function renderOptions() {
      const o = OPTS[cat];
      const styles = $("creator-styles");
      styles.innerHTML = "";
      for (const [id, label] of o.styles) {
        const variant = structuredClone(look);
        variant[cat].style = id;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "creator-opt" + (look[cat].style === id ? " cur" : "");
        b.dataset.style = id;
        const thumb = frontRender(generateSkin(variant), 4, look.slim);
        const box = document.createElement("div"); box.className = "creator-thumb";
        if (cat === "hair" || cat === "eyes" || (cat === "acc" && ["lunettes", "soleil", "casquette", "bandeau", "casque"].includes(id)) || cat === "skin") {
          /* zoom sur la tête */
          const z = document.createElement("canvas"); z.width = 64; z.height = 64;
          const g = z.getContext("2d"); g.imageSmoothingEnabled = false;
          g.drawImage(thumb, 16, 0, 32, 32, 0, 0, 64, 64);
          box.appendChild(z);
        } else box.appendChild(thumb);
        b.appendChild(box);
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
      for (const [k, o] of Object.entries(OPTS)) {
        look[k].style = r(o.styles)[0];
        look[k].color = r(PAL[o.color]);
      }
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
