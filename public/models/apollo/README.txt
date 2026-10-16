Apollo — нейро-реставрация музыки после MP3/AAC для «Улучшения аудио» (vetor-studio.ru/tools/audio-enhancer)

Модель: Apollo: Band-sequence Modeling for High-Quality Audio Restoration (Kai Li, Yi Luo).
Веса: https://huggingface.co/JusperLee/Apollo (pytorch_model.bin), лицензия CC BY-SA 4.0.
Этот файл — производная работа под той же лицензией CC BY-SA 4.0
(https://creativecommons.org/licenses/by-sa/4.0/): официальные веса без изменений,
экспорт в ONNX (opset 17) с STFT/iSTFT, выраженными свёртками с фиксированными ядрами,
и перевод весов в float16 (входы/выходы float32).

apollo-44k-fp16.onnx   вход audio [каналы, отсчёты] float32 44.1 кГц, выход restored той же формы.
Проверка: обёртка vs оригинальная PyTorch-модель — отн. ошибка 1.3e-6 (fp32);
fp16 vs fp32 — SNR 60.5 дБ. На официальном примере после кодека спектральное
расстояние выше 4 кГц до оригинала: 60.2 -> 10.6.
