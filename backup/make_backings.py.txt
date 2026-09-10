#!/usr/bin/env python3
"""L'Etude mascot backings v3: baked bound layers beneath the line art.

For each engraving PDF (black line art on white paper) produces:
  {slug}-art.png        line art, transparency from ink
  {slug}-sil.png        outermost-shape outline mask
  {slug}-back-day.png   bound backing: outline filled marble plateau (226,221,210)
  {slug}-back-night.png bound backing: outline filled warm off-white (eclipse theme)

Tier 1 set: the 4 original mascots + Minerva, 2 clocks, courtship, Sophocles,
Caesar, sphinx clock-base, Dickens, Atlas, Assyrian frieze. Re-run anytime.
"""
import glob
import io as _io
import os

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import binary_fill_holes

UP = '/home/user/uploads'
SITE = '/home/user/eclipse-site'
FIGS = [('*Cognitive-Hercules.pdf', 'hercules'),
        ('*Global-The philosopher King.pdf', 'philosopher-king'),
        ('*Philosophy-Galileo.pdf', 'galileo'),
        ('*Politics-Emperor Claudius.pdf', 'claudius'),
        ('*Minerva.pdf', 'minerva'),
        ('*Very Ornate Clock.pdf', 'ornate-clock'),
        ('*with clock.pdf', 'chimney-clock'),
        ('*Courtship.pdf', 'courtship'),
        ('*Sophocles.pdf', 'sophocles'),
        ('*Julius Caesar.pdf', 'caesar'),
        ('*Sphynx Cherub.pdf', 'sphynx-clock'),
        ('*Charles Dickens.pdf', 'dickens'),
        ('*Atlas.pdf', 'atlas'),
        ('*Assyrian mural.pdf', 'assyrian-mural')]
SCALE = 2.0
MAX_H = 1100
INK_T = 32
DILATE = 25
FEATHER = 2.5
BACK_DILATE = 5
BACK_FEATHER = 1.0
BACK_DAY = (226, 221, 210)     # marble plateau tone
BACK_NIGHT = (235, 224, 199)   # warm off-white for the eclipse theme
CARD_DAY = (233, 230, 222)     # check bg: marble canvas tone
CARD_NIGHT = (34, 36, 42)      # check bg: dark card tone


def render(path):
    doc = pymupdf.open(path)
    pix = doc[0].get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE))
    return Image.open(_io.BytesIO(pix.tobytes('png'))).convert('RGB')


def main():
    comps = []
    for pattern, slug in FIGS:
        found = glob.glob(os.path.join(UP, pattern))
        assert len(found) == 1, (pattern, found)
        img = render(found[0])
        lum = np.asarray(img.convert('L')).astype(np.int16)
        ink = np.clip(255 - lum, 0, 255).astype(np.uint8)

        ys, xs = np.where(ink > INK_T)
        m = 40
        x0, x1 = max(0, xs.min() - m), min(img.width, xs.max() + m)
        y0, y1 = max(0, ys.min() - m), min(img.height, ys.max() + m)
        ink = ink[y0:y1, x0:x1]
        h, w = ink.shape

        art = np.zeros((h, w, 4), np.uint8)
        art[:, :, 3] = ink
        art_img = Image.fromarray(art, 'RGBA')

        sil = Image.fromarray((ink > INK_T).astype(np.uint8) * 255, 'L')
        sil = sil.filter(ImageFilter.MaxFilter(DILATE))
        sil = binary_fill_holes(np.asarray(sil) > 0)
        sil = Image.fromarray((sil * 255).astype(np.uint8), 'L')
        sil = sil.filter(ImageFilter.GaussianBlur(FEATHER))
        sil_img = Image.merge('RGBA', [Image.new('L', sil.size, 255)] * 3 + [sil])

        back = Image.fromarray((ink > INK_T).astype(np.uint8) * 255, 'L')
        back = back.filter(ImageFilter.MaxFilter(BACK_DILATE))
        back = binary_fill_holes(np.asarray(back) > 0)
        back = Image.fromarray((back * 255).astype(np.uint8), 'L')
        back = back.filter(ImageFilter.GaussianBlur(BACK_FEATHER))

        if h > MAX_H:
            nw = round(w * MAX_H / h)
            art_img = art_img.resize((nw, MAX_H), Image.LANCZOS)
            sil_img = sil_img.resize((nw, MAX_H), Image.LANCZOS)
            back = back.resize((nw, MAX_H), Image.LANCZOS)
        art_img.save(os.path.join(SITE, slug + '-art.png'))
        sil_img.save(os.path.join(SITE, slug + '-sil.png'))
        for theme, color in (('day', BACK_DAY), ('night', BACK_NIGHT)):
            rgb = Image.new('RGB', back.size, color)
            rgb.putalpha(back)
            rgb.save(os.path.join(SITE, '%s-back-%s.png' % (slug, theme)))
        print('%s: %s ok' % (slug, art_img.size))

        a = np.asarray(art_img).astype(float) / 255
        tiles = []
        for theme, color, card in (('day', BACK_DAY, CARD_DAY),
                                   ('night', BACK_NIGHT, CARD_NIGHT)):
            b = np.asarray(Image.open(
                os.path.join(SITE, '%s-back-%s.png' % (slug, theme)))
                .convert('RGBA')).astype(float) / 255
            H, W = a.shape[:2]
            base = np.ones((H, W, 3)) * (np.array(card) / 255)
            comp = b[:, :, :3] * b[:, :, 3:4] + base * (1 - b[:, :, 3:4])
            comp = a[:, :, :3] * a[:, :, 3:4] + comp * (1 - a[:, :, 3:4])
            tiles.append(Image.fromarray((comp * 255).astype(np.uint8)))
        comps.append((slug, tiles[0], tiles[1]))

    H = 400
    def montage(pairs, path, tag0, tag1):
        rows = []
        for k, lab in ((1, tag0), (2, tag1)):
            tiles = [p[k] for p in pairs]
            rs = [t.resize((round(t.width * H / t.height), H), Image.LANCZOS) for t in tiles]
            M = Image.new('RGB', (sum(t.width for t in rs) + 20 * (len(rs) + 1), H + 36), (232, 232, 232))
            d = ImageDraw.Draw(M)
            x = 20
            for (slug, _, _), t in zip(pairs, rs):
                M.paste(t, (x, 8)); d.text((x, H + 12), '%s \u00b7 %s' % (slug, lab), fill=(20, 20, 20))
                x += t.width + 20
            rows.append(M)
        M = Image.new('RGB', (max(r.width for r in rows), sum(r.height for r in rows) + 10), (232, 232, 232))
        M.paste(rows[0], (0, 0)); M.paste(rows[1], (0, rows[0].height + 10))
        M.save(path)
        print(path, M.size)

    montage(comps[:4], '/home/user/mascot_checks.png', 'day on marble', 'night on dark card')
    montage(comps[4:], '/home/user/figures_checks.png', 'day on marble', 'night on dark card')


if __name__ == '__main__':
    main()
