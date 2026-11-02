#!/usr/bin/env python3
"""Пиксельные иконки инструментов в стиле существующих (public/tools/icons):
сетка 25×25, каждая клетка — 2×2 px (итог 50×50), чёрный контур, плоские цвета,
блик сверху-слева и тень снизу-справа. Каждая иконка — несколько фигур.

    python3 scripts/draw-tool-icons.py [--sheet out.png]

Нужен Pillow. Пишет PNG в public/tools/icons/<имя>.png.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

G = 25
OUT = Path(__file__).resolve().parent.parent / 'public' / 'tools' / 'icons'

K = (0, 0, 0)
W = (255, 255, 255)
GREY = (182, 187, 191)
DGREY = (92, 98, 110)
SILVER = (214, 220, 226)
PURPLE = (112, 72, 240)
VIOLET = (160, 110, 255)
BLUE = (0, 154, 240)
CYAN = (60, 214, 255)
RED = (232, 51, 58)
ORANGE = (255, 140, 30)
YELLOW = (255, 200, 30)
GREEN = (47, 184, 78)
LIME = (150, 220, 60)
PINK = (255, 150, 190)
BROWN = (138, 90, 43)
TAN = (226, 196, 150)
SKIN = (255, 205, 160)
NAVY = (36, 44, 84)
TEAL = (20, 160, 150)
SKY = (140, 200, 255)


def tint(c, k):
    """k>0 — светлее, k<0 — темнее."""
    if k >= 0:
        return tuple(int(v + (255 - v) * k) for v in c[:3])
    return tuple(int(v * (1 + k)) for v in c[:3])


class Icon:
    def __init__(self):
        self.px = [[None] * G for _ in range(G)]

    # --- маски ---
    @staticmethod
    def _mask(draw_fn):
        im = Image.new('1', (G, G), 0)
        draw_fn(ImageDraw.Draw(im))
        return {(x, y) for y in range(G) for x in range(G) if im.getpixel((x, y))}

    def rect(self, x0, y0, x1, y1, col, **kw):
        return self.shape(self._mask(lambda d: d.rectangle([x0, y0, x1, y1], fill=1)), col, **kw)

    def rrect(self, x0, y0, x1, y1, r, col, **kw):
        return self.shape(self._mask(lambda d: d.rounded_rectangle([x0, y0, x1, y1], r, fill=1)), col, **kw)

    def ellipse(self, x0, y0, x1, y1, col, **kw):
        return self.shape(self._mask(lambda d: d.ellipse([x0, y0, x1, y1], fill=1)), col, **kw)

    def poly(self, pts, col, **kw):
        return self.shape(self._mask(lambda d: d.polygon(pts, fill=1)), col, **kw)

    def line(self, pts, col, w=1, outline=False, shade=False):
        return self.shape(self._mask(lambda d: d.line(pts, fill=1, width=w)), col, outline=outline, shade=shade)

    def pie(self, x0, y0, x1, y1, a0, a1, col, **kw):
        return self.shape(self._mask(lambda d: d.pieslice([x0, y0, x1, y1], a0, a1, fill=1)), col, **kw)

    def dot(self, x, y, col):
        if 0 <= x < G and 0 <= y < G:
            self.px[y][x] = col

    def dots(self, pts, col):
        for x, y in pts:
            self.dot(x, y, col)

    def shape(self, mask, col, outline=True, shade=True):
        inside = lambda x, y: (x, y) in mask
        for (x, y) in mask:
            c = col
            if shade:
                if not inside(x, y - 1) or not inside(x - 1, y):
                    c = tint(col, 0.35)
                elif not inside(x, y + 1) or not inside(x + 1, y):
                    c = tint(col, -0.25)
            self.px[y][x] = c
        if outline:
            # контур рисуется по внешнему краю фигуры (как у остальных иконок)
            for (x, y) in mask:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < G and 0 <= ny < G and (nx, ny) not in mask and self.px[ny][nx] is None:
                        self.px[ny][nx] = K
        return mask

    def image(self):
        im = Image.new('RGBA', (G * 2, G * 2), (0, 0, 0, 0))
        for y in range(G):
            for x in range(G):
                c = self.px[y][x]
                if c is not None:
                    for dy in range(2):
                        for dx in range(2):
                            im.putpixel((x * 2 + dx, y * 2 + dy), (*c[:3], 255))
        bbox = im.getbbox()
        return im.crop(bbox) if bbox else im


# 3×5 пиксельный шрифт для подписей
FONT = {
    'A': ['010', '101', '111', '101', '101'], 'B': ['110', '101', '110', '101', '110'], 'C': ['011', '100', '100', '100', '011'],
    'D': ['110', '101', '101', '101', '110'], 'E': ['111', '100', '110', '100', '111'], 'F': ['111', '100', '110', '100', '100'],
    'G': ['011', '100', '101', '101', '011'], 'H': ['101', '101', '111', '101', '101'], 'I': ['111', '010', '010', '010', '111'],
    'J': ['001', '001', '001', '101', '010'], 'L': ['100', '100', '100', '100', '111'], 'M': ['101', '111', '111', '101', '101'],
    'N': ['110', '101', '101', '101', '101'], 'O': ['010', '101', '101', '101', '010'], 'P': ['110', '101', '110', '100', '100'],
    'R': ['110', '101', '110', '101', '101'], 'S': ['011', '100', '010', '001', '110'], 'T': ['111', '010', '010', '010', '010'],
    'U': ['101', '101', '101', '101', '111'], 'V': ['101', '101', '101', '101', '010'], 'X': ['101', '101', '010', '101', '101'],
    'Y': ['101', '101', '010', '010', '010'], 'Z': ['111', '001', '010', '100', '111'], 'a': ['000', '011', '101', '101', '011'],
    'b': ['100', '110', '101', '101', '110'], 'c': ['000', '011', '100', '100', '011'], 'i': ['010', '000', '010', '010', '010'],
    '@': ['010', '101', '111', '100', '011'], '#': ['101', '111', '101', '111', '101'], '<': ['001', '010', '100', '010', '001'],
    '>': ['100', '010', '001', '010', '100'], '/': ['001', '001', '010', '100', '100'], '{': ['011', '010', '100', '010', '011'],
    '}': ['110', '010', '001', '010', '110'], '©': ['010', '101', '111', '101', '010'], '?': ['110', '001', '010', '000', '010'],
    '3': ['110', '001', '010', '001', '110'], '.': ['000', '000', '000', '000', '010'], '+': ['000', '010', '111', '010', '000'],
    '=': ['000', '111', '000', '111', '000'], '%': ['101', '001', '010', '100', '101'], '1': ['010', '110', '010', '010', '111'],
}


def text(ic, x, y, s, col=K):
    for ch in s:
        rows = FONT.get(ch)
        if rows:
            for j, row in enumerate(rows):
                for i, v in enumerate(row):
                    if v == '1':
                        ic.dot(x + i, y + j, col)
        x += 4


# ------------------------------------------------------------------ иконки
ICONS = {}


def icon(name):
    def deco(fn):
        ICONS[name] = fn
        return fn
    return deco


def photo(ic, x0, y0, x1, y1, sky=SKY):
    ic.rect(x0, y0, x1, y1, W)
    ic.rect(x0 + 2, y0 + 2, x1 - 2, y1 - 2, sky, outline=False, shade=False)
    h = y1 - 2
    ic.poly([(x0 + 2, h), (x0 + 6, h - 5), (x0 + 9, h - 2), (x0 + 12, h - 6), (x1 - 2, h - 1), (x1 - 2, h)], GREEN, outline=False, shade=False)
    ic.ellipse(x1 - 6, y0 + 3, x1 - 4, y0 + 5, YELLOW, outline=False, shade=False)


def wave(ic, x0, x1, ymid, amp, col, step=2, seed=(3, 6, 4, 8, 5, 7, 2, 6, 4, 3, 7, 5)):
    for i, x in enumerate(range(x0, x1 + 1, step)):
        a = min(amp, seed[i % len(seed)] * amp // 8)
        ic.rect(x, ymid - a, x, ymid + a, col, outline=False, shade=False)


@icon('kvantizator')
def _(ic):
    ic.rect(2, 3, 22, 21, W)
    for i, c in enumerate([(40, 60, 140), (70, 120, 220), (120, 190, 255), (210, 240, 255)]):
        ic.rect(4 + i * 4, 5, 7 + i * 4, 19, c, outline=False, shade=False)
    ic.rect(4, 5, 19, 5, tint(W, 0), outline=False, shade=False)


@icon('dizering')
def _(ic):
    ic.rect(2, 2, 22, 22, W)
    for y in range(4, 21):
        for x in range(4, 21):
            d = (x - 4) / 16
            bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y % 4][x % 4] / 16
            if d > bayer:
                ic.dot(x, y, K)


@icon('sravnenie')
def _(ic):
    photo(ic, 1, 4, 14, 17)
    ic.rect(9, 8, 23, 21, W)
    ic.rect(11, 10, 21, 19, SKY, outline=False, shade=False)
    ic.poly([(11, 19), (14, 14), (17, 17), (21, 13), (21, 19)], GREEN, outline=False, shade=False)
    ic.rect(15, 11, 20, 16, RED, outline=False, shade=False)
    ic.rect(16, 12, 19, 15, SKY, outline=False, shade=False)


@icon('lastik')
def _(ic):
    ic.poly([(4, 15), (13, 6), (21, 14), (12, 23)], PINK)
    ic.poly([(4, 15), (8, 11), (16, 19), (12, 23)], BLUE)
    ic.line([(2, 23), (22, 23)], GREY, 1)
    ic.dots([(17, 20), (19, 21), (21, 20)], GREY)


@icon('perenos-palitry')
def _(ic):
    for i, c in enumerate([RED, ORANGE, YELLOW]):
        ic.rect(1 + i * 5, 2, 4 + i * 5, 7, c)
    for i, c in enumerate([BLUE, CYAN, PURPLE]):
        ic.rect(9 + i * 5, 17, 12 + i * 5, 22, c)
    ic.line([(5, 11), (17, 11)], K, 2)
    ic.poly([(16, 8), (21, 11), (16, 14)], K, outline=False, shade=False)


@icon('lut')
def _(ic):
    ic.poly([(12, 2), (22, 7), (12, 12), (2, 7)], YELLOW)
    ic.poly([(2, 7), (12, 12), (12, 23), (2, 18)], RED)
    ic.poly([(12, 12), (22, 7), (22, 18), (12, 23)], BLUE)
    ic.line([(7, 9), (7, 20)], tint(RED, -0.3))
    ic.line([(17, 9), (17, 20)], tint(BLUE, -0.3))
    ic.line([(7, 4), (17, 9)], tint(YELLOW, -0.2))


@icon('palitra-dostup')
def _(ic):
    for i, c in enumerate([NAVY, PURPLE, PINK, (250, 240, 255)]):
        ic.rect(2, 2 + i * 5, 13, 5 + i * 5, c)
    ic.ellipse(12, 11, 23, 22, GREEN)
    ic.line([(15, 16), (17, 19), (21, 13)], W, 2)


@icon('blob-3d')
def _(ic):
    ic.ellipse(3, 3, 21, 21, PURPLE)
    ic.ellipse(5, 5, 17, 17, VIOLET, outline=False, shade=False)
    ic.ellipse(13, 13, 20, 20, CYAN, outline=False, shade=False)
    ic.ellipse(7, 6, 10, 9, W, outline=False, shade=False)
    ic.dot(11, 7, W)


@icon('vektor')
def _(ic):
    ic.poly([(12, 2), (19, 13), (15, 20), (9, 20), (5, 13)], GREY)
    ic.line([(12, 6), (12, 14)], K)
    ic.ellipse(10, 13, 14, 17, W)
    ic.rect(8, 20, 16, 23, DGREY)


@icon('jsx')
def _(ic):
    import math
    for ang in (0, 60, 120):
        r = math.radians(ang)
        pts = [(12 + 11 * math.cos(t) * math.cos(r) - 4 * math.sin(t) * math.sin(r),
                12 + 11 * math.cos(t) * math.sin(r) + 4 * math.sin(t) * math.cos(r)) for t in [i * math.pi / 24 for i in range(48)]]
        ic.line(pts + [pts[0]], CYAN, 2, outline=True)
    ic.ellipse(10, 10, 14, 14, CYAN)

@icon('uproshchenie')
def _(ic):
    zig = [(1, 9), (3, 5), (5, 8), (7, 4), (9, 7), (11, 3), (13, 6), (15, 3), (17, 6), (19, 2), (21, 5), (23, 3)]
    ic.line(zig, DGREY, 1)
    ic.dots(zig, RED)
    ic.line([(2, 21), (7, 14), (12, 13), (17, 14), (22, 21)], BLUE, 2)
    for x, y in [(2, 21), (12, 13), (22, 21)]:
        ic.rect(x - 1, y - 1, x + 1, y + 1, W)
    ic.poly([(10, 8), (14, 8), (12, 11)], K, outline=False, shade=False)

@icon('kontur')
def _(ic):
    ic.line([(2, 20), (6, 10), (12, 6), (18, 8), (22, 4)], BLUE, 2)
    ic.line([(3, 5), (12, 6)], DGREY)
    ic.line([(12, 6), (20, 13)], DGREY)
    for x, y in [(3, 5), (20, 13)]:
        ic.ellipse(x - 1, y - 1, x + 1, y + 1, W)
    for x, y in [(2, 20), (12, 6), (22, 4)]:
        ic.rect(x - 1, y - 1, x + 1, y + 1, W)


@icon('soc-kadry')
def _(ic):
    ic.rect(1, 6, 15, 16, PINK)
    ic.rect(10, 1, 23, 14, BLUE)
    ic.rect(6, 10, 14, 23, YELLOW)
    ic.ellipse(8, 14, 12, 18, W, outline=False, shade=False)


@icon('tishina')
def _(ic):
    ic.rrect(1, 3, 23, 21, 3, NAVY)
    wave(ic, 3, 9, 12, 6, CYAN)
    wave(ic, 16, 21, 12, 6, CYAN)
    ic.line([(11, 12), (14, 12)], DGREY)
    ic.line([(10, 7), (15, 16)], RED, 2)
    ic.line([(10, 16), (15, 7)], RED, 2)


@icon('volna')
def _(ic):
    ic.rect(1, 3, 23, 21, W)
    ic.rect(3, 5, 21, 19, (40, 30, 70), outline=False, shade=False)
    for i, x in enumerate(range(4, 21, 2)):
        a = [2, 4, 6, 7, 5, 6, 4, 3, 2][i % 9]
        c = [PURPLE, VIOLET, PINK, ORANGE, YELLOW][i % 5]
        ic.rect(x, 12 - a, x, 12 + a, c, outline=False, shade=False)


@icon('oblozhka')
def _(ic):
    ic.ellipse(8, 3, 23, 18, (30, 30, 34))
    ic.ellipse(13, 8, 18, 13, RED, outline=False, shade=False)
    ic.dot(15, 10, K)
    ic.rect(1, 7, 14, 21, PURPLE)
    ic.rect(3, 9, 12, 19, ORANGE, outline=False, shade=False)
    ic.ellipse(5, 11, 10, 16, YELLOW, outline=False, shade=False)


@icon('karta-gradienta')
def _(ic):
    ic.rect(1, 2, 23, 16, W)
    ic.rect(3, 4, 21, 14, (40, 20, 90), outline=False, shade=False)
    ic.poly([(3, 14), (8, 7), (12, 11), (16, 5), (21, 13), (21, 14)], ORANGE, outline=False, shade=False)
    ic.poly([(14, 8), (16, 5), (18, 8)], YELLOW, outline=False, shade=False)
    for i, c in enumerate([(40, 20, 90), PURPLE, RED, ORANGE, YELLOW]):
        ic.rect(1 + i * 4 + (1 if i else 0), 19, 4 + i * 4 + 1, 22, c, outline=False, shade=False)
    ic.rect(0, 18, 23, 18, K, outline=False, shade=False)
    ic.rect(0, 23, 23, 23, K, outline=False, shade=False)
    ic.rect(0, 18, 0, 23, K, outline=False, shade=False)
    ic.rect(23, 18, 23, 23, K, outline=False, shade=False)


@icon('perspektiva')
def _(ic):
    ic.rect(11, 15, 13, 23, DGREY)
    ic.poly([(2, 3), (22, 6), (22, 15), (2, 18)], W)
    ic.poly([(4, 5), (20, 7), (20, 14), (4, 16)], PURPLE, outline=False, shade=False)
    ic.poly([(6, 13), (10, 9), (13, 12), (16, 9), (19, 12), (19, 13)], PINK, outline=False, shade=False)


@icon('smartfon')
def _(ic):
    ic.rrect(6, 1, 18, 23, 2, (40, 42, 52))
    ic.rect(8, 4, 16, 19, BLUE, outline=False, shade=False)
    ic.rect(9, 6, 15, 9, W, outline=False, shade=False)
    ic.rect(9, 11, 12, 14, YELLOW, outline=False, shade=False)
    ic.rect(13, 11, 15, 14, PINK, outline=False, shade=False)
    ic.rect(11, 21, 13, 21, GREY, outline=False, shade=False)


@icon('besshov')
def _(ic):
    ic.rect(1, 1, 23, 23, (200, 90, 60))
    for y in range(3, 23, 5):
        ic.rect(2, y, 22, y, (90, 40, 30), outline=False, shade=False)
        off = 0 if (y // 5) % 2 == 0 else 3
        for x in range(2 + off, 23, 6):
            ic.rect(x, y - 4 if y > 3 else 2, x, y, (90, 40, 30), outline=False, shade=False)
    ic.rect(12, 1, 12, 23, YELLOW, outline=False, shade=False)
    ic.rect(1, 12, 23, 12, YELLOW, outline=False, shade=False)


@icon('pbr')
def _(ic):
    ic.ellipse(2, 2, 22, 22, (128, 128, 255))
    ic.pie(2, 2, 22, 22, 90, 270, (150, 110, 255), outline=False, shade=False)
    ic.pie(2, 2, 22, 22, 270, 360, (110, 200, 255), outline=False, shade=False)
    ic.ellipse(6, 6, 9, 9, W, outline=False, shade=False)
    ic.line([(12, 2), (12, 22)], K)


@icon('spraity')
def _(ic):
    ic.rect(1, 1, 23, 23, (60, 50, 90))
    for gx, gy, c in [(0, 0, GREEN), (1, 0, RED), (0, 1, YELLOW), (1, 1, CYAN)]:
        x0, y0 = 3 + gx * 11, 3 + gy * 11
        ic.rect(x0 + 2, y0, x0 + 6, y0 + 3, c, outline=False, shade=False)
        ic.rect(x0 + 1, y0 + 4, x0 + 7, y0 + 6, c, outline=False, shade=False)
        ic.dots([(x0 + 3, y0 + 1), (x0 + 5, y0 + 1)], K)
        ic.dots([(x0 + 2, y0 + 7), (x0 + 6, y0 + 7)], c)
    ic.rect(12, 2, 12, 22, (110, 100, 140), outline=False, shade=False)
    ic.rect(2, 12, 22, 12, (110, 100, 140), outline=False, shade=False)


@icon('kontakt-list')
def _(ic):
    ic.rect(3, 1, 21, 23, W)
    cols = [SKY, PINK, YELLOW, GREEN, ORANGE, VIOLET, CYAN, RED, TAN]
    for i in range(9):
        x0, y0 = 5 + (i % 3) * 5, 3 + (i // 3) * 6
        ic.rect(x0, y0, x0 + 3, y0 + 3, cols[i], outline=False, shade=False)
        ic.rect(x0, y0 + 4, x0 + 2, y0 + 4, GREY, outline=False, shade=False)


@icon('vhs')
def _(ic):
    ic.rect(1, 5, 23, 19, (40, 40, 46))
    ic.rect(4, 8, 20, 14, (230, 230, 220), outline=False, shade=False)
    ic.ellipse(6, 9, 10, 13, K, outline=False, shade=False)
    ic.ellipse(14, 9, 18, 13, K, outline=False, shade=False)
    ic.dots([(8, 11), (16, 11)], W)
    for i, c in enumerate([RED, YELLOW, CYAN]):
        ic.rect(4 + i * 3, 16, 5 + i * 3, 17, c, outline=False, shade=False)


@icon('gory')
def _(ic):
    ic.poly([(1, 21), (9, 6), (14, 14), (17, 9), (23, 21)], (110, 120, 140))
    ic.poly([(7, 10), (9, 6), (11, 10), (10, 11), (8, 9)], W, outline=False, shade=False)
    ic.poly([(16, 11), (17, 9), (19, 12), (17, 12)], W, outline=False, shade=False)
    ic.rect(1, 19, 23, 21, GREEN, outline=False, shade=False)
    ic.rect(3, 20, 8, 20, BLUE, outline=False, shade=False)


@icon('ocr')
def _(ic):
    ic.rect(1, 1, 16, 21, W)
    text(ic, 3, 3, 'Ab')
    for y in (10, 13, 16):
        ic.rect(3, y, 13, y, DGREY, outline=False, shade=False)
    ic.ellipse(10, 9, 19, 18, SKY)
    ic.line([(18, 17), (22, 21)], BROWN, 3)


@icon('anonim')
def _(ic):
    ic.ellipse(4, 2, 20, 20, SKIN)
    for y in range(6, 18, 3):
        for x in range(6, 19, 3):
            if ((x + y) // 3) % 2:
                ic.rect(x, y, x + 2, y + 2, tint(SKIN, -0.25), outline=False, shade=False)
    ic.rect(5, 8, 19, 11, K, outline=False, shade=False)
    ic.rect(4, 20, 20, 23, DGREY)


@icon('sabset')
def _(ic):
    ic.rect(1, 2, 14, 20, W)
    text(ic, 3, 4, 'Aa')
    text(ic, 3, 11, 'Bb')
    ic.rect(15, 9, 23, 17, GREEN)
    ic.line([(19, 11), (19, 15)], W)
    ic.poly([(17, 14), (19, 16), (21, 14)], W, outline=False, shade=False)
    text(ic, 2, 21, '', K)


@icon('shrift')
def _(ic):
    ic.rect(1, 1, 23, 23, W)
    ic.poly([(4, 20), (10, 4), (14, 4), (20, 20), (16, 20), (14, 15), (10, 15), (8, 20)], PURPLE)
    ic.rect(11, 9, 12, 11, W, outline=False, shade=False)
    ic.line([(2, 21), (22, 21)], RED)
    ic.line([(2, 5), (22, 5)], BLUE)


@icon('variativ')
def _(ic):
    ic.rect(1, 2, 23, 14, W)
    ic.poly([(3, 12), (6, 4), (8, 4), (11, 12), (9, 12), (8, 9), (6, 9), (5, 12)], K, outline=False, shade=False)
    ic.poly([(12, 12), (15, 4), (19, 4), (22, 12), (19, 12), (18, 9), (16, 9), (15, 12)], K, outline=False, shade=False)
    ic.rect(2, 18, 22, 19, DGREY)
    ic.rect(14, 16, 17, 21, PURPLE)


@icon('para-shriftov')
def _(ic):
    ic.rect(1, 3, 13, 21, W)
    text(ic, 3, 6, 'Aa', K)
    ic.rect(10, 6, 23, 23, YELLOW)
    text(ic, 12, 10, 'Aa', K)
    ic.rect(12, 17, 21, 17, DGREY, outline=False, shade=False)
    ic.rect(12, 19, 19, 19, DGREY, outline=False, shade=False)


@icon('stemy')
def _(ic):
    ic.rrect(1, 1, 23, 23, 3, (40, 36, 60))
    for i, (c, h) in enumerate([(PINK, 6), (ORANGE, 4), (CYAN, 7), (LIME, 5)]):
        y = 4 + i * 5
        ic.rect(3, y, 21, y + 3, tint(c, -0.55), outline=False, shade=False)
        for j, x in enumerate(range(4, 21, 2)):
            a = [1, 2, 1, 1, 2, 0, 1, 2, 1][(j + i) % 9]
            ic.rect(x, y + 1 - (a > 1), x, y + 2 + (a > 0) - 1, c, outline=False, shade=False)


# --- замены дублей ---
@icon('szhatie')
def _(ic):
    ic.rect(7, 4, 17, 20, W)
    ic.rect(9, 7, 15, 13, SKY, outline=False, shade=False)
    ic.poly([(9, 13), (11, 10), (13, 12), (15, 9), (15, 13)], GREEN, outline=False, shade=False)
    ic.rect(1, 9, 4, 15, GREY)
    ic.rect(20, 9, 23, 15, GREY)
    ic.poly([(5, 10), (7, 12), (5, 14)], RED, outline=False, shade=False)
    ic.poly([(19, 10), (17, 12), (19, 14)], RED, outline=False, shade=False)


@icon('pikseli')
def _(ic):
    heart = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....']
    for j, row in enumerate(heart):
        for i, v in enumerate(row):
            if v == 'X':
                ic.rect(1 + i * 2 + i // 3, 3 + j * 2 + j // 4, 2 + i * 2 + i // 3, 4 + j * 2 + j // 4, RED if (i + j) % 3 else PINK, outline=False, shade=False)


@icon('ascii')
def _(ic):
    ic.rrect(1, 2, 23, 21, 2, (24, 26, 36))
    ic.rect(1, 2, 23, 5, GREY)
    ic.dots([(3, 3), (5, 3), (7, 3)], RED)
    text(ic, 3, 7, '@#', LIME)
    text(ic, 12, 7, '%', LIME)
    text(ic, 3, 13, '+=', LIME)
    ic.rect(12, 17, 14, 17, LIME, outline=False, shade=False)


@icon('bez-fona')
def _(ic):
    ic.rect(1, 1, 23, 23, W)
    for y in range(2, 23, 3):
        for x in range(2, 23, 3):
            if ((x + y) // 3) % 2:
                ic.rect(x, y, x + 2, y + 2, (210, 214, 222), outline=False, shade=False)
    ic.ellipse(8, 4, 16, 12, SKIN)
    ic.poly([(5, 23), (6, 16), (12, 13), (18, 16), (19, 23)], BLUE)


@icon('narezka')
def _(ic):
    ic.rrect(1, 6, 23, 18, 2, NAVY)
    wave(ic, 3, 21, 12, 5, CYAN)
    for x in (8, 16):
        ic.rect(x, 3, x, 21, YELLOW, outline=False, shade=False)
        ic.poly([(x - 2, 1), (x + 2, 1), (x, 4)], YELLOW, outline=False, shade=False)


@icon('cvetokor')
def _(ic):
    ic.rect(1, 1, 23, 23, (44, 44, 56))
    for i, (c, p) in enumerate([(RED, 6), (GREEN, 14), (BLUE, 9)]):
        x = 5 + i * 7
        ic.rect(x, 4, x, 20, DGREY, outline=False, shade=False)
        ic.rect(x - 2, p, x + 2, p + 2, c)


@icon('duoton')
def _(ic):
    ic.ellipse(2, 2, 22, 22, (255, 90, 120))
    ic.pie(2, 2, 22, 22, 135, 315, (40, 40, 160), outline=False, shade=False)
    ic.ellipse(8, 8, 16, 16, W, outline=False, shade=False)
    ic.pie(8, 8, 16, 16, 135, 315, (120, 120, 230), outline=False, shade=False)


@icon('mesh')
def _(ic):
    ic.rect(1, 1, 23, 23, W)
    cols = [[PURPLE, PINK, ORANGE], [BLUE, VIOLET, RED], [CYAN, SKY, YELLOW]]
    for j in range(3):
        for i in range(3):
            ic.rect(3 + i * 7, 3 + j * 7, 8 + i * 7, 8 + j * 7, cols[j][i], outline=False, shade=False)
    for k in (9, 16):
        ic.line([(3, k), (8, k + 1), (14, k - 1), (21, k)], W)
        ic.line([(k, 3), (k + 1, 8), (k - 1, 14), (k, 21)], W)
    for x, y in [(9, 9), (16, 8), (8, 16), (16, 16)]:
        ic.rect(x - 1, y - 1, x + 1, y + 1, K, outline=False, shade=False)
        ic.dot(x, y, W)


@icon('vodyanoy-znak')
def _(ic):
    photo(ic, 1, 3, 23, 21)
    ic.ellipse(7, 7, 17, 17, W, outline=False, shade=False)
    ic.ellipse(9, 9, 15, 15, SKY, outline=False, shade=False)
    ic.rect(11, 10, 13, 10, W, outline=False, shade=False)
    ic.rect(10, 11, 10, 13, W, outline=False, shade=False)
    ic.rect(11, 14, 13, 14, W, outline=False, shade=False)


@icon('exif')
def _(ic):
    photo(ic, 1, 1, 17, 17)
    ic.ellipse(12, 12, 23, 23, BLUE)
    ic.rect(17, 14, 18, 15, W, outline=False, shade=False)
    ic.rect(17, 17, 18, 21, W, outline=False, shade=False)


@icon('3d-tekst')
def _(ic):
    ic.poly([(6, 20), (11, 4), (16, 4), (21, 20)], tint(PURPLE, -0.4))
    ic.poly([(3, 18), (8, 2), (13, 2), (18, 18), (14, 18), (12, 12), (9, 12), (7, 18)], VIOLET)
    ic.rect(10, 7, 11, 9, W, outline=False, shade=False)


@icon('dorozhki')
def _(ic):
    ic.rrect(1, 1, 23, 23, 2, (40, 36, 60))
    for i, (c, x0, x1) in enumerate([(PINK, 3, 12), (CYAN, 8, 21), (LIME, 3, 17), (ORANGE, 11, 21)]):
        y = 3 + i * 5
        ic.rect(x0, y, x1, y + 3, c)
    ic.rect(14, 2, 14, 22, W, outline=False, shade=False)


@icon('obrezka-audio')
def _(ic):
    ic.rrect(1, 4, 23, 20, 2, NAVY)
    wave(ic, 3, 21, 12, 6, (70, 80, 120))
    wave(ic, 7, 16, 12, 6, CYAN)
    for x in (6, 17):
        ic.rect(x, 3, x, 21, YELLOW, outline=False, shade=False)
    ic.rect(6, 3, 8, 3, YELLOW, outline=False, shade=False)
    ic.rect(6, 21, 8, 21, YELLOW, outline=False, shade=False)
    ic.rect(15, 3, 17, 3, YELLOW, outline=False, shade=False)
    ic.rect(15, 21, 17, 21, YELLOW, outline=False, shade=False)


@icon('konverter-audio')
def _(ic):
    ic.pie(1, 1, 23, 23, 200, 340, K, outline=False, shade=False)
    ic.pie(3, 3, 21, 21, 190, 350, None or (0, 0, 0), outline=False, shade=False)
    ic.ellipse(4, 4, 20, 20, ORANGE)
    ic.ellipse(7, 13, 11, 17, K, outline=False, shade=False)
    ic.rect(11, 6, 12, 15, K, outline=False, shade=False)
    ic.rect(11, 6, 15, 8, K, outline=False, shade=False)
    ic.poly([(0, 7), (4, 3), (6, 8)], PURPLE)
    ic.poly([(24, 17), (20, 21), (18, 16)], PURPLE)

@icon('css-studiya')
def _(ic):
    ic.rrect(1, 2, 23, 22, 2, W)
    ic.rect(1, 2, 23, 5, PURPLE)
    ic.dots([(3, 3), (5, 3), (7, 3)], W)
    ic.rect(3, 7, 21, 20, (255, 150, 120), outline=False, shade=False)
    ic.poly([(3, 20), (3, 13), (21, 7), (21, 20)], (140, 110, 255), outline=False, shade=False)
    ic.rrect(7, 10, 18, 17, 2, (230, 230, 255))
    text(ic, 9, 11, '{}', PURPLE)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rendered = {}
    for name, fn in ICONS.items():
        ic = Icon()
        fn(ic)
        im = ic.image()
        im.save(OUT / f'{name}.png')
        rendered[name] = im
    if '--sheet' in sys.argv:
        path = sys.argv[sys.argv.index('--sheet') + 1]
        cols = 10; cell = 60; scale = 2
        rows = (len(rendered) + cols - 1) // cols
        sheet = Image.new('RGBA', (cols * cell * scale, rows * cell * scale), (30, 24, 48, 255))
        for i, (name, im) in enumerate(rendered.items()):
            big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
            sheet.alpha_composite(big, ((i % cols) * cell * scale + 10, (i // cols) * cell * scale + 10))
        sheet.save(path)
    print(f'{len(rendered)} иконок → {OUT}')


if __name__ == '__main__':
    main()
