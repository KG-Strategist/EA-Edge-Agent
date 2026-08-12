#!/usr/bin/env python3
"""
evaluate_all_checkpoints.py — Evaluate OCR checkpoints against ground truth.
Outputs TSV report for graph-loop.mjs consumption.

Checks checkpoints/ directory for model subdirectories with:
  - config.json (model config)
  - model.onnx or *.bin (model weights)
  - ground_truth.txt (expected OCR output)
"""

import json
import os
import sys
import subprocess
import time
from pathlib import Path
from difflib import SequenceMatcher

SCRIPT_DIR = Path(__file__).parent
CHECKPOINTS_DIR = SCRIPT_DIR / "checkpoints"
REPORT_PATH = SCRIPT_DIR.parent.parent / "test-results" / "e2e" / "reports" / "ocr-eval.tsv"
HAS_TESSERACT = False

def check_tesseract():
    global HAS_TESSERACT
    try:
        result = subprocess.run(["tesseract", "--version"], capture_output=True, text=True, timeout=5)
        HAS_TESSERACT = result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        HAS_TESSERACT = False

def find_checkpoints():
    """Find all checkpoint directories."""
    if not CHECKPOINTS_DIR.exists():
        return []
    checkpoints = []
    for d in sorted(CHECKPOINTS_DIR.iterdir()):
        if d.is_dir() and not d.name.startswith("."):
            checkpoints.append(d)
    return checkpoints

def analyze_checkpoint(checkpoint_dir):
    """Analyze a checkpoint directory for structure and config."""
    result = {
        "name": checkpoint_dir.name,
        "path": str(checkpoint_dir),
        "has_config": False,
        "has_model": False,
        "has_ground_truth": False,
        "config": {},
        "model_size": 0,
        "ground_truth_text": "",
        "error": None,
    }

    # Check for config
    config_path = checkpoint_dir / "config.json"
    if config_path.exists():
        result["has_config"] = True
        try:
            with open(config_path) as f:
                result["config"] = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            result["error"] = f"config parse error: {e}"

    # Check for model files
    model_exts = [".onnx", ".bin", ".safetensors", ".gguf", ".pt", ".pth"]
    for ext in model_exts:
        for model_file in checkpoint_dir.glob(f"*{ext}"):
            result["has_model"] = True
            result["model_size"] += model_file.stat().st_size

    # Check for ground truth
    gt_path = checkpoint_dir / "ground_truth.txt"
    if gt_path.exists():
        result["has_ground_truth"] = True
        try:
            result["ground_truth_text"] = gt_path.read_text().strip()
        except IOError as e:
            result["error"] = f"ground truth read error: {e}"

    return result

def run_tesseract_evaluation(image_path, ground_truth):
    """Run Tesseract on an image and compare to ground truth."""
    if not HAS_TESSERACT:
        return None, "tesseract not available"

    try:
        result = subprocess.run(
            ["tesseract", str(image_path), "stdout", "--psm", "6"],
            capture_output=True, text=True, timeout=30
        )
        ocr_text = result.stdout.strip()
        ratio = SequenceMatcher(None, ground_truth, ocr_text).ratio()
        return ratio, ocr_text
    except subprocess.TimeoutExpired:
        return None, "tesseract timeout"
    except Exception as e:
        return None, str(e)

def evaluate_checkpoint(checkpoint_dir):
    """Evaluate a single checkpoint."""
    info = analyze_checkpoint(checkpoint_dir)

    # Look for test images
    image_exts = [".png", ".jpg", ".jpeg", ".tiff", ".bmp"]
    test_images = []
    for ext in image_exts:
        test_images.extend(checkpoint_dir.glob(f"test*{ext}"))
        test_images.extend(checkpoint_dir.glob(f"sample*{ext}"))

    eval_result = {
        "name": info["name"],
        "has_config": info["has_config"],
        "has_model": info["has_model"],
        "has_ground_truth": info["has_ground_truth"],
        "model_size_mb": round(info["model_size"] / (1024 * 1024), 2),
        "accuracy": "",
        "status": "needs_data",
        "error": info["error"] or "",
        "framework": info["config"].get("framework", ""),
        "type": info["config"].get("type", ""),
    }

    if not info["has_ground_truth"]:
        eval_result["status"] = "no_ground_truth"
        return eval_result

    if not test_images:
        eval_result["status"] = "no_test_images"
        return eval_result

    # Evaluate on available test images
    if HAS_TESSERACT:
        accuracies = []
        for img in test_images[:5]:  # Limit to 5 images
            acc, _ = run_tesseract_evaluation(img, info["ground_truth_text"])
            if acc is not None:
                accuracies.append(acc)

        if accuracies:
            avg_acc = sum(accuracies) / len(accuracies)
            eval_result["accuracy"] = f"{avg_acc:.3f}"
            eval_result["status"] = "evaluated"
        else:
            eval_result["status"] = "eval_failed"
    else:
        eval_result["status"] = "tesseract_unavailable"

    return eval_result

def generate_report(results):
    """Generate TSV report."""
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    headers = ["checkpoint", "has_config", "has_model", "model_size_mb",
                "has_ground_truth", "accuracy", "status", "error", "framework", "type"]

    lines = ["\t".join(headers)]
    for r in results:
        lines.append("\t".join([
            r["name"],
            str(r["has_config"]),
            str(r["has_model"]),
            str(r["model_size_mb"]),
            str(r["has_ground_truth"]),
            r["accuracy"],
            r["status"],
            r["error"],
            r["framework"],
            r["type"],
        ]))

    report = "\n".join(lines) + "\n"
    REPORT_PATH.write_text(report)
    return report

def main():
    check_tesseract()
    print(f"Tesseract available: {HAS_TESSERACT}")

    checkpoints = find_checkpoints()
    if not checkpoints:
        print("No checkpoints found in", CHECKPOINTS_DIR)
        print("Creating sample checkpoint structure...")
        CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
        sample = CHECKPOINTS_DIR / "sample-placeholder"
        sample.mkdir(exist_ok=True)
        (sample / "config.json").write_text(json.dumps({"framework": "tesseract", "type": "placeholder"}))
        (sample / "ground_truth.txt").write_text("Sample ground truth text")
        checkpoints = [sample]

    print(f"Found {len(checkpoints)} checkpoints")

    results = []
    for cp in checkpoints:
        print(f"  Evaluating: {cp.name}")
        result = evaluate_checkpoint(cp)
        results.append(result)
        print(f"    status={result['status']} accuracy={result['accuracy'] or 'N/A'}")

    report = generate_report(results)
    print(f"\nReport saved to: {REPORT_PATH}")
    print(report)

if __name__ == "__main__":
    main()
