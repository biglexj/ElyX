# Contributing to ElyX

Thank you for your interest in ElyX! This is an experimental codec project.
Here is how you can help.

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/biglexj/ElyX.git
cd ElyX

# Install Python dependencies
pip install numpy pillow

# Run the test suite
python -m pytest tests/ -v
```

---

## How to Contribute

### Bug Reports
Open a GitHub Issue with:
1. Python version and OS.
2. Minimal command that reproduces the problem.
3. Full error traceback.

### Code Changes
1. Fork the repository and create a feature branch.
2. Keep changes focused — one concern per pull request.
3. Add or update tests in `tests/` for any changed behaviour.
4. Run the test suite before submitting (`python -m pytest tests/ -v`).
5. Open a Pull Request against `main`.

### Codec / Algorithm Proposals
ElyX is research-grade software. Proposals that improve compression or
speed are welcome, but **must** include:
- A reproducible benchmark comparing the proposed change against the
  current implementation at equivalent PSNR/SSIM points.
- No silent resolution changes, colour shifts, or pixel-value alterations
  in lossless mode (step=1 must remain bit-exact).

---

## Code Style

- Python: follow PEP 8. Use `int32` / `int16` dtypes explicitly (no silent
  float promotion in the transform pipeline).
- TypeScript/React (Studio): standard TSX conventions.

---

## License

By contributing, you agree that your contributions will be licensed under
the project's [MIT License](LICENSE).
