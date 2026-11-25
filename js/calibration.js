import webgazer from "webgazer";
/* ==============================
   キャリブレーション設定
============================== */

// 学習ポイント（画面上の9か所）
const CALIBRATION_POINTS = [
    { x: 10, y: 10 },
    { x: 50, y: 10 },
    { x: 90, y: 10 },
    { x: 10, y: 50 },
    { x: 50, y: 50 },
    { x: 90, y: 50 },
    { x: 10, y: 90 },
    { x: 50, y: 90 },
    { x: 90, y: 90 }
];

// 学習ポイントと重複しない検証ポイント
const VALIDATION_POINTS = [
    { x: 25, y: 25 },
    { x: 50, y: 25 },
    { x: 75, y: 25 },
    { x: 25, y: 50 },
    { x: 75, y: 50 },
    { x: 25, y: 75 },
    { x: 50, y: 75 },
    { x: 75, y: 75 },
    { x: 50, y: 35 }
];

// 各ポイントのクリック回数
const CLICKS_PER_POINT = 3;

// 一致率の合格基準（%）
const REQUIRED_RATE = 50;

// 1ポイントあたりの最低取得件数
const MIN_SAMPLES_PER_POINT = 5;

// 検証ポイントの計測時間
const VALIDATION_DURATION = 2000;

// 現在の進行状況
let currentPointIndex = 0;
let currentClickCount = 0;

// 検証結果
let validationResults = [];


/* ==============================
   画面座標取得
============================== */

function getScreenPosition(point) {

    return {
        x: window.innerWidth * point.x / 100,
        y: window.innerHeight * point.y / 100
    };
}


/* ==============================
   ポイント作成
============================== */

function createPoint(point, color) {

    const dot = document.createElement("button");

    dot.type = "button";

    dot.style.position = "fixed";
    dot.style.left = point.x + "%";
    dot.style.top = point.y + "%";

    dot.style.transform = "translate(-50%, -50%)";

    dot.style.width = "24px";
    dot.style.height = "24px";

    dot.style.padding = "0";
    dot.style.margin = "0";
    dot.style.boxSizing = "border-box";

    dot.style.borderRadius = "50%";
    dot.style.border = "2px solid white";

    dot.style.backgroundColor = color;

    dot.style.cursor = "pointer";
    dot.style.zIndex = "1000";

    return dot;
}


/* ==============================
   キャリブレーション開始
============================== */

function startCalibration() {

    currentPointIndex = 0;
    currentClickCount = 0;
    validationResults = [];

    // 前回の補正値を初期化
    window.gazeCorrection = {
        x: 0,
        y: 0
    };

    const area = document.getElementById("calibrationArea");

    area.innerHTML = "";
    area.style.display = "block";

    document.getElementById("status").textContent =
        "キャリブレーション中";

    const instruction = document.createElement("p");

    instruction.id = "calibrationInstruction";

    instruction.style.position = "fixed";
    instruction.style.top = "10px";
    instruction.style.left = "50%";
    instruction.style.transform = "translateX(-50%)";

    instruction.style.zIndex = "1001";

    instruction.style.background = "white";
    instruction.style.padding = "10px";

    area.appendChild(instruction);

    CALIBRATION_POINTS.forEach((point, index) => {

        const dot = createPoint(point, "red");

        dot.dataset.index = index;
        dot.style.display = "none";

        dot.addEventListener("click", function(event) {

            // WebGazerのwindowクリックリスナーへの
            // イベント伝播を防ぐ
            event.stopPropagation();

            if (index !== currentPointIndex) {
                return;
            }

            // ポイントの画面上の中心座標を取得
            const rect = dot.getBoundingClientRect();

            const targetX = rect.left + rect.width / 2;
            const targetY = rect.top + rect.height / 2;

            // 赤色ポイントのクリック学習を維持
            webgazer.recordScreenPosition(
                targetX,
                targetY,
                "click"
            );

            currentClickCount++;

            instruction.textContent =
                "学習中：" +
                (currentPointIndex + 1) +
                "/9 ポイント " +
                currentClickCount + "/3 回";

            if (currentClickCount >= CLICKS_PER_POINT) {

                dot.style.backgroundColor = "green";
                dot.disabled = true;

                currentPointIndex++;
                currentClickCount = 0;

                if (
                    currentPointIndex >= CALIBRATION_POINTS.length
                ) {

                    startValidation();

                } else {

                    showCurrentPoint();
                }
            }
        });

        area.appendChild(dot);
    });

    showCurrentPoint();
}


/* ==============================
   現在の学習ポイント表示
============================== */

function showCurrentPoint() {

    const dots = document.querySelectorAll(
        "#calibrationArea button[data-index]"
    );

    dots.forEach((dot, index) => {

        dot.style.display =
            index === currentPointIndex ? "block" : "none";
    });

    document.getElementById(
        "calibrationInstruction"
    ).textContent =
        "赤い点を見ながら3回クリックしてください。";
}


/* ==============================
   精度検証開始
============================== */

