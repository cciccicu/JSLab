"""Build a 3:2 JSLab marketplace cover from unmodified Vela screenshots."""

from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont


WIDTH, HEIGHT = 1800, 1200
SCALE = 2
BACKGROUND = "#101719"
FOREGROUND = "#f2f5f3"
MUTED = "#9bacae"


def font(size, bold=False):
    name = "Dengb.ttf" if bold else "Deng.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size * SCALE)


def main(screenshot_dir):
    screenshot_dir = Path(screenshot_dir)
    panels = [
        ("04-script-editor.png", "01  编写脚本", "#8abcf7"),
        ("05-js-market.png", "02  发现作品", "#80d4b5"),
        ("03-2048-game.png", "03  即刻运行", "#f5ad7e"),
    ]
    for filename, _, _ in panels:
        if not (screenshot_dir / filename).is_file():
            raise FileNotFoundError(screenshot_dir / filename)

    canvas = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE), BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    # Structured bands and fine rules keep the product screenshots prominent.
    draw.rectangle((0, 0, WIDTH * SCALE, 18 * SCALE), fill="#187d90")
    draw.rectangle((0, 0, 550 * SCALE, 18 * SCALE), fill="#e6885c")
    draw.rectangle((96 * SCALE, 68 * SCALE, 108 * SCALE, 161 * SCALE), fill="#e6885c")
    draw.text((137 * SCALE, 57 * SCALE), "JSLab", font=font(105, True), fill=FOREGROUND)
    draw.text((650 * SCALE, 99 * SCALE), "Vela 手环上的 JS 创作与应用平台",
              font=font(34), fill=MUTED)
    draw.text((100 * SCALE, 199 * SCALE), "写代码，也能直接玩。", font=font(58, True), fill=FOREGROUND)
    draw.line((100 * SCALE, 293 * SCALE, 1700 * SCALE, 293 * SCALE),
              fill="#374348", width=2 * SCALE)

    xs = (72, 636, 1200)
    frame_y = 379
    frame_width, frame_height = 528, 744
    screen_width, screen_height = 504, 720
    for x, (filename, label, accent) in zip(xs, panels):
        draw.ellipse((x * SCALE, 325 * SCALE, (x + 13) * SCALE, 338 * SCALE), fill=accent)
        draw.text(((x + 27) * SCALE, 306 * SCALE), label, font=font(30, True), fill=FOREGROUND)

        outer = (x * SCALE, frame_y * SCALE,
                 (x + frame_width) * SCALE, (frame_y + frame_height) * SCALE)
        draw.rounded_rectangle(outer, radius=44 * SCALE, fill="#303b40")
        screen = Image.open(screenshot_dir / filename).convert("RGB")
        screen = screen.resize((screen_width * SCALE, screen_height * SCALE), Image.Resampling.LANCZOS)
        mask = Image.new("L", screen.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, screen.width, screen.height), radius=31 * SCALE, fill=255
        )
        canvas.paste(screen, ((x + 12) * SCALE, (frame_y + 12) * SCALE), mask)

    draw.rectangle((99 * SCALE, 1160 * SCALE, 377 * SCALE, 1163 * SCALE), fill="#e6885c")
    draw.text((401 * SCALE, 1140 * SCALE), "创作  /  分享  /  探索", font=font(24), fill=MUTED)

    output = screenshot_dir / "JSLab-2.0-platform-cover-3x2.png"
    canvas.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS).save(output, optimize=True)
    print(output)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: make-promo-cover.py SCREENSHOT_DIR")
    main(sys.argv[1])
