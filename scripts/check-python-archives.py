"""Validate release contents without importing the source checkout."""

import json
from pathlib import Path, PurePosixPath
import sys
import tarfile
import zipfile

manifest_path = Path(sys.argv[1])
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
for entry in manifest["files"]:
    if entry["registry"] != "pypi":
        continue
    path = manifest_path.parent / entry["path"]
    wheel = path.suffix == ".whl"
    if wheel:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
        root = ""
        package = "starling_bank/"
    else:
        with tarfile.open(path) as archive:
            assert all(member.isfile() or member.isdir() for member in archive.getmembers())
            names = [member.name for member in archive.getmembers() if member.isfile()]
        root = f"starling_bank_sdk-{manifest['version']}/"
        package = "src/starling_bank/"
    relative = set()
    for name in names:
        assert name.startswith(root) and ".." not in PurePosixPath(name).parts
        name = name[len(root):]
        relative.add(name)
        if name.startswith(package):
            assert name.endswith(".py") or name == package + "py.typed", name
        elif wheel:
            metadata = f"starling_bank_sdk-{manifest['version']}.dist-info/"
            assert name in {metadata + suffix for suffix in ("METADATA", "WHEEL", "RECORD", "licenses/LICENSE")}, name
        else:
            assert name in {".gitignore", "LICENSE", "README.md", "pyproject.toml", "PKG-INFO"}, name
    for required in ("__init__.py", "client.py", "auth.py", "signing.py", "py.typed", "generated/client.py"):
        assert package + required in relative, (path.name, required)
    print(f"Validated {path.name}: package sources, typing marker and metadata only.")
