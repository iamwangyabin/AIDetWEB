# Deepfake Detection Web App

This repository demonstrates a minimal end‑to‑end pipeline for
detecting whether an uploaded image is real or fake.  It is
structured in three layers:

1. **Local model** (`local_model.py`): a placeholder fake detector that
   classifies images based on their average brightness.  It provides
   the same interface you would use with a real deepfake detection
   model from Hugging Face.  You can test it locally by running

   ```bash
   python local_model.py path/to/image.png
   ```

2. **Modal backend** (`modal_app.py`): a Modal application that
   exposes a function `detect_image` callable from Python as well as
   an HTTP endpoint (`detect_web`) for non‑Python clients.  The
   function uses `FakeDetector` from `local_model.py`, but you can
   replace the implementation with your own model.  To deploy
   `modal_app.py` to Modal, you need to install the `modal` package
   and authenticate with your account.  Then run

   ```bash
   # Launch a temporary development server (prints a public URL)
   modal serve modal_app.py

   # When satisfied, deploy permanently
   modal deploy modal_app.py
   ```

   When deployed, Modal will print a URL for the `detect_web` endpoint
   that looks like `https://<your‑stub>--detect‑web.modal.run`.  Copy
   this URL and set it as the `MODAL_DETECT_URL` environment variable
   in your Vercel project (see below).

3. **Vercel frontend** (`vercel_app/`): a minimal Next.js web app
   hosted on Vercel.  The app consists of a single page where users
   can upload an image and view the classification result.  An API
   route (`pages/api/detect.js`) proxies requests to the Modal
   endpoint.  To use it:

   * Install dependencies and run locally:

     ```bash
     cd vercel_app
     npm install
     npm run dev
     ```

   * When deploying to Vercel, add an environment variable
     `MODAL_DETECT_URL` with the URL printed by Modal for `detect_web`.
     Vercel will automatically build and deploy the Next.js app.

With these components in place, users can visit your Vercel site,
upload an image, and receive a prediction in a few seconds.

## Integrating a real deepfake detection model

The current implementation uses a toy classifier (`FakeDetector`) that
assigns images to *fake* or *real* based on average brightness.  To
obtain meaningful results, you should replace `FakeDetector` with a
pre‑trained deepfake detection model, such as
[`prithivMLmods/deepfake‑detector‑model‑v1`](https://huggingface.co/prithivMLmods/deepfake-detector-model-v1)
from Hugging Face.  In a typical setup you would:

1. Install required packages in your Modal image:

   ```python
   image = (
       modal.Image.debian_slim()
       .pip_install([
           'torch', 'transformers', 'pillow', 'hf_xet',
       ])
   )
   ```

2. Load the model in `load_detector()` using `SiglipForImageClassification`:

   ```python
   from transformers import AutoImageProcessor, SiglipForImageClassification

   MODEL_NAME = 'prithivMLmods/deepfake-detector-model-v1'

   @stub.function(image=image)
   def load_detector() -> tuple[SiglipForImageClassification, AutoImageProcessor]:
       model = SiglipForImageClassification.from_pretrained(MODEL_NAME)
       processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
       return model, processor
   ```

3. Update `detect_image()` to preprocess the incoming image with the
   processor and perform inference with the model.  Return the softmax
   probabilities for the labels *fake* and *real*.

These changes require internet access when building the Modal image,
but they are fully contained in your deployment.

## Development schedule

The following timeline aligns with the suggested breakdown:

- **Day 1 – Local model validation:** test the placeholder `FakeDetector`
  or integrate a pre‑trained model.  Ensure you can classify an
  image and obtain a label and score.
- **Day 2 – Modal deployment:** write `modal_app.py`, build the Modal
  image with the necessary dependencies, and deploy it.  Confirm
  that `modal serve` exposes a public URL and that calling it with
  curl returns the expected JSON.
- **Day 3 – Simple upload page:** scaffold the Next.js app in
  `vercel_app`, build the upload form, and display results.  Test
  locally by mocking the API response if necessary.
- **Day 4 – Connect front‑end and back‑end:** configure the API route
  (`pages/api/detect.js`) to proxy requests to Modal.  Set the
  `MODAL_DETECT_URL` environment variable.  Test end‑to‑end
  detection.
- **Day 5 – Polish:** improve the user interface, add error handling
  and file size limits, and optionally display the input image and
  probability distribution.

By following this structure you can ship a first version where users
visit your site, upload an image and get a deepfake detection result
within a few seconds.