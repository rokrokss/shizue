import requests
import json
import os
from pathlib import Path

# --- 설정 ---
PYODIDE_VERSION = "v0.27.7"  # 사용하는 Pyodide 버전에 맞게 수정
PACKAGES_TO_DOWNLOAD = [
    "PyMuPDF", "numpy",
]
DOWNLOAD_DIR = Path("pyodide_packages")
# --- --- ---

print(f"Downloading packages for Pyodide {PYODIDE_VERSION}")
DOWNLOAD_DIR.mkdir(exist_ok=True)

# Pyodide 메타데이터 다운로드
repo_url = f"https://cdn.jsdelivr.net/pyodide/{PYODIDE_VERSION}/full/pyodide-lock.json"
print(f"Fetching {repo_url}...")
resp = requests.get(repo_url)
resp.raise_for_status()
repo_data = resp.json()

packages_info = repo_data.get("packages", {})
to_fetch = set(PACKAGES_TO_DOWNLOAD)
fetched = set()

# 의존성 해결 및 다운로드 목록 생성
while to_fetch:
    pkg_name = to_fetch.pop()
    if pkg_name in fetched or pkg_name not in packages_info:
        continue

    print(f"Processing: {pkg_name}")
    pkg_info = packages_info[pkg_name]

    # 의존성 추가
    for dep in pkg_info.get("depends", []):
        if dep not in fetched:
            to_fetch.add(dep)

    # 파일 다운로드
    file_name = pkg_info["file_name"]
    file_url = f"https://cdn.jsdelivr.net/pyodide/{PYODIDE_VERSION}/full/{file_name}"
    target_path = DOWNLOAD_DIR / file_name

    if not target_path.exists():
        print(f"  Downloading {file_url}...")
        r = requests.get(file_url, stream=True)
        r.raise_for_status()
        with open(target_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    else:
        print(f"  '{file_name}' already exists. Skipping.")

    fetched.add(pkg_name)

print("\n✅ All required packages downloaded successfully into 'pyodide_packages' folder.")
