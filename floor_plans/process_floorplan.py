"""
Process raw_basement.JPG:
  1. Find the white floor plan paper boundary (largest white rectangle)
  2. Perspective-correct it to a flat top-down view
  3. Crop out the right-side legend (fire safety info)
  4. Save as floorplan_clean.png (also copy to frontend public)
"""
import sys
import shutil
from pathlib import Path
import cv2
import numpy as np

SRC = Path(__file__).parent / "raw_basement.JPG"
OUT = Path(__file__).parent / "floorplan_clean.png"
PUBLIC = Path(__file__).parent.parent / "frontend" / "public" / "floorplans" / "floorplan_transparent.png"

def order_pts(pts):
    """Order 4 points: top-left, top-right, bottom-right, bottom-left."""
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    return np.array([
        pts[np.argmin(s)],   # top-left
        pts[np.argmin(diff)],# top-right
        pts[np.argmax(s)],   # bottom-right
        pts[np.argmax(diff)],# bottom-left
    ], dtype=np.float32)

def find_paper_contour(img):
    """Find the largest white/light rectangular region (the floor plan paper)."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Threshold: paper is bright, teal frame and background are darker
    _, thresh = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)

    # Morphological close to fill gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best = None
    best_area = 0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < img.shape[0] * img.shape[1] * 0.1:  # must be > 10% of image
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4 and area > best_area:
            best = approx
            best_area = area

    return best

def warp_to_rect(img, contour):
    """Perspective-warp the paper region to a flat rectangle."""
    pts = order_pts(contour)
    tl, tr, br, bl = pts

    w = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
    h = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))

    dst = np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(pts, dst)
    warped = cv2.warpPerspective(img, M, (w, h))
    return warped

def crop_legend(img):
    """
    The floor plan legend (fire safety icons, text) is on the right side.
    Crop it out to leave just the architectural drawing.
    """
    h, w = img.shape[:2]
    crop_x = int(w * 0.875)
    return img[:, :crop_x]

def crop_header(img):
    """
    The fire safety instructions text header sits at the top of the image.
    Crop it to leave just the floor plan drawing + LIBRARY label at bottom.
    Also trim a few percent from the bottom border.
    """
    h, w = img.shape[:2]
    crop_y_top = int(h * 0.21)   # remove the fire instructions banner
    crop_y_bot = int(h * 0.97)   # keep the LIBRARY label but trim bottom border
    return img[crop_y_top:crop_y_bot, :]

def main():
    img = cv2.imread(str(SRC))
    if img is None:
        print(f"ERROR: could not load {SRC}", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded: {img.shape[1]}x{img.shape[0]}")

    contour = find_paper_contour(img)

    if contour is not None:
        print("Found paper boundary, perspective-correcting...")
        warped = warp_to_rect(img, contour)
    else:
        print("Could not find paper contour, using full image with margin crop")
        # Fall back: crop the teal border manually (~4% each side)
        h, w = img.shape[:2]
        pad_h = int(h * 0.04)
        pad_w = int(w * 0.04)
        warped = img[pad_h:h-pad_h, pad_w:w-pad_w]

    print(f"After perspective warp: {warped.shape[1]}x{warped.shape[0]}")

    # Remove right legend
    cropped = crop_legend(warped)
    print(f"After legend crop: {cropped.shape[1]}x{cropped.shape[0]}")

    # Remove top header (fire safety instructions)
    cropped = crop_header(cropped)
    print(f"After header crop: {cropped.shape[1]}x{cropped.shape[0]}")

    # Resize to a clean 1536x1024 (3:2) — matches the existing floor plan dimensions
    final = cv2.resize(cropped, (1536, 1024), interpolation=cv2.INTER_LANCZOS4)
    print(f"Final: {final.shape[1]}x{final.shape[0]}")

    # Save
    cv2.imwrite(str(OUT), final, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    print(f"Saved: {OUT}")

    # Copy to frontend public directory
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(OUT), str(PUBLIC))
    print(f"Copied to: {PUBLIC}")

    print("\nDone! Refresh the browser to see the new floor plan.")

if __name__ == "__main__":
    main()
