# Convenience targets for the vigil-client Python helper.
#
# We don't carry these into the top-level Makefile because the Python
# client is decoupled from the Go proxy build — it ships separately
# (eventually to PyPI as vigil-client).

.PHONY: test install dev

test:
	python3 -m pytest tests/ -v

install:
	pip install .

dev:
	pip install -e .[test]
