"""
local_model.py
================

This module implements a very simple placeholder fake‑image detector.
The intention of the code is to provide a drop‑in interface that
matches what you would use when wrapping a real model such as
`prithivMLmods/deepfake-detector-model-v1` from Hugging Face.  Due to
network restrictions in this environment we cannot install
transformers/torch, so we simulate a model with a deterministic
function based on the brightness of the image.  Images that are
brighter on average will be labelled as ``real`` and darker images as
``fake``.  The scoring is computed as the softmax of two logits.

When using this code in your own environment, you should replace the
``classify`` function implementation with calls to your actual model.

Usage:

    from local_model import FakeDetector

    detector = FakeDetector()
    result = detector.classify("/path/to/image.png")
    print(result)

The ``classify`` method returns a dictionary with keys ``real`` and
``fake`` whose values are probabilities that sum to 1.

"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import numpy as np
from PIL import Image


@dataclass
class FakeDetector:
    """A simple placeholder fake/real image detector.

    This detector computes the average brightness of the input image
    scaled between 0 and 1.  It then uses that value to form logits
    ``[1‑brightness, brightness]`` and applies a softmax to produce
    probabilities.  The label with the higher probability is returned
    as the prediction.

    Note:
        In a real implementation you would load your trained model
        (e.g. using transformers and torch) in the ``__post_init__``
        method and perform inference in ``classify``.  See the
        accompanying ``modal_stub.py`` for an example using
        transformers.
    """

    def __post_init__(self) -> None:
        # Nothing to initialise for this simple model.
        pass

    def classify(self, image_path: str) -> Dict[str, float]:
        """Classify an image as fake or real.

        Args:
            image_path: Path to the image file.

        Returns:
            A mapping from class labels (``fake`` and ``real``) to
            probability scores between 0 and 1.
        """
        # Open image and convert to RGB numpy array
        with Image.open(image_path) as img:
            img_rgb = img.convert("RGB")
            arr = np.asarray(img_rgb) / 255.0  # scale to [0, 1]

        # Compute average brightness
        brightness = float(arr.mean())

        # Create logits: darker images likely fake, brighter images likely real
        logits = np.array([1.0 - brightness, brightness], dtype=np.float64)

        # Apply softmax
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / exp_logits.sum()

        return {"fake": float(probs[0]), "real": float(probs[1])}


def main(image_path: str) -> None:
    """CLI entry point to classify an image.

    Args:
        image_path: Path to the image file to classify.

    This function instantiates the ``FakeDetector`` and prints
    classification probabilities.
    """
    detector = FakeDetector()
    preds = detector.classify(image_path)
    label = max(preds, key=preds.get)
    score = preds[label]
    print(f"Prediction: {label} (confidence: {score:.3f})")
    print(f"Detailed probabilities: {preds}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python local_model.py <image_path>")
        sys.exit(1)
    main(sys.argv[1])