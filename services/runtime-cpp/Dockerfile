FROM ubuntu:24.04 AS build
RUN apt-get update && apt-get install -y build-essential cmake && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN cmake -S . -B build && cmake --build build --config Release

FROM ubuntu:24.04
WORKDIR /app
COPY --from=build /app/build/runtime-cpp /app/runtime-cpp
EXPOSE 8300
CMD ["/app/runtime-cpp"]
