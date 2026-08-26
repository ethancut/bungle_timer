const wsUri = "ws://localhost:8080/ws/settings";

const settingsElements = [
    document.getElementById('bits'),
    document.getElementById('subs'),
    document.getElementById('subs2'),
    document.getElementById('subs3'),
    document.getElementById('donations')
];
const values = { bits: 0, subs: 0, subs2: 0, subs3: 0, donations: 0 };
const keys = ['bits', 'subs', 'subs2', 'subs3', 'donations'];
const statusElement = document.getElementById('submit-status');
const timeEntryElement = document.getElementById('time-box');
const pauseElement = document.getElementById('pause-timer');
const addTypeElement = document.getElementById('add-type');
const startdurationElement = document.getElementById('start-duration')
const seTokenElement = document.getElementById('se-token');
let streamElementsToken = "";

let websocket = null;
let reconnectDelay = 1000;
let startDuration = ""
const MAX_RECONNECT_DELAY = 5000;
function isNumeric(str) {
    if (typeof str != "string") return false;
    return !isNaN(str) && !isNaN(parseFloat(str));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));



function updateConfig(msg) {
    values.bits = msg.bits;
    values.subs = msg.subs;
    values.subs2 = msg.subs2;
    values.subs3 = msg.subs3;
    values.donations = msg.donations;
    settingsElements[0].value = msg.bits;
    settingsElements[1].value = msg.subs;
    settingsElements[2].value = msg.subs2;
    settingsElements[3].value = msg.subs3;
    settingsElements[4].value = msg.donations;
    seTokenElement.value = msg.streamElementsToken
    streamElementsToken = msg.streamElementsToken
    validateElements();
}

function updateStartDurationVisibility() {
    const selected = document.querySelector('input[name="overlay-format"]:checked');
    console.log("selected value:", JSON.stringify(selected?.value));
    const startDurationWrap = document.getElementById('start-duration-wrap');
    if (!selected || !startDurationWrap) return;

    if (selected.value === 'dur') {
        startDurationWrap.style.display = 'none';
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: 'overlay2' }));
        }

    } else {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: 'overlay1', reason: startDuration }));
        }
        startDurationWrap.style.display = 'inline-block';
    }
}
function initTimer() {

    connect();

    document.querySelectorAll('input[name="overlay-format"]').forEach((radio) => {
        radio.addEventListener('change', updateStartDurationVisibility)
    });
    updateStartDurationVisibility();
    startdurationElement.addEventListener('input', (event) => {
        startDuration = event.target.value ?? "";
        console.log("set start dur to", startDuration);

        // also push it live if this format is currently selected
        const selected = document.querySelector('input[name="overlay-format"]:checked');

        if (selected && websocket && websocket.readyState === WebSocket.OPEN) {
            if (selected.value === 'dur') {
                websocket.send(JSON.stringify({ type: 'overlay2', reason: startDuration }));
            } else if (selected.value === 'start_plus_dur') {
                websocket.send(JSON.stringify({ type: 'overlay1', reason: startDuration }));
            }
        }
    });

    document.getElementById('add-time').addEventListener("click", (event) => {
        const value = parseFloat(timeEntryElement.value, 10)
        const addType = addTypeElement.value;
        if (!websocket || websocket.readyState !== WebSocket.OPEN || isNaN(value)) {
            return;
        }
        let seconds;
        switch (addType) {
            case "seconds":
                seconds = value;
                break;
            case "minutes":
                seconds = value * 60;
                break;
            case "bits":
                seconds = value * values['bits'];
                break;
            case "subs":
                seconds = value * values['subs'];
                break;
            case 'donations':
                seconds = value * values['donations'];
                break
        }
        websocket.send(JSON.stringify({ type: "add", seconds: Math.round(seconds) }));
    });
    pauseElement.addEventListener("click", (event) => {
        websocket.send(JSON.stringify({ type: 'pause' }))
    })
    settingsElements.forEach((element, index) => {
        element.addEventListener('input', (event) => {
            console.log(event.target.value)
            values[keys[index]] = parseFloat(event.target.value);
            validateElements();
        });
    });

    seTokenElement.addEventListener('input', (event) => {
        streamElementsToken = event.target.value;
    })
    document.getElementById('submit-config').addEventListener('click', (event) => {
        pushConfig();
    })

    validateElements();
}
function pushConfig() {
    if (websocket.readyState == WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'config', ...values, streamElementsToken }))
    } else {
        statusNotify({ reason: "Failed to Save Config: Backend Offline" })
    }
}

async function statusNotify(msg) {
    if (msg.reason == 'true') {
        statusElement.style.color = "green"
        statusElement.textContent = "Saved Successfully"
        await sleep(2000);
        if (statusElement.textContent === "Saved Successfully") {
            statusElement.textContent = ""
        }
    } else {
        statusElement.style.color = "red"
        statusElement.textContent = msg.reason
        await sleep(5000);
        if (statusElement.textContent === msg.reason) {
            statusElement.textContent = ""
        }

    }
}


function connect() {
    websocket = new WebSocket(wsUri);
    const statusEl = document.getElementById('status');
    websocket.addEventListener('open', (event) => {
        console.log("Connected to WebSocket server");
        reconnectDelay = 1000;
        document.getElementById('status').textContent = "Connected";
    });
    websocket.addEventListener('message', (event) => {
        let msg;
        try { msg = JSON.parse(event.data); }
        catch (err) {
            console.error("Bad WS message:", event.data, err);
            return;
        }

        if (msg.type == "config") {
            updateConfig(msg)
        } else if (msg.type == "status") {
            statusNotify(msg)
        } else if (msg.type == "togglePause") {
            if (msg.paused == true) {
                pauseElement.textContent = "Unpause Timer"
            } else {
                pauseElement.textContent = "Pause Timer"
            }
        }
    });
    websocket.addEventListener('close', (event) => {
        document.getElementById('status').textContent = "Disconnected";
        scheduleReconnect();
    });
    websocket.addEventListener('error', (event) => {
        console.log("Websocket error:", event);
    });
}
function scheduleReconnect() {
    setTimeout(() => {
        console.log(`reconnecting (delay ${reconnectDelay}ms)`);
        connect();
        reconnectDelay = Math.min(reconnectDelay + 1000, MAX_RECONNECT_DELAY);
    }, reconnectDelay);
}
function validateElements() {
    for (const element of settingsElements) {
        if (!isNumeric(element.value)) {
            element.classList.add('invalid-input');
        } else {
            element.classList.remove('invalid-input');
        }
    }
}
function showTab(pageName, element) {

    document.querySelectorAll('.tab-content').forEach((tab) => {
        tab.style.display = 'none';
    })
    document.querySelectorAll('.tab-link').forEach((tablink) => {
        tablink.style.backgroundColor = "";
    })
    document.getElementById(pageName).style.display = "flex";
    element.style.backgroundColor = '#1c2024';
}
showTab('config', document.getElementById('tab-config'));
initTimer();