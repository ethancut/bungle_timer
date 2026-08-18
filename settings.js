const wsUri = "ws://localhost:8080/ws/settings";

const settingsElements = [
    document.getElementById('bits'),
    document.getElementById('subs'),
    document.getElementById('donations')
];
const values = { bits: 0, subs: 0, donations: 0 };
const keys = ['bits', 'subs', 'donations'];
const statusElement = document.getElementById('submit-status');
const timeEntryElement = document.getElementById('time-box');
const pauseElement = document.getElementById('pause-timer');
const addTypeElement = document.getElementById('add-type');
let websocket = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 10000;
function isNumeric(str) {
    if (typeof str != "string") return false;
    return !isNaN(str) && !isNaN(parseFloat(str));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function updateConfig(msg) {
    values.bits = msg.bits;
    values.subs = msg.subs;
    values.donations = msg.donations;
    settingsElements[0].value = msg.bits;
    settingsElements[1].value = msg.subs;
    settingsElements[2].value = msg.donations;
    validateElements();
}



function initTimer() {

    connect();
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
    document.getElementById('submit-config').addEventListener('click', (event) => {
        pushConfig();
    })

    validateElements();
}
function pushConfig() {
    if (websocket.readyState == WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'config', ...values }))
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
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
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

initTimer();