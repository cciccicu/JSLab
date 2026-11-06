"""Build the OFL-1.1 JSLab font from pinned Sarasa and Noto sources, offline."""
from __future__ import annotations

import ast
import argparse
import copy
import hashlib
import json
import re
from array import array
from collections import Counter, defaultdict
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent, GlyphCoordinates
from fontTools.ttLib.tables.ttProgram import Program
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
OUTPUT = ROOT.parent / 'build/font'
NAME = 'JSLab Wrist Mono'
STEM = 'JSLabWristMono-Regular'
UPM = 1000
SOURCES = {
    'sarasa': {
        'sha256': 'f0db6e00d3f9ffc3643430483410fd463758d8da93204f1ed1d30278afc2db28',
        'url': 'https://github.com/be5invis/Sarasa-Gothic/releases/tag/v1.0.43',
        'license': 'SIL Open Font License 1.1',
    },
    'emoji': {
        'sha256': 'de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551',
        'url': 'https://github.com/google/fonts/blob/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf',
        'gitBlob': 'c2c26ab612a88a8610ff9cfbb89299bf2aea6c7a',
        'license': 'SIL Open Font License 1.1',
    },
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def get_input_characters():
    directory = REPO / 'vela-quickapp/src/components/InputMethod'
    source = (directory / 'assets/dic.js').read_text(encoding='utf-8')
    dictionary = json.loads(re.search(r'const dict = (\{.*\})', source).group(1))
    han = set(map(ord, ''.join(dictionary.values())))
    ux = (directory / 'InputMethod.ux').read_text(encoding='utf-8')
    symbols = set()
    for name in ('cnSymbols', 'enSymbols'):
        match = re.search(name + r':\s*(\[[\s\S]*?\n      \]),', ux)
        rows = ast.literal_eval(match.group(1))
        symbols.update(ord(char) for row in rows for key in row for char in key)
    return han, symbols, set(range(32, 127)) | han | symbols


def share_contours(glyphs, metrics):
    """Losslessly reuse identical translated contours as TrueType components."""
    patterns = defaultdict(list)
    by_glyph = {}
    for name, glyph in list(glyphs.items()):
        if glyph.numberOfContours <= 0:
            continue
        parts, start = [], 0
        for end in glyph.endPtsOfContours:
            coords = glyph.coordinates[start:end+1]
            flags = glyph.flags[start:end+1]
            x, y = min(p[0] for p in coords), min(p[1] for p in coords)
            key = tuple((p[0]-x, p[1]-y, int(flag)) for p, flag in zip(coords, flags))
            parts.append((key, x, y))
            patterns[key].append(name)
            start = end+1
        by_glyph[name] = parts

    def simple(parts):
        result = Glyph()
        result.numberOfContours = len(parts)
        result.coordinates = GlyphCoordinates()
        result.flags = array('B')
        result.endPtsOfContours = []
        result.program = Program()
        for key, x, y in parts:
            result.coordinates.extend((px+x, py+y) for px, py, _ in key)
            result.flags.extend(flag for _, _, flag in key)
            result.endPtsOfContours.append(len(result.coordinates)-1)
        result.recalcBounds(None)
        return result

    shared = {}
    for key, occurrences in patterns.items():
        if len(occurrences) < 3:
            continue
        part = simple([(key, 0, 0)])
        length = len(part.compile(None))
        # Account for helper glyph, loca/hmtx entries and component records;
        # exclude small shapes that cost more bytes as components.
        saving = (length-12)*len(occurrences) - (length+6+8*len(occurrences))
        if saving <= 20:
            continue
        name = f'part{len(shared):04d}'
        shared[key] = name
        glyphs[name] = part
        metrics[name] = (1000, part.xMin)
    changed = 0
    for name, parts in by_glyph.items():
        if not any(key in shared for key, _, _ in parts):
            continue
        remainder = [part for part in parts if part[0] not in shared]
        components = [(shared[key], x, y) for key, x, y in parts if key in shared]
        if remainder:
            suffix = name + '.rest'
            glyphs[suffix] = simple(remainder)
            metrics[suffix] = (1000, glyphs[suffix].xMin)
            components.append((suffix, 0, 0))
        result = Glyph()
        result.numberOfContours = -1
        result.components = []
        for target, x, y in components:
            component = GlyphComponent()
            component.glyphName, component.x, component.y = target, x, y
            component.flags = 0x4
            result.components.append(component)
        glyphs[name] = result
        changed += 1
    return {'sharedContours': len(shared), 'compositeGlyphs': changed}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sarasa', type=Path, required=True, help='Sarasa Mono SC Regular 1.0.43 TTF')
    parser.add_argument('--emoji', type=Path, required=True, help='Noto Emoji 3.002 variable TTF')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    family, stem = NAME, STEM
    fonts = {}
    for key, info in SOURCES.items():
        source_path = getattr(args, key)
        digest = sha256(source_path)
        if digest != info['sha256']:
            raise ValueError(f'Upstream SHA-256 mismatch: {key}')
        info['sha256'] = digest
        fonts[key] = TTFont(source_path, recalcTimestamp=False)
        info['version'] = fonts[key]['name'].getDebugName(5)
    fonts['emoji'] = instantiateVariableFont(fonts['emoji'], {'wght': 400}, inplace=True)
    cmaps = {key: font.getBestCmap() for key, font in fonts.items()}
    glyph_sets = {key: font.getGlyphSet() for key, font in fonts.items()}
    han, keyboard_symbols, input_chars = get_input_characters()
    groups = json.loads((REPO / 'jslab-cloud/lib/ai-prompt-emoji.json').read_text(encoding='utf-8'))['groups']
    icon_chars = {ord(c) for text in groups.values() for c in text if not c.isspace()}
    # The input repertoire includes every character of the original built-in font.
    punctuation = set(map(ord, '，。？！：；、“”‘’（）《》【】…—·〈〉「」『』〔〕〖〗〘〙〚〛～'))
    extras = set(map(ord, '￥€£¥¢©®™°±×÷≠≤≥≈∞√∑πΩ℃℉←↑→↓↔↕•‣○●□■△▲▽▼◆◇☆★'))
    # Keep visible Latin-1 characters for copied English text, without importing
    # unused language blocks or the rest of either source font.
    latin = set(map(ord, '\u00a0üéàèµ'))
    fullwidth = {0x3000}
    wanted = input_chars | punctuation | extras | latin | fullwidth | icon_chars
    controls = {0x200C, 0x200D, 0xFE0E, 0xFE0F}
    missing_icons = icon_chars - set(cmaps['emoji']) - set(cmaps['sarasa'])
    if missing_icons:
        raise ValueError('Missing upstream emoji: ' + ''.join(map(chr, sorted(missing_icons))))

    owners = {}
    for cp in sorted(wanted):
        if cp in icon_chars and cp in cmaps['emoji']:
            owners[cp] = 'emoji'
        elif cp in cmaps['sarasa']:
            owners[cp] = 'sarasa'
        else:
            raise ValueError(f'No source glyph for U+{cp:04X} {chr(cp)}')

    glyphs, metrics, mapping, bounds = {}, {}, {}, {}
    origin_report = {}
    def import_glyph(name, owner, original, advance, shift_y=0, is_icon=False):
        source_set = glyph_sets[owner]
        recording = DecomposingRecordingPen(source_set)
        source_set[original].draw(recording)
        bbox_pen = BoundsPen(None)
        recording.replay(bbox_pen)
        bbox = bbox_pen.bounds
        transform = (1, 0, 0, 1, 0, shift_y)
        source_advance = fonts[owner]['hmtx'][original][0]
        if is_icon and bbox:
            x0, y0, x1, y1 = bbox
            # A single global scale preserves the relative size of Noto symbols.
            scale = 900 / 2080
            scale = min(scale, 900 / (x1-x0 or 1), 900 / (y1-y0 or 1))
            transform = (scale, 0, 0, scale, 500-(x0+x1)*scale/2, 330-(y0+y1)*scale/2)
        elif bbox:
            # Recenter full-width Chinese punctuation, without stretching strokes.
            # Sarasa's ASCII parentheses are 1002 units tall; fit oversized
            # outlines uniformly into the 1000-unit line box before shifting.
            scale = min(1, 1000 / (bbox[3] - bbox[1]))
            y0, y1 = bbox[1] * scale + shift_y, bbox[3] * scale + shift_y
            if y1 > 830:
                shift_y -= y1-830
            if y0 < -170:
                shift_y += -170-y0
            transform = (scale, 0, 0, scale, (advance-source_advance*scale)/2, shift_y)
        pen = TTGlyphPen(None)
        recording.replay(TransformPen(pen, transform))
        glyph = pen.glyph(dropImpliedOnCurves=True)
        glyph.recalcBounds(None)
        lsb = getattr(glyph, 'xMin', 0)
        glyphs[name] = glyph
        metrics[name] = (advance, lsb)
        if glyph.numberOfContours:
            bounds[name] = [glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax]
        return transform

    import_glyph('.notdef', 'sarasa', '.notdef', 500, shift_y=-30)
    # The Sarasa Chinese subset spans -97..860; a 30-unit downward shift
    # fits it inside the established 830/-170 line box without shrinking it.
    for cp, owner in owners.items():
        name = f'uni{cp:04X}'
        advance = 1000
        if owner == 'sarasa' and cp not in punctuation and cp not in fullwidth and cp not in han and cp not in icon_chars:
            advance = 1000 if (0x3400 <= cp <= 0x9FFF or 0x3000 <= cp <= 0x303F or 0xF900 <= cp <= 0xFAFF
                               or 0xFF00 <= cp <= 0xFF60 or 0xFFE0 <= cp <= 0xFFE6) else 500
        transform = import_glyph(name, owner, cmaps[owner][cp], advance,
                                 shift_y=-30 if owner == 'sarasa' else 0,
                                 is_icon=owner == 'emoji')
        mapping[cp] = name
        origin_report[f'U+{cp:04X}'] = {'source': owner, 'advance': advance, 'transform': transform}
    for cp in sorted(controls):
        name = f'uni{cp:04X}'
        glyphs[name] = TTGlyphPen(None).glyph()
        metrics[name] = (0, 0)
        mapping[cp] = name

    before_sharing = copy.deepcopy(glyphs)
    optimization = share_contours(glyphs, metrics)
    fb = FontBuilder(UPM, isTTF=True)
    # Put the common advance last, allowing TrueType hmtx compression.
    order = ['.notdef'] + sorted((n for n in glyphs if n != '.notdef'), key=lambda n: (metrics[n][0], n))
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(mapping)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    # Use the existing line box. Record the actual font bounding box separately
    # as Win metrics so engines using either metric set can avoid clipping.
    ymax = max(b[3] for b in bounds.values())
    ymin = min(b[1] for b in bounds.values())
    fb.setupHorizontalHeader(ascent=830, descent=-170, lineGap=0)
    copyright_text = '; '.join(dict.fromkeys(fonts[key]['name'].getDebugName(0) or '' for key in fonts))
    fb.setupNameTable({
        'familyName': family, 'styleName': 'Regular',
        'uniqueFontIdentifier': stem + '-20261105-2',
        'fullName': family + ' Regular', 'psName': stem,
        'version': 'Version 2.000',
        'copyright': copyright_text,
        'description': 'Sarasa Mono SC text and punctuation; Noto Emoji monochrome icons. Subset and adjusted for JSLab.',
        'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1. See the accompanying LICENSE.Sarasa and LICENSE.NotoEmoji for full license text and copyright notices.',
        'licenseInfoURL': 'https://openfontlicense.org/open-font-license-official-text/',
    })
    fb.setupOS2(version=4, sTypoAscender=830, sTypoDescender=-170, sTypoLineGap=0,
                usWinAscent=max(830, ymax), usWinDescent=max(170, -ymin),
                sxHeight=bounds[mapping[ord('x')]][3], sCapHeight=bounds[mapping[ord('H')]][3], usWeightClass=400,
                fsSelection=0xC0, fsType=0)
    fb.setupPost(keepGlyphNames=False)
    # Explicit variation sequences keep ❤ and ❤️ / ⚙ and ⚙️ on this same
    # monochrome face in renderers with Unicode variation-selector support.
    variation = CmapSubtable.newSubtable(14)
    variation.platformID = 0
    variation.platEncID = 5
    variation.language = 0
    variation.cmap = {}
    variation.uvsDict = {vs: [(cp, None) for cp in sorted(icon_chars)] for vs in (0xFE0E, 0xFE0F)}
    fb.font['cmap'].tables.append(variation)
    fb.font['head'].created = fb.font['head'].modified = 3876681600
    fb.font.recalcTimestamp = False
    ttf_path = output / (stem + '.ttf')
    fb.save(ttf_path)
    if ttf_path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('Built font exceeds the 2 MiB import limit')
    built = TTFont(ttf_path, recalcTimestamp=False)
    built.setGlyphOrder(order)
    def contours(glyph, glyf):
        points, ends, flags = glyph.getCoordinates(glyf)
        result, start = [], 0
        for end in ends:
            result.append(tuple((x, y, int(flag)) for (x, y), flag in zip(points[start:end+1], flags[start:end+1])))
            start = end+1
        return sorted(result)
    # Validate every outline after decomposition, including every input Hanzi.
    for name, original in before_sharing.items():
        if contours(original, None) != contours(built['glyf'][name], built['glyf']):
            raise AssertionError('Contour sharing changed an outline: ' + name)
    optimization['allOutlinesVerifiedIdentical'] = True
    built.flavor = 'woff2'
    built.save(output / (stem + '.woff2'))
    profile = {'version': 1, 'name': family, 'sourceName': ttf_path.name, 'format': 'ttf',
               'family': 'JSLabActive', 'lineHeightRatio': 1, 'lineHeightOffset': 0,
               'asciiWidthRatio': 0.5, 'wideWidthRatio': 1}
    profile['fullWidthCharacters'] = ''.join(chr(cp) for cp in sorted(mapping)
        if cp < 0x3400 and metrics[mapping[cp]][0] == 1000)
    profile['zeroWidthCharacters'] = ''.join(map(chr, sorted(controls)))
    profile['emojiCatalog'] = 'jslab-wrist-mono-v2'
    (output / (stem + '.json')).write_text(json.dumps(profile, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    report = {
        'name': family, 'license': 'OFL-1.1', 'ttfBytes': ttf_path.stat().st_size,
        'woff2Bytes': (output / (stem + '.woff2')).stat().st_size,
        'sha256': sha256(ttf_path), 'unitsPerEm': UPM,
        'ascent': 830, 'descent': -170, 'lineGap': 0,
        'glyphBoundsY': [ymin, ymax], 'glyphs': len(glyphs),
        'characters': len(mapping), 'inputHanzi': len(han),
        'inputCharacters': len(input_chars), 'inputMissing': sorted(input_chars-set(mapping)),
        'emojiIcons': len(icon_chars), 'emojiMissing': sorted(icon_chars-set(mapping)),
        'sourcesCount': dict(Counter(owners.values())), 'cmap': sorted(mapping),
        'optimization': optimization,
        'emojiCodepoints': sorted(icon_chars), 'fullWidthPunctuation': sorted(punctuation),
        'sourceVersions': {key: {k: v for k, v in info.items() if k != 'path'} for key, info in SOURCES.items()},
        'inputDictionarySha256': sha256(REPO / 'vela-quickapp/src/components/InputMethod/assets/dic.js'),
        'inputComponentSha256': sha256(REPO / 'vela-quickapp/src/components/InputMethod/InputMethod.ux'),
        'over2MiBImportLimit': ttf_path.stat().st_size > 2 * 1024 * 1024,
        'limitations': ['No color emoji tables; monochrome outlines only.',
                        'No ZWJ, skin-tone or regional-flag ligatures; use single-codepoint icons.',
                        'Rendering on Vela hardware requires separate device validation.'],
    }
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (output / 'glyph-sources.json').write_text(json.dumps(origin_report, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    (output / 'charset.txt').write_text(''.join(map(chr, sorted(mapping))) + '\n', encoding='utf-8')
    (output / 'emoji-icons.txt').write_text('\n\n'.join(f'{key}\n{text}' for key, text in groups.items()) + '\n', encoding='utf-8')
    for name in ('LICENSE.Sarasa', 'LICENSE.NotoEmoji'):
        (output / name).write_bytes((ROOT.parent / 'src/common/fonts' / name).read_bytes())
    print(json.dumps({k: v for k, v in report.items() if k not in ('cmap','emojiCodepoints','fullWidthPunctuation','sourceVersions')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