async function startValidation() {

    const area = document.getElementById("calibrationArea");

    area.innerHTML = "";

    const instruction = document.createElement("p");

    instruction.style.position = "fixed";
    instruction.style.top = "10px";
    instruction.style.left = "50%";
    instruction.style.transform = "translateX(-50%)";

    instruction.style.background = "white";
    instruction.style.padding = "10px";
    instruction.style.zIndex = "1001";

    area.appendChild(instruction);

    // 検証用の青い点
    const dot = createPoint(
        { x: 50, y: 50 },
        "blue"
    );

    dot.style.pointerEvents = "none";

    area.appendChild(dot);

    for (
        let i = 0;
        i < VALIDATION_POINTS.length;
        i++
    ) {

        const point = VALIDATION_POINTS[i];

        const screenPosition = getScreenPosition(point);

        // 検証ポイントを表示
        dot.style.left = point.x + "%";
        dot.style.top = point.y + "%";

        instruction.textContent =
            "精度検証中：" + (i + 1) + "/9";

        // 検証対象を設定
        setValidationTarget(
            screenPosition.x,
            screenPosition.y
        );

        // 2秒間計測
        await new Promise(resolve => {
            setTimeout(resolve, VALIDATION_DURATION);
        });

        const samples = stopValidationTarget();

        // 最低取得件数を確認
        validationResults.push({
            point: i + 1,
            samples: samples.length,
            valid: 0,
            rate: 0,
            sampleData: samples
        });
    }

    finishValidation();
}


/* ==============================
   精度検証終了
============================== */

function finishValidation() {

    // データ不足の確認
    const hasInsufficientData =
        validationResults.some(
            result =>
                result.samples < MIN_SAMPLES_PER_POINT
        );

    const totalSamples = validationResults.reduce(
        (sum, result) => sum + result.samples,
        0
    );

    if (totalSamples === 0 || hasInsufficientData) {

        window.gazeCorrection = {
            x: 0,
            y: 0
        };

        console.log(
            "視線データ不足：",
            validationResults
        );

        document.getElementById(
            "calibrationArea"
        ).innerHTML = "";

        showValidationFailure(
            "視線データが不足しています。カメラ位置を調整して再試行してください。"
        );

        return;
    }

    /*
       各ポイントを評価するときは、
       評価対象以外の8ポイントから補正値を計算する。
    */

    validationResults.forEach((result, index) => {

        const correction = calculateGazeCorrection(
            validationResults.map(item => ({
                samples: item.sampleData
            })),
            index
        );

        let validCount = 0;

        result.sampleData.forEach(sample => {

            const correctedX =
                sample.x + correction.x;

            const correctedY =
                sample.y + correction.y;

            const dx =
                correctedX - sample.targetX;

            const dy =
                correctedY - sample.targetY;

            const distance = Math.sqrt(
                dx * dx + dy * dy
            );

            if (distance <= VALIDATION_TOLERANCE) {
                validCount++;
            }
        });

        result.valid = validCount;

        result.rate =
            validCount / result.samples * 100;
    });

    const validSamples = validationResults.reduce(
        (sum, result) => sum + result.valid,
        0
    );

    const accuracy =
        validSamples / totalSamples * 100;

    console.log("========== 精度検証結果 ==========");

    console.log(
        "各ポイントの検証結果：",
        validationResults
    );

    console.log("総取得件数：", totalSamples);

    console.log("許容誤差以内：", validSamples);

    console.log(
        "一致率：" + accuracy.toFixed(2) + "%"
    );

    document.getElementById(
        "calibrationArea"
    ).innerHTML = "";

    // 合格判定
    if (accuracy >= REQUIRED_RATE) {

        // 全9ポイントから本番用補正値を算出
        window.gazeCorrection =
            calculateGazeCorrection(
                validationResults.map(result => ({
                    samples: result.sampleData
                }))
            );

        console.log(
            "本番用視線補正値：",
            window.gazeCorrection
        );

        document.getElementById("status").textContent =
            "精度検証成功（一致率：" +
            accuracy.toFixed(2) + "%）";

        document.getElementById(
            "calibrationArea"
        ).style.display = "none";

        // 精度検証成功後に本番計測開始
        setTimeout(function() {

            startRecording();

        }, 1500);

    } else {

        // 不合格の場合は補正値を適用しない
        window.gazeCorrection = {
            x: 0,
            y: 0
        };

        showValidationFailure(
            "一致率が50%未満です。今回の一致率：" +
            accuracy.toFixed(2) + "%"
        );
    }
}


/* ==============================
   不合格時の処理
============================== */

function showValidationFailure(message) {

    const area = document.getElementById("calibrationArea");

    area.style.display = "block";
    area.innerHTML = "";

    const text = document.createElement("p");

    text.textContent = message;

    const retryButton = document.createElement("button");

    retryButton.textContent = "再キャリブレーション";

    retryButton.addEventListener("click", function() {

        startCalibration();
    });

    area.appendChild(text);
    area.appendChild(retryButton);

    document.getElementById("status").textContent =
        "精度検証不合格";
}


/* ==============================
   実験開始ボタン
============================== */

document.getElementById("startButton").addEventListener(
    "click",
    async function() {

        const button = this;

        button.disabled = true;

        const success = await startWebGazer();

        if (success) {

            button.style.display = "none";

            startCalibration();

        } else {

            button.disabled = false;
        }
    }
);
