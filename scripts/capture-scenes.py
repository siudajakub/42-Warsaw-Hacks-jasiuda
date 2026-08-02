#!/usr/bin/env python3
"""Capture the three public TV scenes at 1920×1080."""

import os
from pathlib import Path
from playwright.sync_api import sync_playwright


BASE_URL = os.getenv("HIGHLIGHTS_BASE_URL", "http://127.0.0.1:4242").rstrip("/")
OUTPUT = Path(__file__).resolve().parents[1] / "docs" / "img"
SCENES = (
    ("1", "scene-1.png"),
    ("2", "scene-2.png"),
    ("3", "scene-3.png"),
)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    issues: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        page.on("console", lambda message: issues.append(f"console {message.type}: {message.text}") if message.type == "error" else None)
        page.on("pageerror", lambda error: issues.append(f"page error: {error}"))
        for scene, filename in SCENES:
            page.goto(f"{BASE_URL}/?scene={scene}&still=1", wait_until="networkidle")
            page.screenshot(path=str(OUTPUT / filename), full_page=False)
            overflow = page.evaluate(
                """() => ({
                    width: document.documentElement.scrollWidth - innerWidth,
                    height: document.documentElement.scrollHeight - innerHeight,
                })"""
            )
            if overflow["width"] > 1 or overflow["height"] > 1:
                issues.append(f"{filename}: document overflow {overflow}")
        browser.close()
    if issues:
        raise SystemExit("\n".join(issues))
    print("Captured scene-1.png through scene-3.png at 1920x1080.")


if __name__ == "__main__":
    main()
