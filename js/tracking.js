import webgazer from "webgazer";
/* ==============================
   視線取得・領域判定管理
============================== */

// 視線データ
var gazeDataList = [];

var startTime = 0;
var isRecording = false;
var lastRecordTime = 0;
var totalBytes = 0;

var recordingTimer = null;
var webgazerStarted = false;

// 計測設定
const RECORDING_DURATION = 10000;
const SAMPLE_INTERVAL = 100;

// 画像の基準サイズ
const IMAGE_WIDTH = 393;
const IMAGE_HEIGHT = 310;

// 領域名
const REGION_NAMES = [
    "付け合わせ",
    "ハンバーグ",
    "皿",
    "背景"
];

// 領域の輪郭座標
const REGION_POLYGONS = {

    // トマト・パセリ
    "付け合わせ": [
        [107, 72],
        [179, 70],
        [213, 77],
        [225, 99],
        [208, 117],
        [176, 126],
        [144, 116],
        [112, 105]
    ],

    // ハンバーグ本体
    "ハンバーグ": [
        [253, 113],
        [286, 117],
        [310, 136],
        [309, 158],
        [303, 193],
        [280, 211],
        [239, 232],
        [194, 243],
        [152, 230],
        [111, 218],
        [94, 194],
        [95, 172],
        [108, 148],
        [130, 132],
        [162, 119],
        [202, 121],
        [230, 124]
    ],

    // 皿の外周
    "皿": [
        [18, 169],
        [28, 136],
        [55, 119],
        [90, 107],
        [137, 97],
        [194, 92],
        [250, 96],
        [291, 108],
        [332, 126],
        [365, 151],
        [385, 177],
        [383, 198],
        [363, 232],
        [326, 252],
        [280, 270],
        [220, 290],
        [165, 285],
        [103, 269],
        [60, 249],
        [29, 216]
    ]
};

// 領域別集計
var regionResults = {};
var previousRegion = null;


/* ==============================
   領域別集計の初期化
============================== */

function initializeRegionResults() {

    regionResults = {};

    REGION_NAMES.forEach(function(region) {

        regionResults[region] = {
            samples: 0,
            visits: 0,
            dwellTime: 0
        };
    });

    previousRegion = null;

    updateRegionTable();
}


/* ==============================
   領域別データの画面表示
============================== */

function updateRegionTable() {

    REGION_NAMES.forEach(function(region, index) {

        var result = regionResults[region];

        if (!result) {
            return;
        }

        document.getElementById(
            "samples" + index
        ).textContent = result.samples;

        document.getElementById(
            "visits" + index
        ).textContent = result.visits;

        document.getElementById(
            "time" + index
        ).textContent =
            (result.dwellTime / 1000).toFixed(1);
    });
}


/* ==============================
   多角形の内外判定
============================== */

