from pathlib import Path

import torch
import torchvision.transforms as T
from PIL import Image

from .models.clip_models import CLIPModel


BASE = Path(__file__).parent
WEIGHTS = BASE / "pretrained_weights" / "fc_weights.pth"
IMAGE = BASE / "sample_image_real.jpg"
IMAGE_2 = BASE / "sample_image_deepfake.jpg"

model = CLIPModel("ViT-L/14")
model.fc.load_state_dict(torch.load(WEIGHTS, map_location="cpu"))
model.eval()

img = Image.open(IMAGE).convert("RGB")
img_2 = Image.open(IMAGE_2).convert("RGB")

transform = T.Compose([
    T.CenterCrop(224),
    T.ToTensor(),
    T.Normalize(
        [0.48145454, 0.4578275, 0.40821073],
        [0.26862954, 0.26130258, 0.27577711],
    ),
])

x = transform(img).unsqueeze(0)
x_2 = transform(img_2).unsqueeze(0)

with torch.no_grad():
    logit = model(x)
    logit_2 = model(x_2)

    score = torch.sigmoid(logit).item()
    score_2 = torch.sigmoid(logit_2).item()

    logit = logit.item()
    logit_2 = logit_2.item()

print("Score for real image: ", score)
print(f"Logit: {logit}")
print("Score for deepfake image: ", score_2)        
print(f"Logit: {logit_2}")