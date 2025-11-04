from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import onnxruntime as ort
import pandas as pd


class ONNXModelError(RuntimeError):
    """Error raised when ONNX inference cannot be performed."""


@lru_cache(maxsize=16)
def _load_session(file_path: str) -> ort.InferenceSession:
    """Load an :class:`onnxruntime.InferenceSession` with simple disk caching."""
    resolved = Path(file_path).expanduser().resolve()
    if not resolved.exists():
        msg = f"ONNX model file not found: {resolved}"
        raise ONNXModelError(msg)
    return ort.InferenceSession(resolved.as_posix(), providers=["CPUExecutionProvider"])


def get_onnx_session(file_path: str | None) -> ort.InferenceSession | None:
    """Return a cached ONNX session for the given ``file_path``.

    ``None`` is returned if ``file_path`` is falsy.
    """
    if not file_path:
        return None
    return _load_session(file_path)


def _resolve_feature_matrix(data: pd.DataFrame, feature_columns: Sequence[str] | None) -> np.ndarray:
    """Prepare the numeric feature matrix expected by ONNX models."""
    if feature_columns:
        candidates = [col for col in feature_columns if col in data.columns]
        features = data.loc[:, candidates]
    else:
        features = data.select_dtypes(include=["number"])  # type: ignore[arg-type]

    if features.empty:
        return np.zeros((len(data), 1), dtype=np.float32)

    cleaned = features.replace([np.inf, -np.inf], np.nan).fillna(0.0)
    return cleaned.to_numpy(dtype=np.float32, copy=False)


def score_dataframe(
    session: ort.InferenceSession | None,
    data: pd.DataFrame,
    feature_columns: Sequence[str] | None = None,
    output_index: Iterable[int] | None = None,
) -> pd.Series:
    """Run inference on ``data`` and return a ``pd.Series`` of scores.

    Parameters
    ----------
    session:
        The ONNX runtime session. If ``None``, a zero-valued score series is returned.
    data:
        Candidate securities as a DataFrame.
    feature_columns:
        Optional subset of columns to feed into the model.
    output_index:
        Optional iterable to use as the index of the result series. Defaults to ``data.index``.
    """
    if session is None or data.empty:
        index = list(output_index) if output_index is not None else list(data.index)
        return pd.Series([0.0] * len(index), index=index, dtype=float)

    input_name = session.get_inputs()[0].name
    features = _resolve_feature_matrix(data, feature_columns)
    outputs = session.run(None, {input_name: features})

    if not outputs:
        index = list(output_index) if output_index is not None else list(data.index)
        return pd.Series([0.0] * len(index), index=index, dtype=float)

    predictions = outputs[0]
    if predictions.ndim > 1:
        predictions = predictions[:, 0]

    index = list(output_index) if output_index is not None else list(data.index)
    return pd.Series(predictions.astype(float, copy=False), index=index, dtype=float)