function isInsidePolygon(x, y, polygon) {

    let inside = false;

    for (
        let i = 0, j = polygon.length - 1;
        i < polygon.length;
        j = i++
    ) {

        const xi = polygon[i][0];
        const yi = polygon[i][1];

        const xj = polygon[j][0];
        const yj = polygon[j][1];

        const intersect =
            ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}


/* ==============================
   視線座標から領域を判定
============================== */

function getGazeRegion(x, y) {

    const image = document.getElementById("steakImage");

    if (
        !image ||
        !image.complete ||
        image.naturalWidth === 0
    ) {
        return null;
    }

    const rect = image.getBoundingClientRect();

    // 画像表示範囲外
    if (
        x < rect.left ||
        x > rect.right ||
        y < rect.top ||
        y > rect.bottom
    ) {
        return null;
    }

    // 画面座標を画像基準座標に変換
    const imageX =
        (x - rect.left) / rect.width * IMAGE_WIDTH;

    const imageY =
        (y - rect.top) / rect.height * IMAGE_HEIGHT;

    // 内側の領域を優先して判定
    const priorityRegions = [
        "付け合わせ",
        "ハンバーグ",
        "皿"
    ];

    for (const regionName of priorityRegions) {

        if (
            isInsidePolygon(
                imageX,
                imageY,
                REGION_POLYGONS[regionName]
            )
        ) {
            return regionName;
        }
    }

    // 画像内で他の領域に該当しない部分は背景
    return "背景";
}


/* ==============================
   精度検証設定
============================== */

window.validationMode = false;
window.validationTarget = null;
window.validationSamples = [];

// 誤差範囲
const VALIDATION_TOLERANCE = 100;
const VALIDATION_IGNORE_TIME = 500;

// 視線座標の補正値
window.gazeCorrection = {
    x: 0,
    y: 0
};


/* ==============================
   中央値の計算
============================== */

function getMedian(values) {

    if (!values || values.length === 0) {
        return 0;
    }

    const sorted = [...values].sort(
        (a, b) => a - b
    );

    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {

        return (
            sorted[middle - 1] +
            sorted[middle]
        ) / 2;
    }

    return sorted[middle];
}


/* ==============================
   青色ポイントの視線情報から
   補正量を計算
============================== */

function calculateGazeCorrection(
    results,
    excludedIndex = -1
) {

    const xOffsets = [];
    const yOffsets = [];

    results.forEach(function(result, index) {

        // 評価対象のポイント自身は除外
        if (index === excludedIndex) {
            return;
        }

        if (
            !result.samples ||
            result.samples.length === 0
        ) {
            return;
        }

        const pointX = [];
        const pointY = [];

        result.samples.forEach(function(sample) {

            // 目標座標と視線座標の差
            pointX.push(
                sample.targetX - sample.x
            );

            pointY.push(
                sample.targetY - sample.y
            );
        });

        // ポイントごとの中央値を取得
        if (pointX.length > 0) {

            xOffsets.push(
                getMedian(pointX)
            );

            yOffsets.push(
                getMedian(pointY)
            );
        }
    });

    return {
        x: getMedian(xOffsets),
        y: getMedian(yOffsets)
    };
}


/* ==============================
   WebGazerの視線取得
============================== */

webgazer.setGazeListener(function(data, elapsedTime) {

    if (data == null) {
        return;
    }

    const currentTime = performance.now();

    // 精度検証中
    if (
        window.validationMode &&
        window.validationTarget
    ) {

        const validationElapsed =
            currentTime - window.validationStartedAt;

        if (validationElapsed >= VALIDATION_IGNORE_TIME) {

            // 補正前の視線座標を保存
            window.validationSamples.push({
                x: data.x,
                y: data.y,
                targetX: window.validationTarget.x,
                targetY: window.validationTarget.y
            });
        }

        return;
    }

    // 本番計測中以外は取得しない
    if (!isRecording) {
        return;
    }

    const elapsed = currentTime - startTime;

    if (elapsed >= RECORDING_DURATION) {
        return;
    }

    // 補正値を適用
    const correctedX =
        data.x + window.gazeCorrection.x;

    const correctedY =
        data.y + window.gazeCorrection.y;

    // 補正後の座標で領域判定
    const region = getGazeRegion(
        correctedX,
        correctedY
    );

    // リアルタイム表示
    document.getElementById("currentRegion").textContent =
        "現在の視線領域：" + (region || "領域外");

    // 100ミリ秒間隔で記録
    if (
        currentTime - lastRecordTime >= SAMPLE_INTERVAL
    ) {

        // 補正後の視線データを記録
        const gazeRecord = {
            x: correctedX,
            y: correctedY,
            elapsedTime: Math.round(elapsed),
            region: region
        };

        gazeDataList.push(gazeRecord);

        // 領域別集計
        if (region !== null) {

            // 取得回数
            regionResults[region].samples++;

            // 訪問回数
            if (previousRegion !== region) {
                regionResults[region].visits++;
            }

            // 滞在時間（100ミリ秒単位の推定値）
            regionResults[region].dwellTime += SAMPLE_INTERVAL;

            previousRegion = region;

        } else {

            // 領域外に出た場合は訪問判定をリセット
            previousRegion = null;
        }

        lastRecordTime = currentTime;

        // 画面表示
        document.getElementById("coordinates").textContent =
            "視線座標：X=" + correctedX.toFixed(2) +
            " / Y=" + correctedY.toFixed(2);

        document.getElementById("count").textContent =
            "取得件数：" + gazeDataList.length + "件";

        // 領域別集計を表に反映
        updateRegionTable();

        // Consoleに取得結果を出力
        console.log(
            "補正後視線座標:",
            correctedX,
            correctedY,
            "判定領域:",
            region
        );
    }
});


/* ==============================
   WebGazer起動
============================== */

async function startWebGazer() {

    try {

        document.getElementById("status").textContent =
            "カメラ起動中...";

        webgazer.saveDataAcrossSessions(false);

        await webgazer.begin();

        webgazerStarted = true;

        document.getElementById("status").textContent =
            "カメラ起動完了";

        return true;

    } catch (error) {

        document.getElementById("status").textContent =
            "WebGazerの起動に失敗しました";

        console.error(error);

        return false;
    }
}


/* ==============================
   精度検証用
============================== */

function setValidationTarget(x, y) {

    window.validationTarget = {
        x: x,
        y: y
    };

    window.validationSamples = [];

    window.validationStartedAt = performance.now();

    window.validationMode = true;
}


function stopValidationTarget() {

    window.validationMode = false;

    window.validationTarget = null;

    return window.validationSamples;
}


/* ==============================
   本番計測開始
============================== */

function startRecording() {

    if (!webgazerStarted) {
        console.error("WebGazerが起動していません");
        return;
    }

    // データ初期化
    gazeDataList = [];

    initializeRegionResults();

    totalBytes = 0;

    startTime = performance.now();
    lastRecordTime = startTime;

    isRecording = true;

    document.getElementById("count").textContent =
        "取得件数：0件";

    document.getElementById("coordinates").textContent =
        "視線座標：未取得";

    document.getElementById("currentRegion").textContent =
        "現在の視線領域：未取得";

    document.getElementById("dataSize").textContent =
        "データ量：0 bytes";

    document.getElementById("status").textContent =
        "視線取得中（100ミリ秒間隔・10秒間）";

    document.getElementById("stopButton").disabled = false;

    document.getElementById("stopButton").style.display =
        "inline-block";

    recordingTimer = setTimeout(function() {

        finishRecording();

    }, RECORDING_DURATION);
}


/* ==============================
   計測終了・データ保存
============================== */

async function finishRecording() {

    if (!isRecording) {
        return;
    }

    isRecording = false;

    clearTimeout(recordingTimer);

    document.getElementById("stopButton").disabled = true;

    try {

        // 視線データをJSON化
        const jsonData = JSON.stringify(gazeDataList);

        // 領域別集計結果をJSON化
        const regionJson = JSON.stringify(regionResults);

        // LocalStorageに保存
        localStorage.setItem("gazeData", jsonData);

        localStorage.setItem("regionResults", regionJson);

        // データ量を計算
        totalBytes = new Blob([
            jsonData,
            regionJson
        ]).size;

        // 保存結果を表示
        document.getElementById("status").textContent =
            "視線取得終了・保存完了";

        document.getElementById("dataSize").textContent =
            "データ量：" + totalBytes + " bytes (" +
            (totalBytes / 1024).toFixed(2) + " KB)";

        // 最終集計を表示
        updateRegionTable();

        console.log("========== 計測結果 ==========");

        console.log(
            "視線取得件数：",
            gazeDataList.length
        );

        console.log(
            "データ量：",
            totalBytes,
            "bytes"
        );

        console.log(
            "視線データ：",
            gazeDataList
        );

        console.log(
            "領域別集計結果：",
            regionResults
        );

        console.log(
            "LocalStorage保存データ：",
            JSON.parse(localStorage.getItem("gazeData"))
        );

    } catch (error) {

        document.getElementById("status").textContent =
            "データ保存に失敗しました";

        console.error("保存エラー：", error);

    } finally {

        if (webgazerStarted) {

            try {

                await webgazer.end();

            } catch (error) {

                console.error(
                    "WebGazer終了エラー：",
                    error
                );
            }

            webgazerStarted = false;
        }

        document.getElementById("currentRegion").textContent =
            "現在の視線領域：計測終了";
    }
}


/* ==============================
   手動で計測終了
============================== */

document.getElementById("stopButton").addEventListener(
    "click",

    function() {

        finishRecording();
    }
);
