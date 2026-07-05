# --- build stage ---
FROM rust:1-slim-bookworm AS builder
WORKDIR /app

# Cache dependencies separately from source so a source-only change doesn't
# recompile the whole dependency tree.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release \
    && rm -rf src

COPY src ./src
# Touch main.rs so cargo doesn't skip the real build using the dummy's cache.
RUN touch src/main.rs && cargo build --release

# --- runtime stage ---
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/leetfut-backend ./leetfut-backend

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["./leetfut-backend"]
