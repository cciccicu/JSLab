#!/usr/bin/env python3
import argparse
import logging
import os
from pathlib import Path

try:
    from LVGLImage import LVGLImage, ColorFormat, ParameterError
except ImportError as exc:
    raise ImportError("LVGLImage.py is required in the same folder") from exc


def pack_header_v8(cf_value: int, w: int, h: int) -> bytes:
    if cf_value > 0x1F:
        raise ParameterError(f"color format overflow: {cf_value}")
    if w > 0x7FF or h > 0x7FF:
        raise ParameterError(f"w, h overflow: {w}x{h}")

    # lv_img_header_t (little-endian):
    # bits 0..4  cf
    # bits 5..7  always_zero
    # bits 8..9  reserved
    # bits 10..20 w (11 bits)
    # bits 21..31 h (11 bits)
    header = (cf_value & 0x1F) | ((w & 0x7FF) << 10) | ((h & 0x7FF) << 21)
    return header.to_bytes(4, byteorder="little")


def write_bin_v8(img: LVGLImage, output_path: str) -> None:
    header = pack_header_v8(img.cf.value, img.w, img.h)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(header)
        f.write(img.data)


def _replace_ext(input_path: str, output_dir: str, name_override: str = None) -> str:
    if name_override:
        base = name_override
    else:
        base = Path(input_path).stem
    return str(Path(output_dir) / (base + ".bin"))


def main():
    parser = argparse.ArgumentParser(description="LVGL v8 PNG to bin image tool.")
    parser.add_argument(
        "--cf",
        help=("bin image color format, use AUTO for automatically "
              "choose from I1/2/4/8"),
        default="I8",
        choices=[
            "L8", "I1", "I2", "I4", "I8", "A1", "A2", "A4", "A8", "AL88",
            "ARGB8888", "XRGB8888", "RGB565", "RGB565_SWAPPED", "RGB565A8",
            "ARGB8565", "RGB888", "AUTO", "RAW", "RAW_ALPHA",
            "ARGB8888_PREMULTIPLIED"
        ])
    parser.add_argument("--rgb565dither", action="store_true",
                        help="use dithering to correct banding in gradients", default=False)
    parser.add_argument("--premultiply", action="store_true",
                        help="pre-multiply color with alpha", default=False)
    parser.add_argument("--align",
                        help="stride alignment in bytes (must be 1 for LVGL v8)",
                        default=1,
                        type=int,
                        metavar="byte",
                        nargs="?")
    parser.add_argument("--background",
                        help="Background color for formats without alpha",
                        default=0x00_00_00,
                        type=lambda x: int(x, 0),
                        metavar="color",
                        nargs="?")
    parser.add_argument("-o", "--output", default="./output",
                        help="Select the output folder, default to ./output")
    parser.add_argument("--name", default=None,
                        help="Specify name for output file. Only applies when input is a file.")
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument("input", help="the filename or folder to be recursively converted")

    args = parser.parse_args()
    if args.align != 1:
        raise ParameterError("LVGL v8 bin has no stride field; use --align 1")

    if os.path.isfile(args.input):
        files = [args.input]
    elif os.path.isdir(args.input):
        files = list(Path(args.input).rglob("*.[pP][nN][gG]"))
        if args.name is not None:
            raise BaseException("cannot specify --name when input is a directory")
    else:
        raise BaseException(f"invalid input: {args.input}")

    if args.verbose:
        logging.basicConfig(level=logging.INFO)

    if args.cf == "AUTO":
        cf = None
    else:
        cf = ColorFormat[args.cf]

    for f in files:
        img = LVGLImage().from_png(
            f,
            cf,
            background=args.background,
            rgb565_dither=args.rgb565dither
        )
        img.adjust_stride(align=1)
        if args.premultiply:
            img.premultiply()

        output_path = _replace_ext(f, args.output, args.name)
        write_bin_v8(img, output_path)

    print(f"done {len(files)} files")


if __name__ == "__main__":
    main()
