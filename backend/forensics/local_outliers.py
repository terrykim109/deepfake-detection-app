from __future__ import annotations

import cv2
import numpy as np

LOCAL_NEIGHBOR_RADIUS = 2
LOCAL_DEVIATION_THRESHOLD = 4.0

# Finds image blocks that are unusually different from nearby blocks.
# Not using the entire image, using only blocks (nearby pixels) instead
def local_outlier_mask(
    grid: np.ndarray,
    radius: int = LOCAL_NEIGHBOR_RADIUS,
    threshold: float = LOCAL_DEVIATION_THRESHOLD,
) -> np.ndarray:
    if grid.size == 0:
        return np.zeros_like(grid, dtype=bool)

    window = 2 * radius + 1
    padded = np.pad(grid, radius, mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, (window, window))
    flat_neighbors = windows.reshape(*grid.shape, window * window)

    center_index = radius * window + radius
    neighbors = np.delete(flat_neighbors, center_index, axis=-1)

    local_median = np.median(neighbors, axis=-1)
    local_mad = np.median(np.abs(neighbors - local_median[..., None]), axis=-1)

    value_range = float(grid.max() - grid.min())
    noise_floor = value_range * 0.01
    denominator = np.maximum(np.maximum(local_mad, noise_floor), 1e-9)

    deviation = np.abs(grid - local_median) / denominator
    return deviation >= threshold


def count_local_outliers(
    grid: np.ndarray,
    radius: int = LOCAL_NEIGHBOR_RADIUS,
    threshold: float = LOCAL_DEVIATION_THRESHOLD,
) -> int:
    return int(np.sum(local_outlier_mask(grid, radius, threshold)))

# Draws a small highlighted box around every block marked as unusual
# Boxes are drawn on the image 
def draw_outlier_outlines(
    image: np.ndarray,
    mask: np.ndarray,
    block_size: int,
    color: tuple[int, int, int] = (0, 0, 255),
    thickness: int = 2,
) -> None:
    height, width = image.shape[:2]
    rows, cols = mask.shape
    for r in range(rows):
        for c in range(cols):
            if not mask[r, c]:
                continue
            y0, y1 = r * block_size, min((r + 1) * block_size, height)
            x0, x1 = c * block_size, min((c + 1) * block_size, width)
            cv2.rectangle(image, (x0, y0), (x1 - 1, y1 - 1), color, thickness)
