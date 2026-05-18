PYTHON ?= python3
MODE ?= mock

.PHONY: help install build-rust smoke

help:
	@echo "Targets:"
	@echo "  install     - pip install editable project dependencies"
	@echo "  build-rust  - build PyO3 extension and install it into the repo root"
	@echo "  smoke       - run mock smoke test (no external data/keys)"

install:
	$(PYTHON) -m pip install -e .

build-rust:
	cd high_perf && maturin build --release -i $(PYTHON)
	$(PYTHON) -m pip install --no-deps --upgrade --force-reinstall --target . high_perf/target/wheels/sharpe_rust-*.whl

smoke:
	PYTHONPATH=. MODE=$(MODE) $(PYTHON) scripts/smoke_mock_cycle.py
