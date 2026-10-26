#!/usr/bin/env python3
"""Deterministic soundtrack for the exam-trainer promo (Python stdlib only).

Music: D major, 116 BPM, glassy Karplus-Strong plucks + FM bells over a soft
four-on-the-floor groove. Intro 0-6.95 s, build 6.95-14.4 s, groove 14.4-59.6 s,
materials breakdown 59.6-67.4 s, progress groove 67.4-74.8 s, finale 74.8-85 s.
Every sound-design cue below mirrors a timeline constant in ../index.html.

Usage: python3 audio/synth.py  ->  audio/raw.wav (44.1 kHz, 16-bit stereo, 85 s)
"""

import array
import math
import os
import random
import struct
import wave

SR = 44100
DUR = 85.0
N = int(SR * DUR)
TAU = 2 * math.pi
rnd = random.Random(20261004)

BPM = 116
BEAT = 60 / BPM
G0 = 14.4  # groove downbeat = world reveal
BAR = 4 * BEAT


def zeros(n=N):
    return array.array("d", bytes(8 * n))


L, R, REV = zeros(), zeros(), zeros()


def mix(samples, t, gain=1.0, pan=0.0, send=0.0):
    i0 = int(t * SR)
    a = (pan + 1) * math.pi / 4
    gl, gr = math.cos(a) * gain, math.sin(a) * gain
    gs = send * gain
    n = len(samples)
    lo = max(0, -i0)
    hi = min(n, N - i0)
    for k in range(lo, hi):
        v = samples[k]
        i = i0 + k
        L[i] += v * gl
        R[i] += v * gr
        if gs:
            REV[i] += v * gs


def noise(n, r=rnd):
    return [r.uniform(-1, 1) for _ in range(n)]


def lowpass(x, cutoff):
    a = 1 - math.exp(-TAU * cutoff / SR)
    y, out = 0.0, []
    for v in x:
        y += a * (v - y)
        out.append(y)
    return out


def highpass(x, cutoff):
    lp = lowpass(x, cutoff)
    return [a - b for a, b in zip(x, lp)]


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- instruments
def pluck(f, d=0.9, bright=0.5, seed=0):
    """Karplus-Strong glass pluck."""
    r = random.Random(seed)
    n = int(d * SR)
    p = max(2, int(SR / f))
    buf = [r.uniform(-1, 1) for _ in range(p)]
    out = []
    idx = 0
    damp = 0.996 - (1 - bright) * 0.006
    for i in range(n):
        v = buf[idx]
        nxt = buf[(idx + 1) % p]
        buf[idx] = (v * (0.5 + bright * 0.2) + nxt * (0.5 - bright * 0.2)) * damp
        out.append(v)
        idx = (idx + 1) % p
    fade = int(0.03 * SR)
    for i in range(fade):
        out[-1 - i] *= i / fade
    return out


def bell(f, d=2.2, index=2.4, ratio=3.5, decay=2.2):
    n = int(d * SR)
    out = []
    for i in range(n):
        t = i / SR
        env = math.exp(-t * decay)
        mod = index * math.exp(-t * 3.5) * math.sin(TAU * f * ratio * t)
        out.append(math.sin(TAU * f * t + mod) * env * min(1, i / 60))
    return out


def kick(d=0.42, f0=130, f1=46, k=30, decay=7.5):
    n = int(d * SR)
    out, ph = [], 0.0
    for i in range(n):
        t = i / SR
        f = f1 + (f0 - f1) * math.exp(-t * k)
        ph += TAU * f / SR
        out.append(math.tanh(1.5 * math.sin(ph) * math.exp(-t * decay)))
    return out


def clap(d=0.25):
    n = int(d * SR)
    nz = highpass(noise(n), 1200)
    out = []
    for i in range(n):
        t = i / SR
        env = sum(math.exp(-(t - o) * 70) for o in (0, 0.009, 0.019) if t >= o) * 0.45 + math.exp(-t * 18) * 0.5
        out.append(nz[i] * env * 0.7)
    return out


