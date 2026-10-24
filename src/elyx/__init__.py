"""ElyX — Experimental standalone wavelet image codec.

Public API
----------
from elyx import encode, decode

encode(input_path, output_path, step=1, tile=512)
decode(input_path) -> (PIL.Image, dict)
"""

from elyx.codec import encode, decode

__all__ = ["encode", "decode"]
__version__ = "0.1.0"
__author__ = "biglexj"
