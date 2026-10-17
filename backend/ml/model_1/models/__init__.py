from .clip_models import CLIPModel


VALID_NAMES = [
    'CLIP:ViT-L/14',
]


def get_model(name):
    assert name in VALID_NAMES

    if name.startswith("CLIP:"):
        return CLIPModel(name[5:])

    assert False