def hat(d=0.05, decay=95):
    n = int(d * SR)
    nz = highpass(noise(n), 8000)
    return [nz[i] * math.exp(-i / SR * decay) for i in range(n)]


def tick(f=None, d=0.02):
    n = int(d * SR)
    nz = highpass(noise(n), 3500)
    f = f or rnd.uniform(2600, 3800)
    return [(nz[i] * 0.5 + math.sin(TAU * f * i / SR) * 0.5) * math.exp(-i / SR * 280) for i in range(n)]


def tok(f=520, d=0.12):
    n = int(d * SR)
    out, ph = [], 0.0
    for i in range(n):
        t = i / SR
        ph += TAU * f * (1 + 0.6 * math.exp(-t * 60)) / SR
        out.append(math.sin(ph) * math.exp(-t * 38))
    return out


def ui_click():
    n = int(0.045 * SR)
    return [(math.sin(TAU * 2100 * i / SR) * 0.6 + math.sin(TAU * 3300 * i / SR) * 0.3) * math.exp(-i / SR * 120) for i in range(n)]


def pop(f0=900, f1=320, d=0.12):
    n = int(d * SR)
    out, ph = [], 0.0
    for i in range(n):
        t = i / SR
        ph += TAU * (f1 + (f0 - f1) * math.exp(-t * 40)) / SR
        out.append(math.sin(ph) * math.exp(-t * 30))
    return out


def boom(d=2.0, f=44):
    n = int(d * SR)
    body = lowpass(noise(n), 240)
    out, ph = [], 0.0
    for i in range(n):
        t = i / SR
        ph += TAU * (f + 36 * math.exp(-t * 9)) / SR
        out.append(math.sin(ph) * math.exp(-t * 2.4) * 1.1 + body[i] * math.exp(-t * 3.8) * 2.0)
    return out


def shimmer(d=1.6, f0=2400, f1=7000):
    n = int(d * SR)
    nz = highpass(noise(n), 5000)
    out = []
    for i in range(n):
        t = i / SR
        p = i / n
        env = math.sin(math.pi * p) ** 1.5
        out.append((nz[i] * 0.35 + math.sin(TAU * (f0 + (f1 - f0) * p) * t) * 0.15) * env)
    return out


def riser(d, f0=200, f1=1600, c0=300, c1=8000):
    n = int(d * SR)
    nz = noise(n)
    out, y, ph = [], 0.0, 0.0
    for i in range(n):
        p = i / n
        c = c0 * (c1 / c0) ** p
        a = 1 - math.exp(-TAU * c / SR)
        y += a * (nz[i] - y)
        ph += TAU * (f0 * (f1 / f0) ** p) / SR
        out.append((y * 0.85 + math.sin(ph) * 0.22) * p**2.2)
    return out


def whoosh(d=0.8, peak=0.5, c0=300, c1=4200):
    n = int(d * SR)
    nz = noise(n)
    out, y = [], 0.0
    for i in range(n):
        p = i / n
        bellv = math.exp(-(((p - peak) / 0.27) ** 2))
        c = c0 + (c1 - c0) * bellv
        a = 1 - math.exp(-TAU * c / SR)
        y += a * (nz[i] - y)
        out.append(y * bellv * 1.6)
    return out


def zip_(d=0.35, f0=500, f1=2400):
    n = int(d * SR)
    out, ph = [], 0.0
    nz = highpass(noise(n), 2000)
    for i in range(n):
        p = i / n
        ph += TAU * (f0 + (f1 - f0) * p) / SR
        env = math.sin(math.pi * p)
        out.append((math.sin(ph) * 0.4 + nz[i] * 0.3) * env)
    return out


def chime(notes, d=1.4, spread=0.07, decay=3.5):
    n = int(d * SR)
    out = [0.0] * n
    for j, m in enumerate(notes):
        o = int(j * spread * SR)
        b = bell(midi(m), d - j * spread, 1.6, 3.0, decay)
        for i in range(min(len(b), n - o)):
            out[o + i] += b[i]
    return out


