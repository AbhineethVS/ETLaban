from pathlib import Path


ROOT = Path(__file__).resolve().parent
SCRAPE_DIR = ROOT / "scrape"


def scrape_path(*parts: str) -> Path:
    SCRAPE_DIR.mkdir(parents=True, exist_ok=True)
    return SCRAPE_DIR.joinpath(*parts)
