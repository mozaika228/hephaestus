# Runtime C++ Service

Minimal high-performance tool runtime prototype.

## Endpoints
- `GET /health`
- `POST /exec/safe` with JSON body `{ "expression": "(2+2)*5" }`

## Build
```bash
cmake -S . -B build
cmake --build build
./build/runtime-cpp
```
