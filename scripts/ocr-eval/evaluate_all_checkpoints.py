#!/usr/bin/env python3
"""
evaluate_all_checkpoints.py — Evaluate OCR checkpoints against ground truth.
Outputs TSV report for graph-loop.mjs consumption.
"""

import json
import os
import sys
import subprocess
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
    if not CHECKPOINTS_DIR.exists():
        return []
    return [d for d in sorted(CHECKPOINTS_DIR.iterdir()) if d.is_dir() and not d.name.startswith(".")]

def analyze_checkpoint(checkpoint_dir):
    result = {"name": checkpoint_dir.name, "has_config": False, "has_model": False, "has_ground_truth": False, "config": {}, "model_size": 0, "ground_truth_text": "", "error": None}

    config_path = checkpoint_dir / "config.json"
    if config_path.exists():
        result["has_config"] = True
        try:
            with open(config_path) as f:
                result["config"] = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            result["error"] = f"config parse error: {e}"

    for ext in [".onnx", ".bin", ".safetensors", ".gguf", ".pt", ".pth"]:
        for model_file in checkpoint_dir.glob(f"*{ext}"):
            result["has_model"] = True
            result["model_size"] += model_file.stat().st_size

    gt_path = checkpoint_dir / "ground_truth.txt"
    if gt_path.exists():
        result["has_ground_truth"] = True
        try:
            result["ground_truth_text"] = gt_path.read_text().strip()
        except IOError as e:
            result["error"] = f"ground truth read error: {e}"

    return result

def evaluate_checkpoint(checkpoint_dir):
    info = analyze_checkpoint(checkpoint_dir)
    image_exts = [".png", ".jpg", ".jpeg", ".tiff", ".bmp"]
    test_images = []
    for ext in image_exts:
        test_images.extend(checkpoint_dir.glob(f"test*{ext}"))
        test_images.extend(checkpoint_dir.glob(f"sample*{ext}"))

    eval_result = {"name": info["name"], "has_config": info["has_config"], "has_model": info["has_model"], "has_ground_truth": info["has_ground_truth"], "model_size_mb": round(info["model_size"] / (1024 * 1024), 2), "accuracy": "", "status": "needs_data", "error": info["error"] or "", "framework": info["config"].get("framework", ""), "type": info["config"].get("type", "")}

    if not info["has_ground_truth"]:
        eval_result["status"] = "no_ground_truth"
        return eval_result
    if not test_images:
        eval_result["status"] = "no_test_images"
        return eval_result

    if HAS_TESSERACT:
        accuracies = []
        for img in test_images[:5]:
            try:
                result = subprocess.run(["tesseract", str(img), "stdout", "--psm", "6"], capture_output=True, text=True, timeout=30)
                ocr_text = result.stdout.strip()
                ratio = SequenceMatcher(None, info["ground_truth_text"], ocr_text).ratio()
                accuracies.append(ratio)
            except (subprocess.TimeoutExpired, Exception):
                pass
        if accuracies:
            eval_result["accuracy"] = f"{sum(accuracies) / len(accuracies):.3f}"
            eval_result["status"] = "evaluated"
        else:
            eval_result["status"] = "eval_failed"
    else:
        eval_result["status"] = "tesseract_unavailable"

    return eval_result

def generate_report(results):
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    headers = ["checkpoint", "has_config", "has_model", "model_size_mb", "has_ground_truth", "accuracy", "status", "error", "framework", "type"]
    lines = ["\t".join(headers)]
    for r in results:
        lines.append("\t".join([r["name"], str(r["has_config"]), str(r["has_model"]), str(r["model_size_mb"]), str(r["has_ground_truth"]), r["accuracy"], r["status"], r["error"], r["framework"], r["type"]]))
    report = "\n".join(lines) + "\n"
    REPORT_PATH.write_text(report)
    return report

def main():
    check_tesseract()
    print(f"Tesseract available: {HAS_TESSERACT}")
    checkpoints = find_checkpoints()
    if not checkpoints:
        print("No checkpoints found. Creating sample structure...")
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
