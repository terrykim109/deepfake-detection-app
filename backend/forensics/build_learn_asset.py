from __future__ import annotations

import argparse
import json
import sys

from PIL import Image

from forensics.c2pa import check_c2pa
from forensics.edges import BLOCK_SIZE as EDGE_BLOCK_SIZE
from forensics.edges import edge_block_grid
from forensics.ela import BLOCK_SIZE as ELA_BLOCK_SIZE
from forensics.ela import ela_block_grid
from forensics.metadata import extract_metadata
from forensics.noise import BLOCK_SIZE as NOISE_BLOCK_SIZE
from forensics.noise import noise_block_grid


def _round_grid(grid) -> list[list[float]]:
    return [[round(float(v), 3) for v in row] for row in grid]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_image", help="Path to the teaching image")
    parser.add_argument("output_json", help="Path to write the precomputed grid JSON")
    args = parser.parse_args()

    with open(args.input_image, "rb") as f:
        image_bytes = f.read()

    with Image.open(args.input_image) as im:
        width, height = im.size

    if not (ELA_BLOCK_SIZE == NOISE_BLOCK_SIZE == EDGE_BLOCK_SIZE):
        raise RuntimeError(
            "ela/noise/edges BLOCK_SIZE constants have diverged — "
            "the three grids would not line up for the magnifier."
        )
    block_size = ELA_BLOCK_SIZE

    ela_grid = ela_block_grid(image_bytes)
    noise_grid = noise_block_grid(image_bytes)
    edge_grid = edge_block_grid(image_bytes)
    rows, cols = noise_grid.shape

    payload = {
        "image_width": width,
        "image_height": height,
        "block_size": block_size,
        "rows": rows,
        "cols": cols,
        "ela_grid": _round_grid(ela_grid),
        "noise_grid": _round_grid(noise_grid),
        "edge_grid": _round_grid(edge_grid),
        "metadata": extract_metadata(image_bytes),
        "c2pa": check_c2pa(image_bytes),
    }

    with open(args.output_json, "w") as f:
        json.dump(payload, f)

    print(
        f"Wrote {rows}x{cols} grid ({block_size}px blocks) for a "
        f"{width}x{height} image to {args.output_json}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
