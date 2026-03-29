"""
modal_app.py
============

This module defines a Modal application that exposes a single endpoint
for fake/real image detection.  The code is structured so that
``FakeDetector`` from ``local_model.py`` can be reused both locally
and when running inside Modal.  When deploying in your own
environment, you should replace the placeholder implementation with a
proper deepfake detection model (see notes in ``local_model.py``).

To deploy this on Modal you need to have the ``modal" Python package
installed and authenticate with the Modal platform.  See
https://modal.com/docs/ for details.

Example usage (locally):

    import base64
    from modal_app import detect_image

    # read an image from disk
    with open("/path/to/image.jpg", "rb") as f:
        data = f.read()
    result = detect_image.remote(data)
    print(result)

The remote function will return a dictionary like
``{"label": "real", "confidence": 0.73, "probabilities": {"fake": 0.27, "real": 0.73}}``.

"""

import io
from typing import Dict

from PIL import Image

import modal

from local_model import FakeDetector

try:
    # Optional import; FastAPI is not used unless we enable the web endpoint.
    import fastapi  # type: ignore  # noqa: F401
except ImportError:
    # FastAPI will be installed in the Modal image; ignore import error locally.
    pass

# Define a Modal stub.  The "image" argument specifies the base
# container image that will be used by Modal.  Here we install the
# dependencies needed for running the real model.  If you are using
# transformers, add them to the ``pip_install`` list.
stub = modal.Stub("deepfake-detector-app")

image = (
    modal.Image.debian_slim()
    .pip_install(
        # These dependencies are enough for the placeholder model.
        # Add 'transformers', 'torch' etc. here if you replace
        # FakeDetector with a real model.
        [
            "pillow",
            "numpy",
        ]
    )
)


@stub.function(image=image)
def load_detector() -> FakeDetector:
    """Load the fake detector model.

    On the first invocation inside Modal this will run in the build
    phase; subsequent calls will reuse the cached object.  Replace
    ``FakeDetector()`` with your actual model loading code.
    """
    return FakeDetector()


@stub.function(image=image)
def detect_image(image_bytes: bytes) -> Dict[str, object]:
    """Modal entry point: classify an uploaded image.

    Args:
        image_bytes: Raw bytes of the image file uploaded by the user.

    Returns:
        A dictionary containing the predicted label, confidence and
        per‑class probabilities.
    """
    detector = load_detector()
    with io.BytesIO(image_bytes) as buf:
        img = Image.open(buf)
        # Save the image to a temporary location because FakeDetector
        # expects a path.  In a real implementation you might modify
        # FakeDetector to accept file‑like objects directly.
        tmp_path = "/tmp/upload.png"
        img.save(tmp_path)
    probs = detector.classify(tmp_path)
    label = max(probs, key=probs.get)
    return {
        "label": label,
        "confidence": probs[label],
        "probabilities": probs,
    }


# Define an HTTP endpoint that accepts image uploads and returns a JSON
# response.  FastAPI is used under the hood when Modal decorates this
# function.
@stub.function(image=image)
@modal.fastapi_endpoint(method="POST")
async def detect_web(file: fastapi.UploadFile) -> Dict[str, object]:
    """Web endpoint for fake detection.

    Clients can POST a multipart/form-data request with a field named
    ``file`` containing the image.  The endpoint returns a JSON
    response with the classification result.  This function runs
    inside the Modal container and is accessible via HTTPS once
    deployed.
    """
    # Read bytes from the uploaded file
    content = await file.read()
    # Reuse the same logic as detect_image
    return detect_image(content)


if __name__ == "__main__":
    # When run locally this will create a temporary Modal app server
    # (if you have modal installed and configured) to test the function.
    import sys
    import pathlib
    if len(sys.argv) != 2:
        print("Usage: python modal_app.py <image_path>")
        sys.exit(1)
    image_path = pathlib.Path(sys.argv[1])
    with image_path.open("rb") as f:
        data = f.read()
    print(detect_image.remote(data))