PYTHON ?= python3
MODE ?= mock

.PHONY: help install build-rust smoke

help:
	@echo "Targets:"
	@echo "  install     - pip install editable project dependencies"
	@echo "  build-rust  - build PyO3 extension (high_perf) with maturin"
	@echo "  smoke       - run mock smoke test (no external data/keys)"

install:
	$(PYTHON) -m pip install -e .

build-rust:
	cd high_perf && maturin develop --release

smoke:
	cd scripts && MODE=$(MODE) $(PYTHON) smoke_mock_cycle.py
