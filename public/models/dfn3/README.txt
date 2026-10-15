DeepFilterNet3 — нейро-шумоподавление для «Улучшения аудио» (vetor-studio.ru/tools/audio-enhancer)

df_bg.wasm                  libDF из https://github.com/Rikorose/DeepFilterNet @ d375b2d8309e0935d165700c91da9de862a99c31
                            сборка: wasm-pack build --target web --release --no-default-features --features wasm,
                            RUSTFLAGS="-C target-feature=+simd128"; патчи — фича wasm без default-model, добавлена df_free.
                            sha256 810622789eacc059b03ef8b3462180c0cb3fc49f80a17854ed7931c51e8bbd40
dfn3-model.tar.gz.bin       официальные веса (DeepFilterNet3_onnx.tar.gz, переименован в .bin,
                            чтобы серверы не отдавали его с Content-Encoding: gzip) из того же репозитория (models/), без изменений
                            sha256 c94d91f70911001c946e0fabb4aa9adc37045f45a03b56008cb0c8244cb63616
Лицензия: MIT OR Apache-2.0 (LICENSE-MIT, LICENSE-APACHE), © Hendrik Schröter.