def impact(t, size=1.0):
    mix(boom(2.2 if size >= 1 else 1.4), t, 0.85 * size, 0, 0.25)
    mix(kick(0.5, 200, 40, 22, 5), t, 0.7 * size)
    mix(shimmer(1.8 if size >= 1 else 1.1), t, 0.25 * size, 0.1, 0.5)


# ---------------------------------------------------------------- harmony
V = {
    "D": ([62, 66, 69, 74], 38),
    "Bm": ([59, 62, 66, 71], 35),
    "G": ([55, 59, 62, 67], 31),
    "A": ([57, 61, 64, 69], 33),
    "Dmaj9": ([62, 66, 69, 73, 76], 38),
}
PROG = ["D", "Bm", "G", "A"]
BUILD = ["Bm", "G", "D", "A"]


def chord_at(t):
    if t < 5.0:
        return "D"
    if t < 6.95:
        return "G"
    if t < G0:
        return BUILD[min(3, int((t - 6.95) / ((G0 - 6.95) / 4)))]
    if t >= 77.45:
        return "Dmaj9"
    if t >= 74.85:
        return "A"
    return PROG[int((t - G0) // BAR) % 4]


def chord_edges():
    e = [0, 5.0, 6.95] + [6.95 + k * (G0 - 6.95) / 4 for k in range(1, 4)] + [G0]
    t = G0
    while t < 74.85:
        t += BAR
        if t < 74.85:
            e.append(t)
    e += [74.85, 77.45, DUR]
    return sorted(set(round(x, 4) for x in e))


def groove_on(t):
    return (G0 <= t < 59.6) or (67.45 <= t < 74.8)


def render_pad():
    pad = zeros()
    edges = chord_edges()
    for a, b in zip(edges, edges[1:]):
        notes = V[chord_at(a + 0.01)][0]
        i0, i1 = int(a * SR), min(N, int((b + 0.5) * SR))
        att, rel = 0.4, 0.5
        for m in notes:
            for det in (-0.0018, 0.0018):
                inc = midi(m) * (1 + det) / SR
                ph = rnd.random()
                for i in range(i0, i1):
                    t = i / SR
                    e = min(1, (t - a) / att) * (1 if t < b else max(0, 1 - (t - b) / rel))
                    ph += inc
                    if ph >= 1:
                        ph -= 1
                    pad[i] += (2 * ph - 1) * e * 0.05
    y, out = 0.0, zeros()
    for i in range(N):
        t = i / SR
        if t < 3.0:
            c = 380 + 500 * t / 3.0
        elif t < 6.95:
            c = 1100
        elif t < G0:
            c = 900 + 2200 * ((t - 6.95) / (G0 - 6.95)) ** 2
        elif t < 59.6:
            c = 1700 + 600 * (0.5 + 0.5 * math.sin(TAU * (t - G0) / (8 * BAR)))
        elif t < 74.85:
            c = 1300
        else:
            c = 3200
        a = 1 - math.exp(-TAU * c / SR)
        y += a * (pad[i] - y)
        out[i] = y
    return out


def render_bass(side):
    bass = zeros()
    t = G0
    k = 0
    while t < 74.8:
        if groove_on(t):
            root = V[chord_at(t)][1]
            m = root + (12 if k % 4 == 3 else 0)
            f = midi(m)
            n = int(BEAT * 0.48 * SR)
            i0 = int((t + BEAT / 2) * SR)
            for i in range(min(n, N - i0)):
                tt = i / SR
                env = math.exp(-tt * 6) * min(1, i / 70)
                s = math.sin(TAU * f * tt) + 0.35 * math.sin(TAU * 2 * f * tt) + 0.12 * math.sin(TAU * 3 * f * tt)
                bass[i0 + i] += s * env * 0.34
        t += BEAT
        k += 1
    # finale sustained low D
    i0 = int(77.45 * SR)
    for i in range(N - i0):
        tt = i / SR
        bass[i0 + i] += math.sin(TAU * midi(38) * tt) * math.exp(-tt * 0.45) * 0.4
    for i in range(N):
        bass[i] *= side[i]
    return bass


def render_arp():
    arp = zeros()
    pattern = [0, 2, 1, 3, 2, 1, 3, 1]

    def put(t, m, g, d=0.7, br=0.55):
        s = pluck(midi(m), d, br, seed=int(t * 1000))
        i0 = int(t * SR)
        for i in range(min(len(s), N - i0)):
            arp[i0 + i] += s[i] * g

    # build: 16ths rising out of the tile burst
    t, k = 6.95, 0
    while t < G0:
        notes = V[chord_at(t)][0]
        g = 0.18 + 0.22 * (t - 6.95) / (G0 - 6.95)
        put(t, notes[pattern[k % 8] % len(notes)] + 12, g, 0.5, 0.45)
        t += BEAT / 4
        k += 1
    # groove: 8ths, brighter in the stations
    t, k = G0, 0
    while t < 74.8:
        if groove_on(t):
            notes = V[chord_at(t)][0]
            g = 0.3 if t < 24 else 0.36
            put(t, notes[pattern[k % 8] % len(notes)] + 12, g, 0.6, 0.6)
            if k % 8 == 7:
                put(t + BEAT / 4, notes[3 % len(notes)] + 24, g * 0.5, 0.4, 0.7)
        t += BEAT / 2
        k += 1
    # materials breakdown: slow bell-like plucks
    t, k = 59.6, 0
    while t < 67.3:
        notes = V[chord_at(t)][0]
        put(t, notes[pattern[k % 8] % len(notes)] + 12, 0.26, 1.4, 0.3)
        t += BEAT
        k += 1
    return arp


def render_drums(side):
    K, C, H = kick(), clap(), hat()
    # pre-drop pulse in the build
    t = 10.6
    while t < G0 - 0.05:
        mix(kick(0.3, 110, 50, 30, 10), t, 0.35 + 0.25 * (t - 10.6) / (G0 - 10.6))
        t += BEAT
    # snare roll into the drop
    t, step = 13.36, BEAT / 4
    j = 0
    while t < G0 - 0.02:
        mix(clap(0.12), t, 0.12 + 0.03 * j, 0.0, 0.2)
        t += step
        j += 1
    t, beat = G0, 0
    while t < 74.8:
        if groove_on(t):
            mix(K, t, 0.9)
            i0 = int(t * SR)
            for i in range(int(0.32 * SR)):
                if i0 + i < N:
                    side[i0 + i] = min(side[i0 + i], 1 - 0.65 * math.exp(-i / SR * 9))
            if beat % 2 == 1:
                mix(C, t, 0.42, -0.05, 0.22)
            mix(H, t + BEAT / 2, 0.22, 0.3)
            if t >= 24.0:
                mix(H, t + BEAT * 0.75, 0.09, -0.3)
        t += BEAT
        beat += 1


def typing(t0, t1, every, gain=0.22, seed=1):
    r = random.Random(seed)
    t = t0
    while t < t1:
        mix(tick(), t + r.uniform(-0.004, 0.004), gain * r.uniform(0.7, 1.2), r.uniform(-0.4, 0.4), 0.05)
        t += every


def sfx():
    # S1 hook
    for j, t in enumerate([0.8, 0.94, 1.08, 1.22]):
        mix(tok(700 + j * 90, 0.1), t, 0.3, (j - 1.5) / 3, 0.25)
    mix(chime([74, 81], 1.6), 0.3, 0.06, 0, 0.5)
    mix(riser(1.6, 200, 1400), 1.3, 0.35, 0, 0.2)
    mix(whoosh(0.5, 0.75, 400, 6000), 2.65, 0.45, 0, 0.3)
    impact(3.0, 1.0)
    mix(chime([74, 78, 81, 86, 90], 2.2, 0.06, 2.4), 3.05, 0.09, 0, 0.6)
    mix(whoosh(0.9, 0.5, 300, 3000), 3.95, 0.3, -0.3, 0.3)
    mix(chime([86, 90, 93], 1.8, 0.08), 4.55, 0.08, 0.2, 0.6)
    mix(shimmer(1.6), 4.7, 0.2, -0.2, 0.4)
    mix(whoosh(0.5, 0.8, 500, 7000), 6.45, 0.4, 0, 0.3)
    # S2 inventory
    impact(6.95, 0.7)
    r = random.Random(9)
    for j in range(90):
        mix(tick(r.uniform(2400, 4200)), 6.98 + r.random() * 1.25, 0.09, r.uniform(-0.7, 0.7), 0.1)
    for j, t in enumerate([9.55, 10.3, 11.1]):
        mix(pop(700 + j * 180, 1000 + j * 200, 0.12), t, 0.28, (j - 1) * 0.4, 0.3)
        mix(chime([86 + j * 2], 0.8), t, 0.05, 0, 0.4)
    for j in range(4):
        mix(pop(900, 500, 0.1), 11.9 + j * 0.12, 0.14, (j - 1.5) / 2, 0.2)
    for j in range(3):
        mix(pop(600, 1200, 0.1), 12.4 + j * 0.12, 0.18, (j - 1) * 0.4, 0.2)
    mix(riser(1.4, 250, 2000), 13.0, 0.45, 0, 0.2)
    mix(whoosh(0.9, 0.7, 300, 6000), 13.9, 0.45, 0, 0.3)
    # world reveal
    impact(G0, 1.1)
    for j in range(3):
        mix(chime([74 + [0, 4, 7][j] + 12], 1.2), 14.85 + j * 0.12, 0.07, (j - 1) * 0.6, 0.5)
    mix(zip_(1.6, 300, 1600), 15.1, 0.16, 0, 0.4)
    mix(chime([86, 90, 93, 98], 2.0), 15.7, 0.07, 0, 0.6)
    # flights
    for t in (22.2, 34.6, 46.0, 57.8):
        mix(whoosh(2.0, 0.5, 200, 3800), t, 0.55, 0, 0.35)
        mix(whoosh(1.2, 0.7, 600, 7000), t + 0.6, 0.2, 0.4, 0.3)
    # F1 question
    b = 24.0
    for j in range(4):
        mix(pop(800, 420, 0.08), b + 0.9 + j * 0.12, 0.12, 0.4, 0.15)
    mix(tok(560), b + 2.4, 0.45, 0.3, 0.2)
    mix(tok(620), b + 3.42, 0.45, 0.3, 0.2)
    mix(ui_click(), b + 4.2, 0.5, 0.3)
    mix(chime([78, 85], 0.9, 0.08, 4.0), b + 4.45, 0.13, 0.3, 0.4)
    mix(whoosh(0.5, 0.5, 500, 3000), b + 5.0, 0.25, -0.3, 0.2)
    mix(zip_(0.4, 400, 1400), b + 5.7, 0.12, 0.3, 0.2)
    mix(pop(500, 900, 0.14), b + 6.5, 0.22, 0.3, 0.3)
    mix(chime([81], 0.8), b + 7.6, 0.05, 0.3, 0.4)
    # F2 formats + timer
    b = 36.6
    for k, t in enumerate((b + 1.0, b + 2.4, b + 4.0)):
        mix(whoosh(0.5, 0.4, 600, 4000), t, 0.22, 0.4, 0.2)
    for k, dt in enumerate((0.0, 0.3, 0.55, 0.7, 0.77)):
        mix(tok(480 + k * 30), b + 1.6 + 0.8 * [0.36, 0.73, 0.91, 0.98, 1.0][k], 0.42 * (0.7**k), 0.2, 0.2)
    for j in range(3):
        mix(ui_click(), b + 3.0 + j * 0.35, 0.35, 0.3)
        mix(pop(1200, 700, 0.08), b + 3.0 + j * 0.35, 0.15, 0.3, 0.2)
    for j in range(3):
        mix(zip_(0.45, 500 + j * 100, 2000 + j * 300), b + 4.5 + j * 0.4, 0.17, 0.2, 0.25)
    mix(whoosh(0.8, 0.5, 300, 4000), b + 5.6, 0.3, -0.4, 0.3)
    for j in range(72):
        mix(tick(3000 if j % 6 else 2200), b + 6.0 + j * 0.028, 0.08 if j % 6 else 0.16, -0.4, 0.05)
    mix(chime([81, 85], 1.0), b + 8.05, 0.08, -0.4, 0.4)
    # F3 results
    b = 48.0
    mix(pop(400, 900, 0.16), b + 0.8, 0.28, -0.4, 0.3)
    mix(riser(1.7, 300, 1800, 400, 6000), b + 0.95, 0.32, -0.3, 0.2)
    impact(b + 2.65, 0.55)
    mix(chime([74, 78, 81, 86], 1.6, 0.05), b + 2.65, 0.12, -0.3, 0.5)
    mix(shimmer(1.4, 3000, 8000), b + 2.7, 0.3, -0.3, 0.5)
    for j in range(3):
        mix(pop(900, 500, 0.09), b + 1.3 + j * 0.12, 0.15, 0.1, 0.2)
    typing(b + 1.4, b + 2.6, 0.05, 0.12, 4)
    for j in range(6):
        mix(bell(midi(86 + [0, 2, 4, 7, 9, 12][j]), 0.4, 1.0, 2.0, 9), b + 3.15 + j * 0.1, 0.05, (j - 2.5) / 4, 0.3)
    for j in range(2):
        mix(pop(700, 1100, 0.1), b + 4.8 + j * 0.15, 0.2, 0, 0.3)
    mix(pop(500, 1000, 0.14), b + 5.6, 0.25, -0.3, 0.3)
    mix(ui_click(), b + 6.4, 0.45, -0.3)
    mix(whoosh(0.8, 0.45, 2500, 400), b + 6.45, 0.3, -0.3, 0.2)
    # hub materials
    b = 59.8
    mix(riser(0.9, 200, 900, 300, 3000), b - 1.0, 0.25, 0, 0.3)
    mix(chime([62, 69, 74, 78, 81], 3.0, 0.1, 1.4), b - 0.2, 0.1, 0, 0.7)
    for j in range(6):
        mix(zip_(0.4, 300 + j * 60, 1200), b + 0.8 + j * 0.12, 0.08, -0.6 if j < 3 else 0.6, 0.3)
        mix(pop(600 + j * 60, 900, 0.1), b + 1.15 + j * 0.12, 0.13, -0.6 if j < 3 else 0.6, 0.3)
    mix(chime([86, 90], 1.0), b + 3.0, 0.06, 0, 0.5)
    # S8 progress + theme
    b = 66.4
    mix(riser(1.05, 150, 1200, 200, 6000), b, 0.4, 0, 0.3)
    mix(whoosh(1.1, 0.8, 300, 6000), b + 0.1, 0.35, 0, 0.3)
    impact(67.45, 0.6)
    for j in range(7):
        mix(bell(midi(74 + [0, 2, 4, 7, 9, 11, 12][j]), 0.4, 0.9, 2.0, 8), b + 1.8 + j * 0.1, 0.05, (j - 3) / 4, 0.3)
    mix(whoosh(0.6, 0.6, 600, 5000), b + 3.1, 0.3, 0.4, 0.2)
    mix(whoosh(0.6, 0.6, 600, 5000), b + 3.5, 0.3, 0.5, 0.2)
    mix(ui_click(), b + 4.5, 0.5, 0.6)
    mix(zip_(0.6, 600, 4200), b + 4.6, 0.18, 0.4, 0.4)
    mix(shimmer(1.0, 3000, 9000), b + 4.6, 0.22, 0.4, 0.4)
    mix(ui_click(), b + 7.0, 0.5, 0.6)
    mix(zip_(0.6, 3000, 500), b + 7.1, 0.16, 0.4, 0.4)
    # wipe + finale
    mix(whoosh(1.1, 0.5, 300, 8000), 74.8, 0.55, -0.2, 0.3)
    mix(riser(2.0, 180, 2200, 300, 9000), 75.45, 0.5, 0, 0.3)
    for k in range(3):
        mix(whoosh(1.8, 0.6, 300, 4000), 75.5 + k * 0.1, 0.16, (k - 1) * 0.8, 0.3)
    impact(77.45, 1.3)
    mix(chime([74, 78, 81, 85, 88, 93], 3.5, 0.07, 1.3), 77.5, 0.11, 0, 0.7)
    mix(chime([86, 90, 93], 1.8, 0.08), 78.9, 0.08, -0.3, 0.6)
    mix(shimmer(2.0, 2000, 7000), 79.1, 0.18, -0.2, 0.5)
    typing(80.5, 81.5, 0.03, 0.1, 7)
    for j in range(3):
        mix(pop(700 + j * 150, 1100, 0.1), 80.5 + j * 0.18, 0.18, (j - 1) * 0.4, 0.3)
    mix(pop(500, 1000, 0.15), 81.5, 0.28, 0, 0.3)
    mix(ui_click(), 82.5, 0.5, -0.2)
    mix(chime([81, 86, 90], 2.0, 0.06), 82.55, 0.09, -0.2, 0.6)


def reverb(send):
    out_l, out_r = zeros(), zeros()
    for out, delays in ((out_l, (1423, 1597, 1861, 2053)), (out_r, (1471, 1663, 1913, 2111))):
        for d in delays:
            buf = [0.0] * d
            idx, lp = 0, 0.0
            for i in range(N):
                y = buf[idx]
                lp += 0.32 * (y - lp)
                buf[idx] = send[i] + lp * 0.84
                idx += 1
                if idx == d:
                    idx = 0
                out[i] += y * 0.25
        for d, g in ((225, 0.6), (556, 0.6)):
            buf = [0.0] * d
            idx = 0
            for i in range(N):
                bb = buf[idx]
                x = out[i]
                y = -g * x + bb
                buf[idx] = x + g * y
                out[i] = y
                idx += 1
                if idx == d:
                    idx = 0
    return out_l, out_r


def main():
    side = array.array("d", [1.0]) * N
    render_drums(side)
    pad = render_pad()
    for i in range(N):
        pad[i] *= 0.6 + 0.4 * side[i]
    mix(pad, 0, 1.0, -0.15, 0.45)
    dl = int(0.011 * SR)
    for i in range(N - dl):
        R[i + dl] += pad[i] * 0.35
    mix(render_bass(side), 0, 0.9)
    arp = render_arp()
    for i in range(N):
        arp[i] *= 0.75 + 0.25 * side[i]
    mix(arp, 0, 0.75, 0.25, 0.4)
    d2 = int(BEAT * 0.75 * SR)
    for i in range(N - d2):
        L[i + d2] += arp[i] * 0.2
    sfx()
    rl, rr = reverb(REV)
    for i in range(N):
        L[i] += rl[i] * 0.5
        R[i] += rr[i] * 0.5
    for i in range(N):
        t = i / SR
        g = min(1.0, t / 0.1)
        if t > 83.0:
            g = max(0.0, (DUR - t) / 2.0)
        L[i] = math.tanh(L[i] * 0.95) * g
        R[i] = math.tanh(R[i] * 0.95) * g
    peak = max(max(abs(v) for v in L), max(abs(v) for v in R)) or 1.0
    k = 0.89 / peak
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for i in range(N):
            frames += struct.pack("<hh", int(L[i] * k * 32767), int(R[i] * k * 32767))
        w.writeframes(bytes(frames))
    print("wrote", path)


if __name__ == "__main__":
    main()
